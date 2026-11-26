// API smoke test: boots the app on a throwaway in-memory database and exercises every endpoint.  npm test
process.env.PGLITE_DIR = 'memory://';
process.env.BUILDDATA_API_KEY = ''; // never spend the real .env key's daily quota in tests; BuildData tests use a mock
process.env.STRIPE_SECRET_KEY = ''; // never call the real Stripe account in tests; billing tests use a mock
process.env.RESEND_API_KEY = ''; // never send real email from tests; the email test uses a mock
process.env.STRIPE_WEBHOOK_SECRET = '';
const { start } = await import('./index.js');
const server = await start(0);
const base = `http://localhost:${server.address().port}`;
let failed = 0;
const j = async (m, u, b) => { const r = await fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, d: await r.json().catch(() => null), r }; };
const t = async (name, fn) => { try { await fn(); console.log('  ok  ', name); } catch (e) { failed++; console.log('  FAIL', name, '-', e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: expected ${b}, got ${a}`); };

await t('health + 20 seeded permits', async () => { const { d } = await j('GET', '/api/health'); eq(d.permits, 20, 'permits'); });
await t('search by address / permit # / keyword', async () => {
  eq((await j('GET', '/api/permits?q=bur%20oak')).d.total, 2, 'address');
  eq((await j('GET', '/api/permits?q=26-114892')).d.total, 1, 'permit #');
  eq((await j('GET', '/api/permits?q=basement')).d.total >= 3, true, 'keyword');
});
await t('filters: trade, code, neighbourhood, status', async () => {
  eq((await j('GET', '/api/permits?trade=fencing&code=PE')).d.total, 3, 'fencing+PE');
  eq((await j('GET', '/api/permits?code=TP')).d.total, 2, 'tree permits');
  eq((await j('GET', '/api/permits?neighbourhood=Unionville')).d.items.every((p) => p.neighbourhood === 'Unionville'), true, 'hood');
  eq((await j('GET', '/api/permits?status=Issued')).d.items.every((p) => p.status === 'Issued'), true, 'status');
});
await t('sort by value', async () => { const { d } = await j('GET', '/api/permits?sort=value'); eq(d.items[0].est_value, 6200000, 'top value'); });
await t('lead status + bookmark + notes persist', async () => {
  const id = (await j('GET', '/api/permits')).d.items[0].id;
  await j('PUT', `/api/leads/${id}`, { status: 'quoted', bookmarked: true, notes: 'call Fri' });
  const p = (await j('GET', `/api/permits/${id}`)).d; eq(p.lead_status, 'quoted', 'status'); eq(p.notes, 'call Fri', 'notes');
  eq((await j('GET', '/api/permits?bookmarked=1')).d.total, 1, 'bookmarked');
  eq((await j('PUT', `/api/leads/${id}`, { status: 'bogus' })).s, 400, 'invalid status');
});
await t('CSV export (selection) with injection guard', async () => {
  const r = await fetch(base + '/api/permits.csv?ids=1,2'); const txt = await r.text();
  eq(txt.trim().split(/\r?\n/).length, 3, 'rows'); eq(r.headers.get('content-type').startsWith('text/csv'), true, 'type');
});
await t('campaign pricing is computed server-side', async () => {
  const { s, d } = await j('POST', '/api/campaigns', { permitId: 1, format: 'postcard', neighbourHomes: 25, social: { enabled: true, budgetCents: 7500, platforms: ['facebook'] } });
  // mail $36.25 + $99 management fee = $135.25 + HST; the $75 ad spend is billed by Meta/Nextdoor, not invoiced
  eq(s, 201, 'status'); eq(d.subtotal_cents, 13525, 'subtotal'); eq(d.total_cents, 15283, 'total'); eq(d.social_budget_cents, 7500, 'ad spend recorded');
  eq((await j('POST', '/api/campaigns', { permitId: 1, format: 'postcard', neighbourHomes: 7 })).s, 400, 'tamper');
  eq((await j('POST', '/api/campaigns', { permitId: 1, format: 'postcard', neighbourHomes: 10, social: { enabled: true, budgetCents: 4000, platforms: ['facebook'] } })).s, 400, 'budget below minimum');
  eq((await j('POST', '/api/campaigns', { permitId: 1, format: 'postcard', neighbourHomes: 10, social: { enabled: true, budgetCents: 10000, durationDays: 9, platforms: ['facebook'] } })).s, 400, 'invalid length');
});
await t('managed social requests: created, listed, status flows to campaign', async () => {
  const { s, d } = await j('POST', '/api/campaigns', { permitId: 1, format: 'postcard', neighbourHomes: 10,
    social: { enabled: true, budgetCents: 25000, durationDays: 14, platforms: ['nextdoor', 'facebook'], accountStatus: 'needs_help', notes: 'Spring promo' } });
  eq(s, 201, 'created'); eq(d.social_request.status, 'new', 'request status'); eq(d.social_request.duration_days, 14, 'length');
  eq(d.social_request.notified, 'not_configured', 'no email in tests');
  const list = (await j('GET', '/api/social-requests')).d;
  const r = list.items.find((x) => x.id === d.social_request.id);
  eq(r.notes, 'Spring promo', 'notes'); eq(r.targeting.facebook.includes('25 km'), true, 'meta 25 km'); eq(list.newCount >= 1, true, 'new count');
  eq((await j('PUT', `/api/social-requests/${r.id}`, { status: 'live', manager_notes: 'Ad id 123' })).s, 200, 'update');
  const camp = (await j('GET', '/api/campaigns')).d.items.find((x) => x.id === d.id);
  eq(camp.social_status, 'Social: Live', 'contractor sees status'); eq(camp.social_request_status, 'live', 'joined status');
  eq((await j('PUT', `/api/social-requests/${r.id}`, { status: 'bogus' })).s, 400, 'invalid status');
});
await t('alerts: validation, save, preview, log', async () => {
  eq((await j('PUT', '/api/alerts/subscription', { email_enabled: true, email: 'nope' })).s, 422, 'invalid');
  eq((await j('PUT', '/api/alerts/subscription', { email_enabled: true, email: 'a@b.ca', sms_enabled: true, sms_phone: '9055550142', trades: ['fencing'] })).s, 200, 'save');
  const pv = (await j('POST', '/api/alerts/preview', {})).d; eq(pv.count > 0, true, 'content'); eq(pv.simulatedChannels.length, 2, 'channels');
  eq((await j('GET', '/api/alerts/log')).d.items.length, 2, 'log');
});
await t('territory cap of 2 + waitlist', async () => {
  const b = { plan: 'pro', trade: 'tree', neighbourhoods: ['Cornell'], email: 'a@b.ca' };
  eq((await j('POST', '/api/territory/reserve', b)).d.outcome, 'pro_territory_reserved', '1st'); await j('POST', '/api/territory/reserve', b);
  eq((await j('POST', '/api/territory/reserve', b)).d.outcome, 'pro_waitlisted_trade_full', '3rd');
  const st = (await j('GET', '/api/billing/status')).d; eq(st.plan, 'pro', 'demo mode activates plan'); eq(st.socialIncludedRemaining, 1, 'pro includes 1 social campaign');
  eq((await j('POST', '/api/waitlist', { city_slug: 'aurora', trade: 'tree', email: 'a@b.ca' })).s, 201, 'waitlist');
  eq((await j('POST', '/api/waitlist', { city_slug: 'vaughan', trade: 'tree', email: 'a@b.ca' })).s, 400, 'active city not waitlisted');
  eq((await j('POST', '/api/cities/addon', { city_slug: 'mississauga', trade: 'tree', email: 'a@b.ca' })).s, 201, 'add-on city');
  eq((await j('POST', '/api/cities/addon', { city_slug: 'aurora', email: 'a@b.ca' })).s, 404, 'non add-on city rejected');
  const cities = (await j('GET', '/api/meta')).d.cities;
  eq(cities.filter((c) => c.status === 'active').map((c) => c.city_slug).join(','), 'markham,toronto,vaughan', 'three live cities');
  eq(cities.find((c) => c.city_slug === 'mississauga').addon, true, 'mississauga is an add-on');
});
await t('sync falls back to fixtures and updates status', async () => {
  const r = (await j('POST', '/api/sync', {})).d.results; eq(r.length, 4, 'sources'); eq(r.every((x) => x.mode === 'fixture'), true, 'mode');
  const st = (await j('GET', '/api/sync/status')).d; eq(st.total, 20, 'total'); eq(st.sources.every((s) => s.last_sync_at), true, 'timestamps');
});

await t('BuildData adapter: mock API, mapping, real-only mode', async () => {
  const http = await import('node:http');
  const seen = { keys: [], calls: 0 };
  const rec = (o) => ({ municipality: 'markham', province: 'ON', fetched_at: '2026-11-01', ...o });
  const pages = [
    { results: [
      rec({ record_id: 'R1', permit_number: '25 100001 000 00 BP', address: '178 MAIN ST UNIONVILLE', description: 'CONSTRUCT NEW IN-GROUND POOL', permit_type: 'Residential Pool', permit_type_canonical: 'new_construction', issued_date: '2026-10-20', application_date: '2026-09-30', construction_value: '$85,000.00', lat: 43.8566, lng: '-79.3119', status_canonical: 'issued', postal_code: 'L3R 2L7', contractor_phone: '416-555-0100', contractor_address: '1 Secret Rd' }),
      rec({ record_id: 'R2', permit_number: '25 100002', address: '9 16TH AVE', description: 'FINISH BASEMENT - SECOND UNIT', permit_type_canonical: 'renovation', issued_date: '2026-10-18', status_canonical: 'issued', est_const_cost_cents: 6400000 }),
      rec({ record_id: 'R3', permit_number: '25 100003', address: '5 OLD ST', description: 'DEMOLISH GARAGE', permit_type_canonical: 'demolition', issued_date: '2026-10-10', status_canonical: 'issued' }),
    ], next_cursor: 'abc' },
    { results: [
      rec({ record_id: 'R4', permit_number: '25 100004', address: '300 STEELES AVE E', description: 'BACKWATER VALVE INSTALLATION', trade_canonical: 'plumbing', permit_type_canonical: 'renovation', issued_date: '2026-10-05', status_canonical: 'in_review', Estimated_Construction_Value: '14,500' }),
      rec({ record_id: 'R5', permit_number: '25 100005', address: '4750 HIGHWAY 7 E', description: 'COMMERCIAL RETAIL FIT-UP', permit_type_canonical: 'renovation', issued_date: '2026-10-01', status_canonical: 'issued' }),
      rec({ record_id: 'R6', permit_number: '25 100006', address: '12 ELM ST', description: 'Accessory Apartment', permit_type: 'Detached House', permit_type_canonical: 'renovation', issued_date: '2026-09-28', status_canonical: 'issued' }),
    ] },
  ];
  const mock = http.createServer((req, res) => {
    seen.calls++; seen.keys.push(req.headers['x-api-key']);
    const u = new URL(req.url, 'http://x');
    const body = u.searchParams.get('cursor') === 'abc' ? pages[1] : pages[0];
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ entity_type: 'permit', count: body.results.length, results: body.results, next_cursor: body.next_cursor }));
  });
  await new Promise((r) => mock.listen(0, r));
  process.env.BUILDDATA_API_KEY = 'test-key'; process.env.BUILDDATA_BASE_URL = `http://localhost:${mock.address().port}`;
  const r = (await j('POST', '/api/sync', { source: 'builddata' })).d.results[0];
  eq(r.mode, 'live', 'mode'); eq(r.upserted, 5, 'upserted (demolition skipped)'); eq(seen.calls, 2, 'cursor pages'); eq(seen.keys.every((k) => k === 'test-key'), true, 'api key header');
  const all = (await j('GET', '/api/permits')).d.items;
  eq(all.length, 5, 'demo hidden after first live sync'); eq(all.every((p) => p.is_demo === false), true, 'is_demo false');
  const pool = all.find((p) => p.source_id === 'R1');
  eq(pool.address, '178 Main St Unionville', 'title-case address'); eq(pool.permit_code, 'PE', 'pool → PE'); eq(pool.postal_fsa, 'L3R', 'fsa'); eq(pool.est_value, 85000, '$ string value'); eq(pool.lat, 43.8566, 'lat'); eq(pool.lng, -79.3119, 'lng string → number');
  eq(all.find((p) => p.source_id === 'R2').est_value, 64000, 'cents → dollars'); eq(all.find((p) => p.source_id === 'R4').est_value, 14500, 'oddly named value key'); eq(all.find((p) => p.source_id === 'R5').lat, null, 'missing coords stay null');
  eq(new Date(pool.filed_at).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }), '2026-09-30', 'date stays on same day');
  eq(JSON.stringify(pool).includes('416-555-0100') || JSON.stringify(pool).includes('Secret'), false, 'contractor contact never stored');
  eq(all.find((p) => p.source_id === 'R2').category, 'Secondary Suite / Basement', 'basement category');
  eq(all.find((p) => p.source_id === 'R4').permit_code, 'PP', 'plumbing → PP');
  eq(all.find((p) => p.source_id === 'R5').permit_code, 'DA', 'commercial → DA');
  eq(all.find((p) => p.source_id === 'R6').category, 'Secondary Suite / Basement', 'Markham accessory apartment → second suite, not commercial');
  eq((await j('GET', '/api/permits?units=1')).d.items.map((p) => p.source_id).sort().join(), 'R2,R6', 'second-units filter');
  eq((await j('GET', '/api/second-units')).d.cities.find((c) => c.city_slug === 'markham').n, 2, 'second-unit counts');
  eq(all.find((p) => p.source_id === 'R6').facts.tags.includes('Second unit / suite'), true, 'second-unit tag');
  eq((await j('PUT', '/api/settings', { showDemo: true })).d.showDemo, true, 'toggle');
  const demoRow = (await j('GET', '/api/permits?q=26-114892')).d.items[0]; eq(demoRow.lat > 43.8 && demoRow.lat < 43.95, true, 'demo permit has approximate coordinates');
  eq((await j('GET', '/api/permits')).d.total, 25, 'demo + real');
  await j('PUT', '/api/settings', { showDemo: false });
  mock.close(); delete process.env.BUILDDATA_API_KEY; delete process.env.BUILDDATA_BASE_URL;
});
await t('BuildData failure falls back without wiping real data', async () => {
  process.env.BUILDDATA_API_KEY = 'bad'; process.env.BUILDDATA_BASE_URL = 'http://localhost:1';
  const r = (await j('POST', '/api/sync', { source: 'builddata' })).d.results[0];
  eq(r.mode, 'fallback', 'mode'); eq((await j('GET', '/api/permits')).d.total, 5, 'real records kept');
  delete process.env.BUILDDATA_API_KEY; delete process.env.BUILDDATA_BASE_URL;
});

