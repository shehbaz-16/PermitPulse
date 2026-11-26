import './env.js';
import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getDb, migrate } from './db.js';
import { seed } from './seed.js';
import { runSync, borrowRelatedValues } from './sync.js';
import { buildAlert } from './lib/alerts.js';
import { extractFacts, llmEnrich, aiEnabled } from './lib/enrich.js';
import { TRADES, CODES, LEAD_STATUSES, whyLead, priceCampaign, PRICING, tradeLabel, adHook, socialTargeting, SOCIAL_REQUEST_STATUSES, SOCIAL_ACCOUNT_STATUSES,
  DOORKNOCK_BLOCKED_TRADES, DOORKNOCK_CAUTION_TRADES, SECOND_UNIT_PATTERN } from './lib/mapping.js';
import { notifyTeam, sendEmail, alertEmailHtml, emailConfigured } from './lib/notify.js';
import { billingEnabled, billingMode, createCheckoutSession, getCheckoutSession, verifyWebhookSignature } from './lib/stripe.js';
import { ADDON_CITY_SLUGS } from './adapters/fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const app = express();
app.set('trust proxy', true); // behind Render/other hosts' HTTPS proxy, so Stripe redirects use https://

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

// Team-only endpoints (social request queue, data sync, demo-data switch). When TEAM_PASSWORD is set the browser asks
// for it (any username). Without it they stay open, which is fine locally but not on a public URL.
function teamOnly(req, res, next) {
  const password = process.env.TEAM_PASSWORD;
  if (!password) return next();
  const [scheme, encoded] = String(req.get('authorization') || '').split(' ');
  const given = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString('utf8').split(':').slice(1).join(':') : '';
  if (given && given === password) return next();
  res.set('WWW-Authenticate', 'Basic realm="PermitPulse team"').status(401).json({ error: 'Team password required' });
}
app.use(['/api/social-requests', '/api/sync'], (req, res, next) => (req.path.startsWith('/status') && req.method === 'GET' ? next() : teamOnly(req, res, next)));
app.put('/api/settings', teamOnly);

// Stripe webhook needs the raw body for signature verification, so it is registered before express.json().
app.post('/api/billing/webhook', express.raw({ type: 'application/json', limit: '512kb' }), wrap(async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return bad(res, 'Webhook secret not configured');
  const raw = req.body.toString('utf8');
  if (!verifyWebhookSignature(raw, req.get('stripe-signature'), secret)) return bad(res, 'Invalid signature');
  const event = JSON.parse(raw);
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    await applyPaidSession(event.data.object);
  }
  res.json({ received: true });
}));

app.use(express.json({ limit: '256kb' }));

/** Marks a campaign paid or activates a plan once Stripe confirms the Checkout Session. Idempotent. */
async function applyPaidSession(session) {
  const paid = session.payment_status === 'paid' || (session.mode === 'subscription' && session.status === 'complete');
  if (!paid) return { applied: false, reason: `payment ${session.payment_status}` };
  const db = await getDb();
  const m = session.metadata || {};
  if (m.kind === 'campaign') {
    const row = (await db.query(`UPDATE campaigns SET payment_status='paid' WHERE id=$1 AND stripe_session_id=$2 RETURNING id`, [Number(m.campaign_id), session.id])).rows[0];
    return { applied: Boolean(row), kind: 'campaign', id: Number(m.campaign_id) };
  }
  if (m.kind === 'plan' && PRICING.plans[m.plan]) {
    await db.query(`UPDATE contractors SET plan=$2, plan_status='active', stripe_customer_id=COALESCE($3, stripe_customer_id),
      stripe_subscription_id=COALESCE($4, stripe_subscription_id) WHERE id=$1`,
      [Number(m.contractor_id), m.plan, session.customer || null, session.subscription || null]);
    return { applied: true, kind: 'plan', plan: m.plan };
  }
  if (m.kind === 'trade_addon' && TRADES.some((t) => t.key === m.trade)) {
    // Guarded so a repeated verify/webhook for the same trade does not count the add-on twice.
    const row = (await db.query(
      `UPDATE contractors SET extra_trades = extra_trades + 1,
         trades = (CASE WHEN jsonb_array_length(trades) = 0 THEN jsonb_build_array(trade) ELSE trades END) || to_jsonb($2::text)
       WHERE id=$1 AND NOT ((CASE WHEN jsonb_array_length(trades) = 0 THEN jsonb_build_array(trade) ELSE trades END) ? $2) RETURNING id`,
      [Number(m.contractor_id), m.trade])).rows[0];
    return { applied: true, kind: 'trade_addon', trade: m.trade, already: !row };
  }
  return { applied: false, reason: 'unknown session' };
}

const appUrl = (req) => (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const cents = (n) => Math.round(n);

/** Setup-fee waiver: Pro includes N social campaigns per calendar month (Toronto time). */
async function socialIncludedRemaining(c) {
  const included = PRICING.socialIncludedPerMonth[c.plan] || 0;
  if (!included || c.plan_status !== 'active') return 0;
  const db = await getDb();
  const used = (await db.query(
    `SELECT count(*)::int AS n FROM social_requests WHERE contractor_id=$1 AND kind='social' AND management_cents=0 AND status <> 'cancelled'
       AND date_trunc('month', created_at AT TIME ZONE 'America/Toronto') = date_trunc('month', now() AT TIME ZONE 'America/Toronto')`, [c.id])).rows[0].n;
  return Math.max(0, included - used);
}

// ---------- helpers ------------------------------------------------------------------------------------------
async function cityOf(req) {
  const slug = String(req.query.city || req.body?.city || 'markham');
  const db = await getDb();
  const row = (await db.query('SELECT * FROM municipalities WHERE city_slug=$1', [slug])).rows[0];
  return row || null;
}
async function contractor() {
  const db = await getDb();
  return (await db.query('SELECT * FROM contractors ORDER BY id LIMIT 1')).rows[0];
}

const SORTS = {
  newest: 'p.filed_at DESC, p.id DESC',
  status_change: 'p.status_changed_at DESC, p.id DESC',
  value: 'p.est_value DESC NULLS LAST, p.filed_at DESC',
};

async function showDemo() {
  const db = await getDb();
  const v = (await db.query(`SELECT value FROM app_settings WHERE key='show_demo'`)).rows[0]?.value;
  return v === undefined ? true : v === true || v === 'true';
}

/** Which trades a contractor may see. Starter: chosen trades up to the plan limit + paid add-ons. Pro / no plan: all. */
function tradeAccess(c) {
  const included = PRICING.includedTrades[c.plan];
  const extra = c.extra_trades || 0;
  const valid = (k) => TRADES.some((t) => t.key === k);
  const chosen = (Array.isArray(c.trades) && c.trades.length ? c.trades : [c.trade]).filter(valid);
  if (c.plan_status !== 'active' || !included) return { all: true, trades: chosen, limit: null, included: null, extra };
  const limit = included + extra;
  return { all: false, trades: chosen.slice(0, limit), limit, included, extra };
}

function buildPermitQuery(q, municipalityId, contractorId, includeDemo = true, allowedTrades = null) {
  const params = [municipalityId, contractorId];
  const where = ['p.municipality_id = $1'];
  if (!includeDemo) where.push('p.is_demo = false');
  if (allowedTrades) {
    if (q.trade && q.trade !== 'all' && !allowedTrades.includes(q.trade)) where.push('false');
    else { params.push(JSON.stringify(allowedTrades)); where.push(`p.trades ?| ARRAY(SELECT jsonb_array_elements_text($${params.length}::jsonb))`); }
  }
  const add = (sql, val) => { params.push(val); where.push(sql.replaceAll('?', `$${params.length}`)); };
  if (q.trade && q.trade !== 'all') add('p.trades @> ?::jsonb', JSON.stringify([String(q.trade)]));
  if (q.neighbourhood && q.neighbourhood !== 'all') add('p.neighbourhood = ?', String(q.neighbourhood));
  if (q.code && q.code !== 'all') {
    if (q.code === 'HPRP') where.push(`p.permit_code IN ('HP','RP')`);
    else add('p.permit_code = ?', String(q.code));
  }
  if (q.status && q.status !== 'all') add('p.status = ?', String(q.status));
  if (q.units === '1') add('(p.scope ~* ? OR p.permit_type ~* ?)', SECOND_UNIT_PATTERN);
  if (q.lead_status && q.lead_status !== 'all') add(`COALESCE(ls.status,'new') = ?`, String(q.lead_status));
  if (q.bookmarked === '1') where.push('COALESCE(ls.bookmarked,false) = true');
  if (/^\d+$/.test(q.value_min || '')) add('p.est_value >= ?', Number(q.value_min));
  if (/^\d+$/.test(q.value_max || '')) add('p.est_value <= ?', Number(q.value_max));
  if (q.has_value === '1') where.push('p.est_value IS NOT NULL');
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.from || '')) add(`p.filed_at >= (?::date)::timestamptz`, q.from);
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.to || '')) add(`p.filed_at < ((?::date) + 1)::timestamptz`, q.to);
  if (q.q && String(q.q).trim()) {
    const like = `%${String(q.q).trim().replace(/[%_\\]/g, '\\$&')}%`;
    add(`(p.address ILIKE ? OR p.permit_number ILIKE ? OR p.scope ILIKE ? OR p.neighbourhood ILIKE ? OR p.permit_type ILIKE ?)`, like);
  }
  if (q.ids) {
    const ids = String(q.ids).split(',').map((x) => Number.parseInt(x, 10)).filter(Number.isInteger);
    where.push(ids.length ? `p.id IN (${ids.join(',')})` : 'false');
  }
  const order = SORTS[q.sort] || SORTS.newest;
  const sql = `SELECT p.*, COALESCE(ls.status,'new') AS lead_status, COALESCE(ls.bookmarked,false) AS bookmarked,
      COALESCE(ls.notes,'') AS notes
    FROM permits p
    LEFT JOIN lead_states ls ON ls.permit_id = p.id AND ls.contractor_id = $2
    WHERE ${where.join(' AND ')} ORDER BY ${order}`;
  return { sql, params };
}

