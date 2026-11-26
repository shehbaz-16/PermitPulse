// BuildData (builddata.ca) building-permit adapter — real Markham permits via a commercial REST API.
//   BUILDDATA_API_KEY=...            required (free key: records older than ~30 days; Pro: includes today's)
//   BUILDDATA_MUNICIPALITY=markham   city slug (confirm with GET https://api.builddata.ca/permit/coverage)
//   BUILDDATA_LOOKBACK_DAYS=120      how far back to pull (issued_after)
//   BUILDDATA_MAX_PAGES=5            page cap per sync (free tier = 100 requests/day)
//   BUILDDATA_PAGE_SIZE=100          rows per call (free keys are capped lower)
//   BUILDDATA_BASE_URL               override for tests
// Only an allowlist of fields is read. contractor_phone / contractor_address / contact_role are never touched.
import { tradesFor } from '../lib/mapping.js';

const env = (k, d) => process.env[k] || d;

const DIRS = new Set(['E', 'W', 'N', 'S', 'NE', 'NW', 'SE', 'SW']);
export function titleCase(s) {
  return String(s || '').toLowerCase().replace(/\b([a-z0-9][a-z0-9'’-]*)/g, (w) => {
    const u = w.toUpperCase();
    if (DIRS.has(u)) return u;
    if (/^\d+(st|nd|rd|th)$/.test(w)) return w;
    return w[0].toUpperCase() + w.slice(1);
  });
}
const sentence = (s) => {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  if (!t) return t;
  const letters = t.replace(/[^A-Za-z]/g, '');
  const mostlyUpper = letters.length > 3 && t === t.toUpperCase();
  const out = mostlyUpper ? t.toLowerCase() : t;
  return out[0].toUpperCase() + out.slice(1);
};

// Date-only strings are parsed at noon UTC so they stay on the same calendar day in Toronto.
export function parseDay(v) {
  if (!v) return null;
  const s = String(v);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseMoney(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
/** Construction value can arrive as a number, a "$85,000.00" string, in cents, or under a different key per city. */
export function pickValue(r) {
  for (const k of ['construction_value', 'estimated_value', 'estimated_cost', 'est_const_cost', 'construction_cost', 'project_value', 'declared_value', 'value']) {
    const n = parseMoney(r[k]); if (n && n > 0) return n;
  }
  const cents = parseMoney(r.est_const_cost_cents); if (cents && cents > 0) return cents / 100;
  for (const [k, v] of Object.entries(r)) {
    if (/cents|fee|permit_cost/i.test(k)) continue;
    if (/(const|construct|project|estimat|declared).*(value|cost|amount)/i.test(k)) { const n = parseMoney(v); if (n && n > 0) return n; }
  }
  return null;
}
const coord = (a, b) => { const v = a ?? b; if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

const DETAIL_KEY = /(work|structure|building|dwelling|unit|storey|story|floor|area|sq_?ft|use|class|zoning|lot|height|bedroom|bath|sub_?type|occupancy)/i;
const DETAIL_DENY = /contractor|applicant|owner|phone|email|name|address|contact|licen[cs]e|fee|geom|lat|lng|longitude|latitude|record_id|permit_number|description|municipality|province|fetched|raw|date|status|value|cost|postal|url|link|id$/i;
/** Extra descriptive fields BuildData may provide. Allowlisted by key pattern; anything personal is excluded. */
export function pickDetails(r, scope) {
  const out = {};
  for (const [k, v] of Object.entries(r)) {
    if (v == null || v === '' || typeof v === 'object' || k === 'permit_type' || k === 'permit_type_canonical') continue;
    if (!DETAIL_KEY.test(k) || DETAIL_DENY.test(k)) continue;
    const val = String(v).replace(/\s+/g, ' ').trim().slice(0, 140);
    if (!val || val.toLowerCase() === String(scope || '').toLowerCase()) continue;
    out[titleCase(k.replace(/_/g, ' '))] = /^[A-Z0-9 \-/,.]+$/.test(val) ? sentence(val) : val;
    if (Object.keys(out).length >= 12) break;
  }
  return out;
}

const STATUS = { issued: 'Issued', in_review: 'Under Review', completed: 'Completed', expired: 'Expired', cancelled: 'Cancelled' };

/** Map one BuildData permit record to NormalizedPermit, or null if unusable / not relevant to home-service trades. */
export function mapRecord(r) {
  const id = r.record_id ?? r.permit_number;
  const issued = parseDay(r.issued_date);
  const applied = parseDay(r.application_date);
  const filed = applied || issued;
  const rawAddr = String(r.address || r.normalized_address || '').split(',')[0].trim();
  if (id == null || !filed || !rawAddr) return null;

  const canon = String(r.permit_type_canonical || '').toLowerCase();
  const trade = String(r.trade_canonical || '').toLowerCase();
  const text = [r.permit_type, r.work, r.description, r.structure_type, r.building_type, r.work_type].filter(Boolean).join(' ').toUpperCase();

  let code, category;
  if (canon === 'demolition' && !/NEW|REPLACE|INFILL/.test(text)) return null;
  if (/COMMERCIAL|INDUSTRIAL|OFFICE|RETAIL|INSTITUTION|WAREHOUSE|MIXED.?USE|APARTMENT/.test(text)) { code = 'DA'; category = 'Commercial / Development Application'; }
  else if (/\bPOOL\b/.test(text)) { code = 'PE'; category = 'Pool / Deck'; }
  else if (/TREE/.test(text)) { code = 'TP'; category = 'Tree Removal'; }
  else if (trade === 'plumbing' || /BACKWATER|SEWER|WATER SERVICE|WEEPING|DRAIN|PLUMB/.test(text)) { code = 'PP'; category = 'Plumbing / Drainage'; }
  else if (trade === 'mechanical' || trade === 'electrical' || trade === 'gas' || /HVAC|FURNACE|HEATING|AIR.?CONDITION|MECHANICAL|ELECTRIC/.test(text)) { code = 'HV'; category = 'HVAC / Mechanical'; }
  else if (canon === 'new_construction' && /DWELLING|HOUSE|SEMI|TOWNHOUSE|DETACHED|SINGLE/.test(text)) { code = /REPLACE|INFILL|DEMOLI/.test(text) ? 'RP' : 'HP'; category = code === 'RP' ? 'Residential Renovation' : 'New Home'; }
  else if (/BASEMENT|SECOND UNIT|SECONDARY SUITE|ACCESSORY DWELLING|IN-?LAW/.test(text)) { code = 'AL'; category = 'Secondary Suite / Basement'; }
  else if (/\bDECK\b|PORCH|GAZEBO|PERGOLA|CABANA/.test(text)) { code = 'AL'; category = 'Pool / Deck'; }
  else { code = 'AL'; category = 'Residential Renovation'; }

  const a = rawAddr.match(/^(\d+[A-Za-z]?(?:-\d+)?)\s+(.+)$/);
  const number = a ? a[1] : null;
  const street = titleCase(a ? a[2] : rawAddr);
  const value = pickValue(r);
  const lat = coord(r.lat, r.latitude), lng = coord(r.lng, r.longitude);
  const permitNo = String(r.permit_number || r.record_id);
  const addrTail = String(r.address || '').split(',')[1]?.replace(/\b(ON|Ontario)\b\.?/gi, '').trim();
  const hood = r.neighbourhood || r.neighborhood || r.community || (addrTail && /^[A-Za-z .'-]{3,30}$/.test(addrTail) ? addrTail : null);
  const canonStatus = String(r.status_canonical || '').toLowerCase();
  const fsa = r.postal_code ? String(r.postal_code).replace(/\s/g, '').slice(0, 3).toUpperCase() : null;

  return {
    source_id: String(id),
    permit_number: permitNo,
    permit_code: code,
    permit_type: titleCase(r.permit_type || canon.replace(/_/g, ' ') || 'Building permit'),
    category,
    status: STATUS[canonStatus] || titleCase(r.status || 'Unknown'),
    filed_at: filed,
    issued_at: issued,
    status_changed_at: issued || filed,
    street_number: number,
    street_name: street,
    unit: null,
    address: number ? `${number} ${street}` : street,
    neighbourhood: hood ? titleCase(hood) : fsa,
    postal_fsa: fsa,
    est_value: value ? Math.round(value) : null,
    scope: sentence(r.description || r.work || r.permit_type || 'Scope not published'),
    trades: tradesFor(code, `${text} ${category}`),
    details: pickDetails(r, r.description),
    lat: lat !== null && lat > 40 && lat < 60 ? lat : null,
    lng: lng !== null && lng < -60 && lng > -140 ? lng : null,
  };
}

async function getPage(url, key, params) {
  const res = await fetch(`${url}?${new URLSearchParams(params)}`, {
    headers: { 'X-API-Key': key, Accept: 'application/json', 'User-Agent': 'PermitPulse-Ontario/0.1' },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 401 || res.status === 403) throw new Error('BuildData rejected the API key (HTTP ' + res.status + ')');
  if (res.status === 429) throw new Error('BuildData rate limit reached (HTTP 429). Free keys allow 100 requests/day');
  if (!res.ok) { const e = new Error(`BuildData HTTP ${res.status}`); e.status = res.status; throw e; }
  return res.json();
}

/** One BuildData adapter per city. `municipality` is BuildData's city slug (see GET /permit/coverage). */
export const makeBuilddataAdapter = (municipality, cityName) => ({
  key: 'builddata',
  name: 'BuildData (real permits)',
  kind: 'builddata_rest',
  description: `Real ${cityName} building permits via the BuildData API (builddata.ca).`,
  unconfiguredMessage: `Not configured. Set BUILDDATA_API_KEY to pull real ${cityName} permits.`,
  isConfigured: () => Boolean(process.env.BUILDDATA_API_KEY),
  async fetchLive() {
    const key = process.env.BUILDDATA_API_KEY;
    const url = `${env('BUILDDATA_BASE_URL', 'https://api.builddata.ca').replace(/\/$/, '')}/permit`;
    const since = new Date(Date.now() - Number(env('BUILDDATA_LOOKBACK_DAYS', 120)) * 86400000).toISOString().slice(0, 10);
    const maxPages = Number(env('BUILDDATA_MAX_PAGES', 5));
    let limit = Number(env('BUILDDATA_PAGE_SIZE', 100));
    const out = new Map();
    let cursor = null, offset = 0;
    for (let page = 0; page < maxPages; page++) {
      const params = { municipality, issued_after: since, sort_by: 'date', sort_order: 'desc', limit: String(limit) };
      if (cursor) params.cursor = cursor; else if (offset) params.offset = String(offset);
      let json;
      try { json = await getPage(url, key, params); }
      catch (e) {
        if ((e.status === 400 || e.status === 422) && limit > 25) { limit = 25; page--; continue; } // free keys cap page size
        throw e;
      }
      const rows = json.results || json.data || [];
      for (const r of rows) { const m = mapRecord(r); if (m) out.set(m.source_id, m); }
      if (!rows.length) break;
      if (json.next_cursor) cursor = json.next_cursor;
      else if (rows.length < limit) break;
      else { cursor = null; offset += rows.length; }
    }
    const list = [...out.values()];
    const withValue = list.filter((p) => p.est_value).length, withCoords = list.filter((p) => p.lat !== null).length;
    list.info = `${withValue} of ${list.length} records have a construction value; ${withCoords} have map coordinates.`;
    console.log(`[builddata:${municipality}] ${list.length} records mapped. ${list.info}`);
    return list;
  },
  fixture: () => [], // never fabricate "real" data
});

export const builddataAdapter = makeBuilddataAdapter(env('BUILDDATA_MUNICIPALITY', 'markham'), 'Markham');