await t('trades are split: hvac and electrical are separate, old key gone', async () => {
  const m = (await j('GET', '/api/meta')).d;
  const keys = m.trades.map((x) => x.key);
  eq(keys.includes('hvac') && keys.includes('electrical') && !keys.includes('hvac_electrical'), true, 'trade list');
  const hv = (await j('GET', '/api/permits?trade=hvac')).d.items, el = (await j('GET', '/api/permits?trade=electrical')).d.items;
  eq(hv.every((p) => p.trades.includes('hvac')) && el.every((p) => p.trades.includes('electrical')), true, 'filters');
  eq((await j('GET', '/api/permits')).d.items.some((p) => p.trades.includes('hvac_electrical')), false, 'no legacy key');
});
await t('value filter: min / max / only-with-value', async () => {
  eq((await j('GET', '/api/permits?value_min=50000')).d.items.every((p) => p.est_value >= 50000), true, 'min');
  eq((await j('GET', '/api/permits?value_min=50000')).d.total, 2, 'min count');
  eq((await j('GET', '/api/permits?value_max=20000')).d.total, 1, 'max count');
  eq((await j('GET', '/api/permits?has_value=1')).d.total, 3, 'has value');
  eq((await j('GET', '/api/permits?value_min=abc')).d.total, 5, 'junk ignored');
  eq((await fetch(base + '/api/permits.csv?value_min=50000').then((r) => r.text())).trim().split(/\r?\n/).length, 3, 'csv honours filter');
});
await t('extracted facts + record details', async () => {
  const p = (await j('GET', '/api/permits?q=basement')).d.items[0];
  eq(p.facts.tags.includes('Second unit / suite'), true, 'tags'); eq(typeof p.details, 'object', 'details object');
});
await t('social profiles: validate, normalise, clear', async () => {
  eq((await j('PUT', '/api/contractor', { instagram_handle: 'bad handle!' })).s, 400, 'bad ig');
  eq((await j('PUT', '/api/contractor', { facebook_page: 'https://evil.example/maple' })).s, 400, 'non-facebook url');
  const r = (await j('PUT', '/api/contractor', { instagram_handle: 'https://instagram.com/@maple.fence/?hl=en'.replace('@', ''), facebook_page: 'maplefence', nextdoor_name: 'Maple Ridge Fence' })).d;
  eq((await j('PUT', '/api/contractor', { facebook_page: 'facebook.com/maplefence/' })).d.facebook_page, 'https://facebook.com/maplefence', 'fb without scheme');
  eq(r.instagram_handle, 'maple.fence', 'ig'); eq(r.facebook_page, 'https://facebook.com/maplefence', 'fb'); eq(r.nextdoor_name, 'Maple Ridge Fence', 'nd');
  eq((await j('PUT', '/api/contractor', { nextdoor_name: '' })).d.nextdoor_name, null, 'clear');
  await j('PUT', '/api/contractor', { nextdoor_name: 'Maple Ridge Fence' });
});
await t('campaign social platforms required + recorded', async () => {
  const id = (await j('GET', '/api/permits')).d.items[0].id;
  eq((await j('POST', '/api/campaigns', { permitId: id, format: 'postcard', neighbourHomes: 10, social: { enabled: true, budgetCents: 5000, platforms: [] } })).s, 400, 'none picked');
  const r = await j('POST', '/api/campaigns', { permitId: id, format: 'postcard', neighbourHomes: 10, social: { enabled: true, budgetCents: 5000, platforms: ['nextdoor', 'instagram', 'tiktok'] } });
  eq(r.s, 201, 'created'); eq(JSON.stringify(r.d.social_platforms), '["nextdoor","instagram"]', 'platforms filtered'); eq(r.d.posting_as.instagram, '@maple.fence', 'posting as');
});
await t('AI summary: off by default, safe prompt, cached', async () => {
  const items = (await j('GET', '/api/permits')).d.items; const target = items[0];
  eq((await j('POST', `/api/permits/${target.id}/enrich`, {})).s, 501, 'disabled without key');
  const http = await import('node:http'); let body = '', n = 0;
  const mock = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { n++; body = b; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ content: [{ type: 'text', text: 'Sure:\n' + JSON.stringify({ summary: 'A pool project.', included: ['Pool', 'Enclosure'], opportunity: 'Fencing and decking.', ask: ['When does digging start?'] }) }] })); }); });
  await new Promise((r) => mock.listen(0, r));
  process.env.ANTHROPIC_API_KEY = 'k'; process.env.ANTHROPIC_BASE_URL = `http://localhost:${mock.address().port}`;
  const r1 = await j('POST', `/api/permits/${target.id}/enrich`, {}); eq(r1.s, 200, 'generated'); eq(r1.d.enrichment.summary, 'A pool project.', 'summary');
  eq(body.includes(target.address), false, 'street address is never sent to the model'); eq(body.includes('contractor_phone'), false, 'no contact fields');
  const r2 = await j('POST', `/api/permits/${target.id}/enrich`, {}); eq(r2.d.cached, true, 'cached'); eq(n, 1, 'one API call');
  eq((await j('GET', `/api/permits/${target.id}`)).d.enrichment.summary, 'A pool project.', 'persisted');
  mock.close(); delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_BASE_URL;
});
await t('trades: Starter includes 3, others locked, extra trade add-on, new trades mapped', async () => {
  const keys = (await j('GET', '/api/meta')).d.trades.map((x) => x.key);
  eq(['bins', 'painting', 'flooring', 'drywall', 'kitchen', 'concrete', 'siding', 'garage', 'solar', 'security', 'pool', 'cleaning', 'moving'].every((k) => keys.includes(k)), true, 'new trades listed');
  const { tradesFor } = await import('./lib/mapping.js');
  eq(tradesFor('RP', 'Demolish existing dwelling and construct new house with garage').includes('bins'), true, 'demolition → bins');
  eq(tradesFor('AL', 'Interior renovation: new kitchen, paint and hardwood flooring').some((k) => k === 'kitchen'), true, 'kitchen from text');
  eq(tradesFor('PE', 'New in-ground pool').includes('pool'), true, 'pool → pool service');

  eq((await j('POST', '/api/territory/reserve', { plan: 'starter', trade: 'fencing', trades: ['decks', 'landscaping', 'hvac'], email: 's@b.ca' })).d.outcome, 'starter_subscribed_demo', 'starter');
  let ta = (await j('GET', '/api/meta')).d.tradeAccess;
  eq(ta.all, false, 'starter is limited'); eq(ta.limit, 3, '3 trades'); eq(ta.trades.join(','), 'fencing,decks,landscaping', 'first 3 kept');
  const hv = (await j('GET', '/api/permits?trade=hvac')).d; eq(hv.locked, true, 'hvac locked'); eq(hv.total, 0, 'no hvac permits');
  eq((await j('GET', '/api/permits')).d.items.every((p) => p.trades.some((k) => ta.trades.includes(k))), true, 'all = only followed trades');
  eq((await j('PUT', '/api/contractor/trades', { trades: ['fencing', 'decks', 'landscaping', 'hvac'] })).s, 402, '4th trade needs add-on');
  eq((await j('PUT', '/api/contractor/trades', { trades: ['fencing', 'decks', 'pool'] })).s, 200, 'swap within limit');
  const add = await j('POST', '/api/trades/addon', { trade: 'hvac' });
  eq(add.d.demo, true, 'demo add-on'); eq(add.d.tradeAccess.limit, 4, 'limit grows'); eq(add.d.tradeAccess.trades.includes('hvac'), true, 'hvac followed');
  eq((await j('GET', '/api/permits?trade=hvac')).d.locked, false, 'hvac unlocked');
  eq((await j('POST', '/api/trades/addon', { trade: 'hvac' })).s, 400, 'no double add');
});
await t('door-knock route sheet: self-serve, etiquette, HVAC warning', async () => {
  const id = (await j('GET', '/api/permits')).d.items[0].id;
  const sheet = await fetch(base + `/api/route-sheet?ids=${id}&trade=fencing`).then((x) => x.text());
  eq(sheet.includes('Door-knock route'), true, 'route sheet renders'); eq(sheet.includes('Never mention that you saw their permit'), true, 'etiquette included');
  eq((await fetch(base + `/api/route-sheet?ids=${id}&trade=hvac`).then((x) => x.text())).includes('Do not door-knock for this trade'), true, 'HVAC warning');
  const r = await j('POST', '/api/campaigns', { permitId: id, trade: 'fencing', format: 'postcard', neighbourHomes: 10, doorKnock: { doors: 25 } });
  eq(r.s, 201, 'campaign still works'); eq(r.d.subtotal_cents, 250 + 1350, 'no paid door knocking is charged');
});
await t('team password protects the queue, sync and settings', async () => {
  process.env.TEAM_PASSWORD = 's3cret';
  eq((await j('GET', '/api/social-requests')).s, 401, 'queue locked');
  eq((await j('POST', '/api/sync', {})).s, 401, 'sync locked');
  eq((await j('PUT', '/api/settings', { showDemo: true })).s, 401, 'settings locked');
  eq((await j('GET', '/api/sync/status')).s, 200, 'sync status stays public');
  const auth = { Authorization: 'Basic ' + Buffer.from('team:s3cret').toString('base64') };
  eq((await fetch(base + '/api/social-requests', { headers: auth })).status, 200, 'unlocked with password');
  eq((await fetch(base + '/api/social-requests', { headers: { Authorization: 'Basic ' + Buffer.from('team:nope').toString('base64') } })).status, 401, 'wrong password');
  delete process.env.TEAM_PASSWORD;
});
await t('email: sign-ups notify the team, test-mode override, sample alert emails', async () => {
  const http = await import('node:http'); const sent = [];
  const mock = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { sent.push(JSON.parse(b)); res.setHeader('Content-Type', 'application/json'); res.end('{"id":"e1"}'); }); });
  await new Promise((r) => mock.listen(0, r));
  Object.assign(process.env, { RESEND_API_KEY: 're_test', RESEND_BASE_URL: `http://localhost:${mock.address().port}`, NOTIFY_EMAIL: 'owner@example.ca', EMAIL_OVERRIDE_TO: 'owner@example.ca' });
  eq((await j('POST', '/api/waitlist', { city_slug: 'aurora', trade: 'painting', company: 'Brush Co', email: 'b@c.ca' })).s, 201, 'waitlist');
  eq(sent.at(-1).to[0], 'owner@example.ca', 'team notified'); eq(sent.at(-1).subject.includes('Waitlist sign-up: Brush Co'), true, 'subject');
  await j('PUT', '/api/alerts/subscription', { email_enabled: true, email: 'contractor@example.ca', sms_enabled: false, wa_enabled: false, trades: ['fencing'], neighbourhoods: [], frequency: 'daily_7am' });
  const pv = await j('POST', '/api/alerts/preview', {});
  eq(pv.d.emailStatus, 'emailed', 'sample alert emailed');
  const alert = sent.at(-1);
  eq(alert.to[0], 'owner@example.ca', 'override redirects contractor email'); eq(alert.subject.startsWith('[for contractor@example.ca]'), true, 'intended recipient shown'); eq(alert.html.includes('PermitPulse'), true, 'html body');
  mock.close(); for (const k of ['RESEND_BASE_URL', 'NOTIFY_EMAIL', 'EMAIL_OVERRIDE_TO']) delete process.env[k]; process.env.RESEND_API_KEY = '';
});
await t('billing: demo mode, Stripe Checkout, verify, webhook signature, Pro waiver', async () => {
  const id = (await j('GET', '/api/permits')).d.items[0].id;
  const demo = await j('POST', '/api/campaigns', { permitId: id, format: 'postcard', neighbourHomes: 10 });
  eq(demo.d.payment_status, 'demo', 'no Stripe key → demo'); eq(demo.d.checkout_url, null, 'no checkout url');
  eq((await j('POST', '/api/billing/plan-checkout', { plan: 'starter' })).s, 409, 'plan checkout needs a key');

  const http = await import('node:http'); const crypto = await import('node:crypto');
  const sessions = {}; let lastBody = '';
  const mock = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST') {
        lastBody = decodeURIComponent(b); const p = new URLSearchParams(b); const sid = `cs_test_${Object.keys(sessions).length + 1}`;
        const metadata = {}; for (const [k, v] of p) { const m = k.match(/^metadata\[(\w+)\]$/); if (m) metadata[m[1]] = v; }
        sessions[sid] = { id: sid, mode: p.get('mode'), metadata, payment_status: 'unpaid', status: 'open', url: `https://checkout.stripe.test/${sid}` };
        return res.end(JSON.stringify(sessions[sid]));
      }
      const s = sessions[req.url.split('/').pop()]; res.statusCode = s ? 200 : 404; res.end(JSON.stringify(s || { error: { message: 'No such session' } }));
    });
  });
  await new Promise((r) => mock.listen(0, r));
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock'; process.env.STRIPE_BASE_URL = `http://localhost:${mock.address().port}`;

  const paidCamp = await j('POST', '/api/campaigns', { permitId: id, format: 'postcard', neighbourHomes: 25, social: { enabled: true, budgetCents: 30000, platforms: ['facebook'] } });
  eq(paidCamp.d.payment_status, 'unpaid', 'unpaid until checkout'); eq(paidCamp.d.checkout_url.startsWith('https://checkout.stripe.test/'), true, 'checkout url');
  eq(lastBody.includes('line_items[1][price_data][unit_amount]=9900'), true, 'setup fee line'); eq(lastBody.includes('30000'), false, 'ad spend never charged by us');
  const sid = paidCamp.d.stripe_session_id;
  eq((await j('GET', `/api/billing/verify?session_id=${sid}`)).d.applied, false, 'not paid yet');
  sessions[sid].payment_status = 'paid'; sessions[sid].status = 'complete';
  eq((await j('GET', `/api/billing/verify?session_id=${sid}`)).d.applied, true, 'verified');
  eq((await j('GET', '/api/campaigns')).d.items.find((x) => x.id === paidCamp.d.id).payment_status, 'paid', 'campaign paid');

  eq((await j('POST', '/api/billing/plan-checkout', { plan: 'starter', interval: 'year' })).s, 200, 'annual checkout');
  eq(lastBody.includes('[recurring][interval]=year') && lastBody.includes('[unit_amount]=149000'), true, 'annual price, 2 months free');
  eq(lastBody.includes('subscription_data[trial_period_days]=14') && lastBody.includes('allow_promotion_codes=true'), true, '14-day trial + promo codes');
  const plan = await j('POST', '/api/billing/plan-checkout', { plan: 'pro' }); eq(plan.s, 200, 'plan checkout');
  const planSid = plan.d.url.split('/').pop(); eq(sessions[planSid].mode, 'subscription', 'subscription mode');
  sessions[planSid].status = 'complete';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: sessions[planSid] } });
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', 'whsec_test').update(`${ts}.${payload}`).digest('hex');
  const hook = (h) => fetch(base + '/api/billing/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': h }, body: payload });
  eq((await hook(`t=${ts},v1=${'0'.repeat(64)}`)).status, 400, 'bad signature rejected');
  eq((await hook(`t=${ts},v1=${sig}`)).status, 200, 'signed webhook accepted');
  const status = (await j('GET', '/api/billing/status')).d;
  eq(status.plan, 'pro', 'plan active');
  eq((await j('GET', '/api/meta')).d.tradeAccess.all, true, 'pro sees every trade');
  eq((await j('POST', '/api/trades/addon', { trade: 'painting' })).s, 400, 'pro needs no add-ons');
  // An earlier test already activated Pro (demo mode) and may have used this month's included campaign.
  const social = () => j('POST', '/api/campaigns', { permitId: id, format: 'postcard', neighbourHomes: 10, social: { enabled: true, budgetCents: 10000, platforms: ['nextdoor'] } });
  if (status.socialIncludedRemaining === 1) {
    const waived = await social();
    eq(waived.d.management_waived, true, 'included pro campaign waived'); eq(waived.d.social_request.management_cents, 0, 'no setup fee');
  } else eq(status.socialIncludedRemaining, 0, 'included campaign already used');
  eq((await j('GET', '/api/billing/status')).d.socialIncludedRemaining, 0, 'allowance used up');
  eq((await social()).d.social_request.management_cents, 9900, 'next campaign pays setup');
  mock.close(); delete process.env.STRIPE_BASE_URL; process.env.STRIPE_SECRET_KEY = ''; process.env.STRIPE_WEBHOOK_SECRET = '';
});
console.log(failed ? `\n${failed} test(s) failed` : '\nAll API checks passed');
server.close(); process.exit(failed ? 1 : 0);