const withWhy = (p, tradeKey) => ({ ...p, facts: extractFacts(p), why: whyLead(p.permit_code, tradeKey && (p.trades || []).includes(tradeKey) ? tradeKey : (p.trades || [])[0]) });

// ---------- bootstrap / meta ---------------------------------------------------------------------------------
app.get('/api/health', wrap(async (_req, res) => {
  const db = await getDb();
  const n = (await db.query('SELECT count(*)::int AS n FROM permits')).rows[0].n;
  res.json({ ok: true, database: db.kind, permits: n });
}));

app.get('/api/second-units', wrap(async (_req, res) => {
  const db = await getDb();
  const rows = (await db.query(`SELECT m.city_slug, m.name, count(p.id)::int AS n
    FROM municipalities m LEFT JOIN permits p ON p.municipality_id = m.id AND p.is_demo = false AND (p.scope ~* $1 OR p.permit_type ~* $1)
    WHERE m.status = 'active' GROUP BY m.city_slug, m.name, m.sort_order ORDER BY m.sort_order`, [SECOND_UNIT_PATTERN])).rows;
  res.json({ cities: rows, total: rows.reduce((s, r) => s + r.n, 0) });
}));

app.get('/api/meta', wrap(async (req, res) => {
  const db = await getDb();
  const city = await cityOf(req);
  if (!city) return bad(res, 'Unknown city', 404);
  const cities = (await db.query('SELECT city_slug, name, province, status FROM municipalities ORDER BY sort_order')).rows
    .map((c) => ({ ...c, addon: c.status !== 'active' && ADDON_CITY_SLUGS.has(c.city_slug) }));
  const demoOn = await showDemo();
  const curated = (await db.query('SELECT name, slug, adjacent FROM neighbourhoods WHERE municipality_id=$1 ORDER BY name', [city.id])).rows;
  const derived = (await db.query(
    `SELECT neighbourhood AS name FROM permits WHERE municipality_id=$1 AND neighbourhood IS NOT NULL AND ($2::boolean OR is_demo = false)
     GROUP BY neighbourhood ORDER BY count(*) DESC LIMIT 40`, [city.id, demoOn])).rows
    .map((r) => ({ name: r.name, slug: r.name.toLowerCase().replace(/\s+/g, '-'), adjacent: curated.find((c) => c.name === r.name)?.adjacent || [] }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const hoods = derived.length >= 3 || !curated.length ? derived : curated; // areas that appear in the visible permits; curated list as fallback
  const statuses = (await db.query('SELECT DISTINCT status FROM permits WHERE municipality_id=$1 AND ($2::boolean OR is_demo = false) ORDER BY status', [city.id, demoOn])).rows.map((r) => r.status);
  const kpi = (await db.query(`SELECT value FROM app_settings WHERE key='demo_kpis'`)).rows[0]?.value;
  res.json({
    city: { slug: city.city_slug, name: city.name, status: city.status, attribution: city.attribution, license: city.license_name },
    cities, neighbourhoods: hoods, statuses, trades: TRADES, codes: CODES, leadStatuses: LEAD_STATUSES,
    showDemo: demoOn, aiEnabled: aiEnabled(),
    billing: { enabled: billingEnabled(), mode: billingEnabled() ? billingMode() : null },
    tradeAccess: tradeAccess(await contractor()),
    socialIncludedRemaining: await socialIncludedRemaining(await contractor()), pricing: PRICING, demoKpis: kpi || { permitsThisWeek: 42, projectValue: 4800000 },
    contractor: await contractor(), database: db.kind,
  });
}));

app.get('/api/stats', wrap(async (req, res) => {
  const db = await getDb();
  const city = await cityOf(req);
  if (!city) return bad(res, 'Unknown city', 404);
  const r = (await db.query(
    `SELECT count(*)::int AS total,
       count(*) FILTER (WHERE filed_at >= now() - interval '7 days')::int AS week,
       COALESCE(sum(est_value) FILTER (WHERE filed_at >= now() - interval '7 days'),0)::float8 AS week_value,
       count(*) FILTER (WHERE filed_at >= now() - interval '3 days')::int AS fresh,
       count(*) FILTER (WHERE filed_at >= now() - interval '90 days')::int AS d90,
       COALESCE(sum(est_value) FILTER (WHERE filed_at >= now() - interval '90 days'),0)::float8 AS d90_value,
       count(*) FILTER (WHERE is_demo = false)::int AS real_count
     FROM permits WHERE municipality_id=$1 AND ($2::boolean OR is_demo = false)`, [city.id, await showDemo()])).rows[0];
  res.json({ total: r.total, thisWeek: r.week, thisWeekValue: r.week_value, fresh: r.fresh, last90: r.d90, last90Value: r.d90_value, realCount: r.real_count });
}));

// ---------- permits / leads ----------------------------------------------------------------------------------
app.get('/api/permits', wrap(async (req, res) => {
  const db = await getDb();
  const city = await cityOf(req);
  if (!city) return bad(res, 'Unknown city', 404);
  const c = await contractor();
  const access = tradeAccess(c);
  const { sql, params } = buildPermitQuery(req.query, city.id, c.id, await showDemo(), access.all ? null : access.trades);
  const rows = (await db.query(sql, params)).rows.map((p) => withWhy(p, req.query.trade));
  const locked = !access.all && Boolean(req.query.trade) && req.query.trade !== 'all' && !access.trades.includes(req.query.trade);
  res.json({ total: rows.length, items: rows, locked });
}));

app.get('/api/permits/:id(\\d+)', wrap(async (req, res) => {
  const db = await getDb();
  const c = await contractor();
  const r = (await db.query(
    `SELECT p.*, COALESCE(ls.status,'new') AS lead_status, COALESCE(ls.bookmarked,false) AS bookmarked, COALESCE(ls.notes,'') AS notes
     FROM permits p LEFT JOIN lead_states ls ON ls.permit_id=p.id AND ls.contractor_id=$2 WHERE p.id=$1`, [req.params.id, c.id])).rows[0];
  if (!r) return bad(res, 'Permit not found', 404);
  res.json(withWhy(r));
}));

app.post('/api/permits/:id(\\d+)/enrich', wrap(async (req, res) => {
  const db = await getDb();
  const p = (await db.query('SELECT * FROM permits WHERE id=$1', [req.params.id])).rows[0];
  if (!p) return bad(res, 'Permit not found', 404);
  if (p.enrichment && !req.body?.refresh) return res.json({ enrichment: p.enrichment, cached: true });
  if (!aiEnabled()) return bad(res, 'AI summaries are off. Add ANTHROPIC_API_KEY to your .env file and restart.', 501);
  try {
    const enrichment = await llmEnrich(p);
    await db.query('UPDATE permits SET enrichment=$2::jsonb WHERE id=$1', [p.id, JSON.stringify(enrichment)]);
    res.json({ enrichment, cached: false });
  } catch (e) { bad(res, e.message || 'AI request failed', 502); }
}));

const csvCell = (v) => {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const ymd = (d) => (d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }) : '');

app.get('/api/permits.csv', wrap(async (req, res) => {
  const db = await getDb();
  const city = await cityOf(req);
  if (!city) return bad(res, 'Unknown city', 404);
  const c = await contractor();
  const access = tradeAccess(c);
  const { sql, params } = buildPermitQuery(req.query, city.id, c.id, await showDemo(), access.all ? null : access.trades);
  const rows = (await db.query(sql, params)).rows;
  const head = ['permit_number', 'permit_code', 'permit_type', 'category', 'status', 'lead_status', 'filed_date', 'issue_date',
    'unit', 'street_number', 'street_name', 'municipality', 'province', 'postal_area_fsa', 'neighbourhood',
    'estimated_value_cad', 'scope_of_work', 'source'];
  const lines = [head.join(',')];
  for (const p of rows) {
    lines.push([p.permit_number, p.permit_code, p.permit_type, p.category, p.status, p.lead_status, ymd(p.filed_at), ymd(p.issued_at),
      p.unit, p.street_number, p.street_name, city.name, city.province, p.postal_fsa, p.neighbourhood, p.est_value, p.scope, p.source_key]
      .map(csvCell).join(','));
  }
  const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="permitpulse-${city.city_slug}-leads-${stamp}.csv"`);
  res.send('﻿' + lines.join('\r\n') + '\r\n');
}));

app.put('/api/leads/:permitId(\\d+)', wrap(async (req, res) => {
  const db = await getDb();
  const c = await contractor();
  const { status, bookmarked, notes } = req.body || {};
  if (status !== undefined && !LEAD_STATUSES.some((s) => s.key === status)) return bad(res, 'Invalid status');
  if (notes !== undefined && String(notes).length > 4000) return bad(res, 'Notes too long');
  const exists = (await db.query('SELECT 1 FROM permits WHERE id=$1', [req.params.permitId])).rows.length;
  if (!exists) return bad(res, 'Permit not found', 404);
  await db.query(
    `INSERT INTO lead_states (contractor_id, permit_id, status, bookmarked, notes)
     VALUES ($1,$2,COALESCE($3,'new'),COALESCE($4,false),COALESCE($5,''))
     ON CONFLICT (contractor_id, permit_id) DO UPDATE SET
       status = COALESCE($3, lead_states.status),
       bookmarked = COALESCE($4, lead_states.bookmarked),
       notes = COALESCE($5, lead_states.notes),
       updated_at = now()`,
    [c.id, req.params.permitId, status ?? null, typeof bookmarked === 'boolean' ? bookmarked : null, notes ?? null]);
  const r = (await db.query('SELECT status, bookmarked, notes FROM lead_states WHERE contractor_id=$1 AND permit_id=$2', [c.id, req.params.permitId])).rows[0];
  res.json({ lead_status: r.status, bookmarked: r.bookmarked, notes: r.notes });
}));

app.get('/api/settings', wrap(async (_req, res) => {
  const db = await getDb();
  const real = (await db.query('SELECT count(*)::int AS n FROM permits WHERE is_demo = false')).rows[0].n;
  res.json({ showDemo: await showDemo(), realCount: real });
}));
app.put('/api/settings', wrap(async (req, res) => {
  const db = await getDb();
  if (typeof req.body?.showDemo !== 'boolean') return bad(res, 'showDemo must be true or false');
  await db.query(`INSERT INTO app_settings (key, value) VALUES ('show_demo', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(req.body.showDemo)]);
  res.json({ showDemo: req.body.showDemo });
}));

// ---------- contractor profile -------------------------------------------------------------------------------
app.get('/api/contractor', wrap(async (_req, res) => res.json(await contractor())));
const cleanIg = (v) => {
  const t = String(v || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@/, '');
  return t === '' ? null : /^[A-Za-z0-9._]{1,30}$/.test(t) ? t : undefined;
};
const cleanFb = (v) => {
  const t = String(v || '').trim();
  if (!t) return null;
  const withScheme = /^(www\.)?(facebook\.com|fb\.com|fb\.me)\//i.test(t) ? `https://${t}` : t;
  if (/^https?:\/\//i.test(withScheme)) { try { const u = new URL(withScheme); return /(^|\.)(facebook\.com|fb\.com|fb\.me)$/i.test(u.hostname) && u.pathname.length > 1 ? `https://facebook.com${u.pathname.replace(/\/$/, '')}` : undefined; } catch { return undefined; } }
  return /^[\w.\-]{3,60}$/.test(t) ? `https://facebook.com/${t}` : undefined;
};
app.put('/api/contractor', wrap(async (req, res) => {
  const db = await getDb();
  const c = await contractor();
  const b = req.body || {};
  const sets = [], vals = [c.id];
  const set = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
  if (b.company_name !== undefined) { if (!String(b.company_name).trim() || String(b.company_name).length > 80) return bad(res, 'Company name must be 1-80 characters'); set('company_name', String(b.company_name).trim()); }
  if (b.trade !== undefined) { if (!TRADES.some((t) => t.key === b.trade)) return bad(res, 'Invalid service'); set('trade', b.trade); }
  if (b.instagram_handle !== undefined) { const v = cleanIg(b.instagram_handle); if (v === undefined) return bad(res, 'Instagram handle: letters, numbers, dots and underscores only (max 30)'); set('instagram_handle', v); }
  if (b.facebook_page !== undefined) { const v = cleanFb(b.facebook_page); if (v === undefined) return bad(res, 'Facebook: paste your Page link (facebook.com/yourpage) or page name'); set('facebook_page', v); }
  if (b.nextdoor_name !== undefined) { const v = String(b.nextdoor_name || '').trim().slice(0, 80); set('nextdoor_name', v || null); }
  if (!sets.length) return res.json(c);
  res.json((await db.query(`UPDATE contractors SET ${sets.join(', ')} WHERE id=$1 RETURNING *`, vals)).rows[0]);
}));

// ---------- campaigns (simulated dispatch) -------------------------------------------------------------------
app.get('/api/campaigns', wrap(async (req, res) => {
  const db = await getDb();
  const city = await cityOf(req);
  if (!city) return bad(res, 'Unknown city', 404);
  const rows = (await db.query(
    `SELECT c.*, p.permit_number, p.address, p.neighbourhood, p.permit_code, p.scope,
       r.id AS social_request_id, r.status AS social_request_status, r.duration_days AS social_duration_days, r.management_cents AS social_management_cents
     FROM campaigns c JOIN permits p ON p.id = c.permit_id
     LEFT JOIN social_requests r ON r.campaign_id = c.id
     WHERE c.municipality_id=$1 ORDER BY c.created_at DESC, c.id DESC`, [city.id])).rows;
  res.json({ total: rows.length, items: rows });
}));

app.post('/api/campaigns', wrap(async (req, res) => {
  const db = await getDb();
  const b = req.body || {};
  const c = await contractor();
  const permit = (await db.query('SELECT * FROM permits WHERE id=$1', [b.permitId])).rows[0];
  if (!permit) return bad(res, 'Permit not found', 404);
  if (!['postcard', 'letter'].includes(b.format)) return bad(res, 'Invalid format');
  const includeProperty = b.includeProperty !== false;
  const homes = Number(b.neighbourHomes || 0);
  if (!PRICING.neighbourOptions.includes(homes)) return bad(res, 'Invalid neighbour count');
  if (!includeProperty && homes === 0) return bad(res, 'Select at least one home to mail');
  const socialEnabled = Boolean(b.social?.enabled);
  const budget = Number(b.social?.budgetCents || 0);
  if (socialEnabled && (!Number.isInteger(budget) || budget < PRICING.socialBudgetMinCents || budget > PRICING.socialBudgetMaxCents)) {
    return bad(res, `Ad budget must be between $${PRICING.socialBudgetMinCents / 100} and $${(PRICING.socialBudgetMaxCents / 100).toLocaleString('en-CA')}`);
  }
  const duration = Number(b.social?.durationDays || PRICING.socialDurations[0]);
  if (socialEnabled && !PRICING.socialDurations.includes(duration)) return bad(res, 'Invalid campaign length');
  const accountStatus = SOCIAL_ACCOUNT_STATUSES.some((s) => s.key === b.social?.accountStatus) ? b.social.accountStatus : 'unsure';
  const socialNotes = String(b.social?.notes || '').trim().slice(0, 1000);
  const PLATFORMS = ['facebook', 'instagram', 'nextdoor'];
  const platforms = socialEnabled ? [...new Set((Array.isArray(b.social?.platforms) ? b.social.platforms : []).filter((x) => PLATFORMS.includes(x)))] : [];
  if (socialEnabled && !platforms.length) return bad(res, 'Pick at least one social platform');
  const postingAs = { facebook: c.facebook_page, instagram: c.instagram_handle && '@' + c.instagram_handle, nextdoor: c.nextdoor_name };
  const company = String(b.companyName || c.company_name).trim().slice(0, 80);
  const trade = TRADES.some((t) => t.key === b.trade) ? b.trade : c.trade;
  const managementWaived = socialEnabled && (await socialIncludedRemaining(c)) > 0;
  const price = priceCampaign({ includeProperty, neighbourHomes: homes, socialEnabled, socialBudgetCents: budget, managementWaived });
  const row = (await db.query(
    `INSERT INTO campaigns (municipality_id, contractor_id, permit_id, trade, company_name, format, include_property, neighbour_homes,
       mail_pieces, mail_cents, social_enabled, social_budget_cents, social_reach, subtotal_cents, tax_cents, total_cents,
       coupon_code, mail_status, social_status, social_platforms, posting_as)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21::jsonb) RETURNING *`,
    [permit.municipality_id, c.id, permit.id, trade, company, b.format, includeProperty, homes, price.pieces, price.mail,
      socialEnabled, price.social, price.reach, price.subtotal, price.tax, price.total,
      String(b.couponCode || 'SAVE15').slice(0, 24), 'Mail Queued for Print', socialEnabled ? SOCIAL_REQUEST_STATUSES[0].contractor : null,
      JSON.stringify(platforms), JSON.stringify(Object.fromEntries(platforms.map((p) => [p, postingAs[p] || null])))])).rows[0];

  let request = null;
  if (socialEnabled) {
    const city = (await db.query('SELECT name FROM municipalities WHERE id=$1', [permit.municipality_id])).rows[0];
    const area = permit.neighbourhood || city.name;
    request = (await db.query(
      `INSERT INTO social_requests (campaign_id, municipality_id, contractor_id, permit_id, platforms, ad_budget_cents, duration_days,
         management_cents, target_area, ad_copy, notes, account_status)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [row.id, permit.municipality_id, c.id, permit.id, JSON.stringify(platforms), budget, duration, price.management,
        area, adHook(trade, permit.permit_code, city.name), socialNotes, accountStatus])).rows[0];
    const notified = await notifyTeam({
      subject: `New social campaign request #${request.id}: ${company} · ${city.name}`,
      text: [
        `${company} (${tradeLabel(trade)}) requested a managed social campaign.`,
        `Permit: ${permit.address}, ${city.name} (${permit.permit_number}) · ${permit.scope}`,
        `Platforms: ${platforms.join(', ')}`,
        `Ad budget: $${(budget / 100).toFixed(2)} over ${duration} days (billed to the contractor's ad account)`,
        `Targeting: ${platforms.map((p) => `${p}: ${socialTargeting(p, area, city.name).short}`).join('; ')}`,
        `Voucher code: ${row.coupon_code}`,
        `Ad accounts: ${SOCIAL_ACCOUNT_STATUSES.find((s) => s.key === accountStatus).label}`,
        socialNotes ? `Notes: ${socialNotes}` : null,
        '',
        'Open PermitPulse → Social Requests to work on it.',
      ].filter((l) => l !== null).join('\n'),
    });
    await db.query('UPDATE social_requests SET notified=$2 WHERE id=$1', [request.id, notified]);
    request.notified = notified;
  }
  let checkoutUrl = null;
  if (billingEnabled()) {
    const item = (name, amount) => ({ quantity: 1, price_data: { currency: 'cad', unit_amount: cents(amount), product_data: { name } } });
    const lines = [
      price.mail > 0 && item(`Direct mail · ${price.pieces} ${b.format === 'postcard' ? 'postcards' : 'letters'} · ${permit.address}`, price.mail),
      price.management > 0 && item('Done-for-you social campaign setup', price.management),
      price.tax > 0 && item('HST (13%)', price.tax),
    ].filter(Boolean);
    const session = await createCheckoutSession({
      mode: 'payment',
      line_items: lines,
      allow_promotion_codes: true,
      customer_email: c.email || undefined,
      client_reference_id: String(row.id),
      metadata: { kind: 'campaign', campaign_id: String(row.id), contractor_id: String(c.id) },
      success_url: `${appUrl(req)}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}#/campaigns`,
      cancel_url: `${appUrl(req)}/app?checkout=cancelled#/campaigns`,
    });
    await db.query(`UPDATE campaigns SET payment_status='unpaid', stripe_session_id=$2 WHERE id=$1`, [row.id, session.id]);
    row.payment_status = 'unpaid'; row.stripe_session_id = session.id;
    checkoutUrl = session.url;
  }
  res.status(201).json({ ...row, social_request: request, checkout_url: checkoutUrl, management_waived: managementWaived,
    permit_number: permit.permit_number, address: permit.address, tradeLabel: tradeLabel(trade) });
}));

// ---------- billing (Stripe Checkout; demo mode when STRIPE_SECRET_KEY is not set) ---------------------------------
app.get('/api/billing/status', wrap(async (_req, res) => {
  const c = await contractor();
  res.json({ enabled: billingEnabled(), mode: billingEnabled() ? billingMode() : null, plan: c.plan, planStatus: c.plan_status,
    socialIncludedRemaining: await socialIncludedRemaining(c) });
}));

app.post('/api/billing/plan-checkout', wrap(async (req, res) => {
  const plan = PRICING.plans[req.body?.plan];
  if (!plan) return bad(res, 'Invalid plan');
  if (!billingEnabled()) return bad(res, 'Billing is not configured. Add STRIPE_SECRET_KEY to .env.', 409);
  const c = await contractor();
  const interval = req.body?.interval === 'year' ? 'year' : 'month';
  const amount = interval === 'year' ? plan.annualCents : plan.monthlyCents;
  const recurring = (name, value) => ({ quantity: 1, price_data: { currency: 'cad', unit_amount: cents(value), recurring: { interval }, product_data: { name } } });
  const session = await createCheckoutSession({
    mode: 'subscription',
    line_items: [recurring(`PermitPulse ${plan.name} (${interval === 'year' ? 'annual' : 'monthly'})`, amount), recurring('HST (13%)', amount * PRICING.hstRate)],
    customer_email: c.email || req.body?.email || undefined,
    allow_promotion_codes: true,
    metadata: { kind: 'plan', plan: req.body.plan, interval, contractor_id: String(c.id) },
    subscription_data: { trial_period_days: PRICING.trialDays, metadata: { kind: 'plan', plan: req.body.plan, interval, contractor_id: String(c.id) } },
    success_url: `${appUrl(req)}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}#/plans`,
    cancel_url: `${appUrl(req)}/app?checkout=cancelled#/plans`,
  });
  res.json({ url: session.url });
}));

// ---------- trades a contractor follows (Starter: 3 included, extra trades are a paid add-on) ---------------------
app.put('/api/contractor/trades', wrap(async (req, res) => {
  const db = await getDb();
  const c = await contractor();
  const trades = [...new Set((Array.isArray(req.body?.trades) ? req.body.trades : []).map(String))].filter((k) => TRADES.some((t) => t.key === k));
  if (!trades.length) return bad(res, 'Pick at least one service');
  const access = tradeAccess(c);
  if (!access.all && trades.length > access.limit) {
    return bad(res, `Your plan includes ${access.limit} service${access.limit === 1 ? '' : 's'}. Add another service for $${PRICING.extraTradeCents / 100}/month.`, 402);
  }
  const row = (await db.query('UPDATE contractors SET trades=$2::jsonb WHERE id=$1 RETURNING *', [c.id, JSON.stringify(trades)])).rows[0];
  res.json({ contractor: row, tradeAccess: tradeAccess(row) });
}));

app.post('/api/trades/addon', wrap(async (req, res) => {
  const db = await getDb();
  const c = await contractor();
  const trade = String(req.body?.trade || '');
  if (!TRADES.some((t) => t.key === trade)) return bad(res, 'Unknown service');
  const access = tradeAccess(c);
  if (access.all) return bad(res, c.plan_status === 'active' ? 'Your plan already includes every service' : 'Choose a plan first');
  if (access.trades.includes(trade)) return bad(res, 'You already follow this service');
  if (!billingEnabled()) {
    const row = (await db.query(
      `UPDATE contractors SET extra_trades = extra_trades + 1, trades = $2::jsonb WHERE id=$1 RETURNING *`,
      [c.id, JSON.stringify([...access.trades, trade])])).rows[0];
    return res.json({ demo: true, tradeAccess: tradeAccess(row) });
  }
  const amount = PRICING.extraTradeCents;
  const recurring = (name, cents_) => ({ quantity: 1, price_data: { currency: 'cad', unit_amount: Math.round(cents_), recurring: { interval: 'month' }, product_data: { name } } });
  const session = await createCheckoutSession({
    mode: 'subscription',
    line_items: [recurring(`Extra trade: ${tradeLabel(trade)}`, amount), recurring('HST (13%)', amount * PRICING.hstRate)],
    customer_email: c.email || undefined,
    metadata: { kind: 'trade_addon', trade, contractor_id: String(c.id) },
    subscription_data: { metadata: { kind: 'trade_addon', trade, contractor_id: String(c.id) } },
    success_url: `${appUrl(req)}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}#/plans`,
    cancel_url: `${appUrl(req)}/app?checkout=cancelled#/plans`,
  });
  res.json({ url: session.url });
}));

// Called when the contractor returns from Stripe. Works without a public webhook URL (e.g. on localhost).
app.get('/api/billing/verify', wrap(async (req, res) => {
  if (!billingEnabled()) return bad(res, 'Billing is not configured', 409);
  const id = String(req.query.session_id || '');
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return bad(res, 'Invalid session');
  res.json(await applyPaidSession(await getCheckoutSession(id)));
}));

// ---------- door-knock route sheet (printable, self-serve) ------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

app.get('/api/route-sheet', wrap(async (req, res) => {
  const db = await getDb();
  const city = await cityOf(req);
  if (!city) return bad(res, 'Unknown city', 404);
  const c = await contractor();
  const access = tradeAccess(c);
  const { sql, params } = buildPermitQuery({ ...req.query, sort: 'newest' }, city.id, c.id, await showDemo(), access.all ? null : access.trades);
  const rows = (await db.query(sql, params)).rows.slice(0, 200)
    .sort((a, b) => a.street_name.localeCompare(b.street_name) || (parseInt(a.street_number, 10) || 0) - (parseInt(b.street_number, 10) || 0));
  const trade = TRADES.some((t) => t.key === req.query.trade) ? req.query.trade : c.trade;
  const blocked = DOORKNOCK_BLOCKED_TRADES.includes(trade);
  const caution = DOORKNOCK_CAUTION_TRADES[trade];
  const byStreet = rows.reduce((m, p) => ((m[p.street_name] ||= []).push(p), m), {});
  const today = new Date().toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Toronto' });
  res.type('html').send(`<!doctype html><html lang="en-CA"><head><meta charset="utf-8"><title>Door-knock route · ${esc(city.name)}</title>
<style>
  body{font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2a37;margin:24px;max-width:1000px}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:18px 0 6px;color:#0f5f5c;border-bottom:1px solid #ddd;padding-bottom:4px}
  .meta{color:#666;margin-bottom:12px} .box{border:1px solid #e3e1da;background:#faf9f6;border-radius:8px;padding:10px 12px;margin:10px 0}
  .warn{border-color:#f0c36d;background:#fff8e6} table{width:100%;border-collapse:collapse} td,th{border-bottom:1px solid #eee;padding:6px 4px;text-align:left;vertical-align:top}
  th{font-size:11px;text-transform:uppercase;color:#777} .chk{width:60px;text-align:center} small{color:#777}
  button{padding:6px 12px;border:1px solid #0f5f5c;background:#0f5f5c;color:#fff;border-radius:6px;cursor:pointer}
  @media print{button{display:none} body{margin:10mm}}
</style></head><body>
<button onclick="window.print()">Print route sheet</button>
<h1>Door-knock route · ${esc(city.name)} · ${esc(tradeLabel(trade))}</h1>
<div class="meta">${esc(c.company_name)} · ${rows.length} permit${rows.length === 1 ? '' : 's'} · ${esc(today)} · Knock the permit home, then the neighbours on either side.</div>
${blocked ? `<div class="box warn"><b>Do not door-knock for this trade.</b> Ontario's Consumer Protection Act bans unsolicited door-to-door selling of furnaces, air conditioners, air cleaners and similar products. Use mail or social instead.</div>` : ''}
<div class="box"><b>What to say:</b> "Hi, I'm with ${esc(c.company_name)}. We're helping homeowners on this street with ${esc(tradeLabel(trade).toLowerCase())} this season. Are you planning any work like that in the next few months? Here's a free-quote card with a 15% voucher."
<br><small>Never mention that you saw their permit. Respect "No soliciting" signs, knock between 9 a.m. and 8 p.m., carry ID and your company card, check whether the city requires a canvassing licence, and leave if asked.${caution ? ` Do not offer ${esc(caution)} at the door.` : ''}</small></div>
${Object.entries(byStreet).map(([street, list]) => `<h2>${esc(street)} (${list.length})</h2>
<table><thead><tr><th>Address</th><th>Project (for your context only)</th><th class="chk">Knocked</th><th class="chk">Spoke</th><th class="chk">Card left</th><th>Notes / follow-up</th></tr></thead><tbody>
${list.map((p) => `<tr><td><b>${esc(p.address)}</b><br><small>${esc(p.neighbourhood || '')}</small></td><td>${esc(p.scope)}<br><small>${esc(whyLead(p.permit_code, (p.trades || []).includes(trade) ? trade : (p.trades || [])[0]))}</small></td><td class="chk">☐</td><td class="chk">☐</td><td class="chk">☐</td><td></td></tr>`).join('')}
</tbody></table>`).join('')}
${rows.length ? '' : '<p>No permits match. Select permits in the feed first.</p>'}
<p><small>Public permit records via BuildData. No homeowner names or contact details are included.</small></p>
</body></html>`);
}));

// ---------- managed social requests (fulfilled by hand by the PermitPulse team) ---------------------------------
// NOTE: no authentication in this demo. In production this team view must sit behind a staff login.
app.get('/api/social-requests', wrap(async (req, res) => {
  const db = await getDb();
  const params = [];
  let where = `WHERE r.kind = 'social'`;
  if (SOCIAL_REQUEST_STATUSES.some((s) => s.key === req.query.status)) { params.push(req.query.status); where += ' AND r.status = $1'; }
  const rows = (await db.query(
    `SELECT r.*, m.name AS city_name, m.city_slug, p.address, p.permit_number, p.scope, p.permit_type, p.street_name, p.lat, p.lng,
       c.company_name, c.trade, c.coupon_code, c.format, c.mail_pieces, c.posting_as, c.payment_status,
       k.email AS contractor_email, k.phone AS contractor_phone, k.facebook_page, k.instagram_handle, k.nextdoor_name
     FROM social_requests r
     JOIN municipalities m ON m.id = r.municipality_id
     JOIN permits p ON p.id = r.permit_id
     JOIN campaigns c ON c.id = r.campaign_id
     JOIN contractors k ON k.id = r.contractor_id
     ${where} ORDER BY (r.status = 'new') DESC, r.created_at DESC`, params)).rows
    .map((r) => ({ ...r, targeting: Object.fromEntries((r.platforms || []).map((p) => [p, socialTargeting(p, r.target_area, r.city_name).short])) }));
  const newCount = (await db.query(`SELECT count(*)::int AS n FROM social_requests WHERE kind='social' AND status='new'`)).rows[0].n;
  res.json({ total: rows.length, newCount, items: rows });
}));

app.put('/api/social-requests/:id(\\d+)', wrap(async (req, res) => {
  const db = await getDb();
  const b = req.body || {};
  const cur = (await db.query('SELECT * FROM social_requests WHERE id=$1', [req.params.id])).rows[0];
  if (!cur) return bad(res, 'Request not found', 404);
  const status = b.status === undefined ? cur.status : b.status;
  const st = SOCIAL_REQUEST_STATUSES.find((s) => s.key === status);
  if (!st) return bad(res, 'Invalid status');
  const notes = b.manager_notes === undefined ? cur.manager_notes : String(b.manager_notes).slice(0, 4000);
  const row = (await db.query(
    `UPDATE social_requests SET status=$2, manager_notes=$3, updated_at=now() WHERE id=$1 RETURNING *`, [cur.id, status, notes])).rows[0];
  await db.query('UPDATE campaigns SET social_status=$2 WHERE id=$1', [cur.campaign_id, st.contractor]);
  res.json(row);
}));

// ---------- alerts (simulated delivery) ----------------------------------------------------------------------
const NANP_AREA = new Set(['416', '647', '437', '905', '289', '365']);
const normPhone = (raw) => {
  const d = String(raw || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 && NANP_AREA.has(d.slice(0, 3)) ? d : null;
};
const fmtPhone = (d) => `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));

async function loadSub(cityId, contractorId) {
  const db = await getDb();
  return (await db.query('SELECT * FROM alert_subscriptions WHERE contractor_id=$1 AND municipality_id=$2', [contractorId, cityId])).rows[0] || null;
}

app.get('/api/alerts/subscription', wrap(async (req, res) => {
  const city = await cityOf(req);
  const c = await contractor();
  res.json((await loadSub(city.id, c.id)) || null);
}));

app.put('/api/alerts/subscription', wrap(async (req, res) => {
  const db = await getDb();
  const city = await cityOf(req);
  const c = await contractor();
  const b = req.body || {};
  const errors = {};
  const out = {
    email_enabled: !!b.email_enabled, email: String(b.email || '').trim(),
    sms_enabled: !!b.sms_enabled, sms_phone: null, wa_enabled: !!b.wa_enabled, wa_phone: null,
    trades: (Array.isArray(b.trades) ? b.trades : []).filter((t) => TRADES.some((x) => x.key === t)),
    neighbourhoods: Array.isArray(b.neighbourhoods) ? b.neighbourhoods.map(String).slice(0, 20) : [],
    frequency: b.frequency === 'instant' ? 'instant' : 'daily_7am',
  };
  if (out.email_enabled && !emailOk(out.email)) errors.email = 'Enter a valid email address';
  if (b.sms_phone) { const p = normPhone(b.sms_phone); if (p) out.sms_phone = fmtPhone(p); else if (out.sms_enabled) errors.sms_phone = 'Use a Toronto/GTA number: +1 (416), (647) or (905)'; }
  else if (out.sms_enabled) errors.sms_phone = 'Enter a mobile number';
  if (b.wa_phone) { const p = normPhone(b.wa_phone); if (p) out.wa_phone = fmtPhone(p); else if (out.wa_enabled) errors.wa_phone = 'Use a Toronto/GTA number: +1 (416), (647) or (905)'; }
  else if (out.wa_enabled) errors.wa_phone = 'Enter a WhatsApp number';
  if (Object.keys(errors).length) return res.status(422).json({ error: 'Please fix the highlighted fields', errors });
  const r = (await db.query(
    `INSERT INTO alert_subscriptions (contractor_id, municipality_id, email_enabled, email, sms_enabled, sms_phone, wa_enabled, wa_phone, trades, neighbourhoods, frequency)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)
     ON CONFLICT (contractor_id, municipality_id) DO UPDATE SET email_enabled=$3, email=$4, sms_enabled=$5, sms_phone=$6,
       wa_enabled=$7, wa_phone=$8, trades=$9::jsonb, neighbourhoods=$10::jsonb, frequency=$11, updated_at=now()
     RETURNING *`,
    [c.id, city.id, out.email_enabled, out.email, out.sms_enabled, out.sms_phone, out.wa_enabled, out.wa_phone,
      JSON.stringify(out.trades), JSON.stringify(out.neighbourhoods), out.frequency])).rows[0];
  res.json(r);
}));

app.post('/api/alerts/preview', wrap(async (req, res) => {
  const db = await getDb();
  const city = await cityOf(req);
  const c = await contractor();
  const sub = (await loadSub(city.id, c.id)) || { trades: [], neighbourhoods: [], frequency: 'daily_7am', email_enabled: false, sms_enabled: false, wa_enabled: false };
  // Allow the UI to preview unsaved form state.
  const b = req.body || {};
  const eff = {
    ...sub,
    trades: Array.isArray(b.trades) ? b.trades : sub.trades,
    neighbourhoods: Array.isArray(b.neighbourhoods) ? b.neighbourhoods : sub.neighbourhoods,
    frequency: b.frequency || sub.frequency,
  };
  const trades = eff.trades?.length ? eff.trades : [c.trade];
  const hoods = eff.neighbourhoods || [];
  const q = { sort: 'newest' };
  const incl = await showDemo();
  const { sql, params } = buildPermitQuery(q, city.id, c.id, incl);
  let rows = (await db.query(sql, params)).rows.filter((p) => p.filed_at && Date.now() - new Date(p.filed_at).getTime() < 14 * 86400000);
  rows = rows.filter((p) => (p.trades || []).some((t) => trades.includes(t)) && (!hoods.length || hoods.includes(p.neighbourhood)));
  if (!rows.length) rows = (await db.query(buildPermitQuery(q, city.id, c.id, incl).sql, params)).rows.slice(0, 3);
  const content = buildAlert({ permits: rows, sub: { ...eff, trades }, contractor: c, cityName: city.name, license: city.license_name || undefined });

  const channels = [];
  if (b.send !== false) {
    const log = async (channel, recipient, subject, body, status = 'simulated_sent') => {
      await db.query(`INSERT INTO alert_log (contractor_id, channel, recipient, subject, body, status) VALUES ($1,$2,$3,$4,$5,$6)`, [c.id, channel, recipient, subject, body, status]);
      channels.push(channel);
    };
    const emailBody = `${content.email.intro}\n\n${content.email.items.map((i) => `${i.permit_number} · ${i.address} · ${i.value}\n${i.scope}\n${i.why}`).join('\n\n')}\n\nEstimated project value: ${content.email.total}\n\n${content.email.footer}`;
    if (sub.email_enabled && sub.email) {
      const status = await sendEmail({ to: sub.email, subject: content.email.subject, text: emailBody, html: alertEmailHtml(content.email) });
      await log('email', sub.email, content.email.subject, emailBody, status === 'emailed' ? 'emailed' : status === 'not_configured' ? 'simulated_sent' : status);
      content.emailStatus = status;
    }
    if (sub.sms_enabled && sub.sms_phone) await log('sms', sub.sms_phone, null, content.sms);
    if (sub.wa_enabled && sub.wa_phone) await log('whatsapp', sub.wa_phone, null, content.whatsapp);
  }
  res.json({ ...content, simulatedChannels: channels, recipients: { email: sub.email || '', sms: sub.sms_phone || '', whatsapp: sub.wa_phone || '' } });
}));

app.get('/api/alerts/log', wrap(async (_req, res) => {
  const db = await getDb();
  const c = await contractor();
  const rows = (await db.query('SELECT id, channel, recipient, subject, status, created_at FROM alert_log WHERE contractor_id=$1 ORDER BY created_at DESC, id DESC LIMIT 20', [c.id])).rows;
  res.json({ items: rows });
}));

// ---------- territory plans / waitlist -----------------------------------------------------------------------
app.get('/api/territory', wrap(async (req, res) => {
  const db = await getDb();
  const city = await cityOf(req);
  const rows = (await db.query('SELECT trade, total_slots, claimed FROM territory_slots WHERE municipality_id=$1', [city.id])).rows;
  res.json({ items: rows.map((r) => ({ ...r, label: tradeLabel(r.trade), remaining: r.total_slots - r.claimed })) });
}));

app.post('/api/territory/reserve', wrap(async (req, res) => {
  const db = await getDb();
  const city = await cityOf(req);
  const b = req.body || {};
  if (!['starter', 'pro'].includes(b.plan)) return bad(res, 'Invalid plan');
  if (!TRADES.some((t) => t.key === b.trade)) return bad(res, 'Choose a service');
  if (!emailOk(b.email)) return bad(res, 'Enter a valid email');
  const hoods = (Array.isArray(b.neighbourhoods) ? b.neighbourhoods : []).map(String).slice(0, 3);
  const followed = [...new Set([b.trade, ...(Array.isArray(b.trades) ? b.trades : [])].map(String))]
    .filter((k) => TRADES.some((t) => t.key === k)).slice(0, PRICING.includedTrades[b.plan] || TRADES.length);
  await db.query(`UPDATE contractors SET trades=$1::jsonb WHERE id=(SELECT id FROM contractors ORDER BY id LIMIT 1)`, [JSON.stringify(followed)]);
  if (b.plan === 'pro' && !hoods.length) return bad(res, 'Pick up to 3 neighbourhoods');
  let outcome = 'starter_subscribed_demo';
  if (b.plan === 'pro') {
    const claim = (await db.query(
      `UPDATE territory_slots SET claimed = claimed + 1 WHERE municipality_id=$1 AND trade=$2 AND claimed < total_slots RETURNING claimed, total_slots`,
      [city.id, b.trade])).rows[0];
    outcome = claim ? 'pro_territory_reserved' : 'pro_waitlisted_trade_full';
  }
  await db.query(
    `INSERT INTO territory_requests (municipality_id, kind, plan, trade, neighbourhoods, company_name, email, outcome) VALUES ($1,'plan',$2,$3,$4::jsonb,$5,$6,$7)`,
    [city.id, b.plan, b.trade, JSON.stringify(hoods), String(b.company || '').slice(0, 80), String(b.email).trim(), outcome]);
  await notifyTeam({
    subject: `New ${PRICING.plans[b.plan].name} sign-up: ${String(b.company || 'Unnamed company').slice(0, 80)} · ${city.name}`,
    text: [`Company: ${b.company || '(not given)'}`, `Email: ${String(b.email).trim()}`, `Plan: ${PRICING.plans[b.plan].name}`,
      `City: ${city.name}`, `Services: ${followed.map(tradeLabel).join(', ')}`, hoods.length ? `Neighbourhoods: ${hoods.join(', ')}` : null,
      `Outcome: ${outcome.replace(/_/g, ' ')}`].filter(Boolean).join('\n'),
  });
  const granted = outcome === 'starter_subscribed_demo' || outcome === 'pro_territory_reserved';
  if (granted && !billingEnabled()) { // demo mode: activate the plan immediately; with Stripe it activates after payment
    await db.query(`UPDATE contractors SET plan=$1, plan_status='active' WHERE id=(SELECT id FROM contractors ORDER BY id LIMIT 1)`, [b.plan]);
  }
  res.status(201).json({ outcome, billing: billingEnabled() && granted });
}));

app.post('/api/waitlist', wrap(async (req, res) => {
  const db = await getDb();
  const b = req.body || {};
  const city = (await db.query('SELECT * FROM municipalities WHERE city_slug=$1', [b.city_slug])).rows[0];
  if (!city) return bad(res, 'Unknown city', 404);
  if (city.status === 'active') return bad(res, 'This city is already active');
  if (!TRADES.some((t) => t.key === b.trade)) return bad(res, 'Choose your service');
  if (!emailOk(b.email)) return bad(res, 'Enter a valid email');
  await db.query(
    `INSERT INTO territory_requests (municipality_id, kind, trade, company_name, email, outcome) VALUES ($1,'waitlist',$2,$3,$4,'waitlisted')`,
    [city.id, b.trade, String(b.company || '').slice(0, 80), String(b.email).trim()]);
  const position = (await db.query(`SELECT count(*)::int AS n FROM territory_requests WHERE municipality_id=$1 AND kind='waitlist' AND trade=$2`, [city.id, b.trade])).rows[0].n;
  await notifyTeam({
    subject: `Waitlist sign-up: ${String(b.company || 'Unnamed company').slice(0, 80)} · ${city.name}`,
    text: `Company: ${b.company || '(not given)'}\nEmail: ${String(b.email).trim()}\nCity: ${city.name}\nService: ${tradeLabel(b.trade)}\nPosition: #${position}`,
  });
  res.status(201).json({ ok: true, city: city.name, position });
}));

app.post('/api/cities/addon', wrap(async (req, res) => {
  const db = await getDb();
  const b = req.body || {};
  const city = (await db.query('SELECT * FROM municipalities WHERE city_slug=$1', [b.city_slug])).rows[0];
  if (!city || !ADDON_CITY_SLUGS.has(city.city_slug)) return bad(res, 'This city is not available as an add-on', 404);
  if (!emailOk(b.email)) return bad(res, 'Enter a valid email');
  const trade = TRADES.some((t) => t.key === b.trade) ? b.trade : null;
  await db.query(
    `INSERT INTO territory_requests (municipality_id, kind, plan, trade, company_name, email, outcome) VALUES ($1,'plan','city_addon',$2,$3,$4,'city_addon_requested_demo')`,
    [city.id, trade, String(b.company || '').slice(0, 80), String(b.email).trim()]);
  await notifyTeam({
    subject: `Add-on city request: ${city.name} · ${String(b.company || 'Unnamed company').slice(0, 80)}`,
    text: `Company: ${b.company || '(not given)'}\nEmail: ${String(b.email).trim()}\nCity: ${city.name} ($${PRICING.extraCityCents / 100}/month)\nService: ${trade ? tradeLabel(trade) : '(not given)'}`,
  });
  res.status(201).json({ ok: true, city: city.name, monthlyCents: PRICING.extraCityCents });
}));

// ---------- sync ---------------------------------------------------------------------------------------------
app.get('/api/sync/status', wrap(async (req, res) => {
  const db = await getDb();
  const city = await cityOf(req);
  const sources = (await db.query(
    `SELECT source_key, name, kind, description, last_sync_at, last_mode, last_status, last_message, record_count
     FROM data_sources WHERE municipality_id=$1 ORDER BY id`, [city.id])).rows;
  const runs = (await db.query(
    `SELECT id, source_key, started_at, finished_at, mode, status, fetched, upserted, message
     FROM sync_runs WHERE municipality_id=$1 ORDER BY id DESC LIMIT 12`, [city.id])).rows;
  const total = (await db.query('SELECT count(*)::int AS n FROM permits WHERE municipality_id=$1', [city.id])).rows[0].n;
  res.json({ sources, runs, total, database: db.kind, attribution: city.attribution, license: city.license_name,
    live: { builddata: Boolean(process.env.BUILDDATA_API_KEY), arcgis: Boolean(process.env.MARKHAM_ARCGIS_TREE_URL || process.env.MARKHAM_ARCGIS_DEVAPP_URL), eplan: Boolean(process.env.MARKHAM_EPLAN_JSON_URL) } });
}));

// Refreshes every live city. Meant for a daily scheduler (see .github/workflows/daily-sync.yml).
app.post('/api/sync/all', wrap(async (_req, res) => {
  const db = await getDb();
  const cities = (await db.query(`SELECT city_slug FROM municipalities WHERE status='active' ORDER BY sort_order`)).rows;
  const results = {};
  for (const c of cities) results[c.city_slug] = await runSync({ citySlug: c.city_slug, sourceKey: 'builddata' });
  res.json({ results });
}));

app.post('/api/sync', wrap(async (req, res) => {
  const city = await cityOf(req);
  if (!city || city.status !== 'active') return bad(res, 'City is not active');
  const results = await runSync({ citySlug: city.city_slug, sourceKey: req.body?.source || null });
  res.json({ results });
}));

// ---------- public landing for the QR code on mailers --------------------------------------------------------
app.get('/offer/:code', (req, res) => {
  const code = String(req.params.code).replace(/[^\w-]/g, '').slice(0, 24).toUpperCase();
  res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offer ${code}</title><body style="font-family:system-ui;background:#0F172A;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px">
<div><div style="font-size:14px;letter-spacing:.12em;color:#F59E0B;font-weight:700">PERMITPULSE ONTARIO · DEMO LANDING PAGE</div>
<h1 style="font-size:40px;margin:12px 0">Your code: <span style="color:#10B981">${code}</span></h1>
<p style="max-width:440px;opacity:.8;line-height:1.5">In production, scanning the mailer QR code lands the homeowner on the contractor's tracked quote page, so every postcard is attributable to a lead.</p></div>`);
});

// ---------- static -------------------------------------------------------------------------------------------
app.get('/shared/mapping.js', (_req, res) => res.sendFile(path.join(root, 'server/lib/mapping.js')));
app.get('/vendor/preact.js', (_req, res) => res.sendFile(path.join(root, 'node_modules/htm/preact/standalone.module.js')));
app.use('/vendor/leaflet', express.static(path.join(root, 'node_modules/leaflet/dist')));
app.get('/vendor/qrcode.js', (_req, res) => res.sendFile(path.join(root, 'node_modules/qrcode-generator/dist/qrcode.mjs')));
const siteUrl = (req) => (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
app.get('/robots.txt', (req, res) => res.type('text/plain').send(
  `User-agent: *\nDisallow: /app\nDisallow: /api/\nDisallow: /offer/\n\nSitemap: ${siteUrl(req)}/sitemap.xml\n`));
app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteUrl(req)}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n`));
app.get('/', (_req, res) => res.sendFile(path.join(root, 'public/landing.html')));
app.use(express.static(path.join(root, 'public'), { extensions: ['html'], index: false }));
app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(root, 'public/index.html')));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server', detail: process.env.NODE_ENV === 'production' ? undefined : String(err.message || err) });
});

export async function start(port = Number(process.env.PORT || 3000)) {
  const db = await migrate();
  const has = (await db.query('SELECT count(*)::int AS n FROM permits')).rows[0].n;
  if (!has) { console.log('Empty database detected, seeding demo data…'); await seed({ quiet: false }); }
  let borrowed = 0;
  for (const m of (await db.query('SELECT id FROM municipalities')).rows) borrowed += await borrowRelatedValues(m.id);
  if (borrowed) console.log(`  ${borrowed} permit value(s) borrowed from related permits`);
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`\n  PermitPulse Ontario  →  http://localhost:${port}\n  Database: ${db.kind}\n`);
      resolve(server);
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) start();
export default app;
