// Normalisation helpers shared by every adapter. Adapters return rows in the NormalizedPermit shape below;
// the sync layer upserts them. Only an ALLOWLIST of fields ever leaves this module — owner names, phone
// numbers, applicant/contractor contacts etc. are never read, so they can never be stored or exposed.
import { tradesFor, NEIGHBOURHOOD_FSA, demoCoords } from '../lib/mapping.js';

const DAY = 86400000;

/** @typedef {{source_id:string, permit_number:string, permit_code:string, permit_type:string, category:string,
 *  status:string, filed_at:Date, issued_at:Date|null, status_changed_at:Date, street_number:string|null,
 *  street_name:string, unit:string|null, address:string, neighbourhood:string|null, postal_fsa:string|null,
 *  est_value:number|null, scope:string, trades:string[]}} NormalizedPermit */

export function fromFixture(rec, now = new Date()) {
  const filed = new Date(now.getTime() - rec.filed * DAY - 9 * 3600000); // ~9h before "now" keeps same-day stamps in the past
  const issued = rec.issued == null ? null : new Date(now.getTime() - rec.issued * DAY - 3 * 3600000);
  const isNumbered = /^\d{2}-\d+$/.test(rec.id);
  return {
    source_id: rec.id,
    permit_number: isNumbered ? `${rec.id} ${rec.code}` : rec.id,
    permit_code: rec.code,
    permit_type: rec.type,
    category: rec.category,
    status: rec.status,
    filed_at: filed,
    issued_at: issued,
    status_changed_at: issued || filed,
    street_number: rec.num,
    street_name: rec.street,
    unit: rec.unit || null,
    address: `${rec.num} ${rec.street}`,
    neighbourhood: rec.hood,
    postal_fsa: NEIGHBOURHOOD_FSA[rec.hood] || null,
    est_value: rec.value ?? null,
    scope: rec.scope,
    trades: tradesFor(rec.code, `${rec.type} ${rec.category} ${rec.scope}`),
    lat: demoCoords(rec.id, rec.hood)[0],
    lng: demoCoords(rec.id, rec.hood)[1],
  };
}

// ---- live-row mapping (ArcGIS attributes / ePLAN export rows) -------------------------------------------
// Field-name candidates are best guesses: confirm against <layer>?f=json and override via *_FIELD_MAP env JSON.
export const FIELD_CANDIDATES = {
  id: ['PERMIT_NO', 'PERMITNUMBER', 'PERMIT_NUMBER', 'FILE_NUMBER', 'FILENUMBER', 'APPLICATION_NUMBER', 'FOLDERNUMBER', 'FOLDER_NUMBER', 'OBJECTID'],
  address: ['ADDRESS', 'FULL_ADDRESS', 'SITE_ADDRESS', 'PROPERTY_ADDRESS', 'ADDR', 'LOCATION'],
  status: ['STATUS', 'FOLDER_STATUS', 'PERMIT_STATUS', 'APPLICATION_STATUS'],
  description: ['DESCRIPTION', 'PROPOSAL', 'WORK_DESCRIPTION', 'WORKDESC', 'SCOPE', 'PROJECT_DESCRIPTION'],
  type: ['PERMIT_TYPE', 'PERMITTYPE', 'APPLICATION_TYPE', 'FOLDERTYPE', 'WORK_TYPE', 'SUBTYPE'],
  filed: ['APPLICATION_DATE', 'APPLIED_DATE', 'DATE_RECEIVED', 'RECEIVED_DATE', 'INDATE', 'CREATED_DATE', 'SUBMITTED_DATE'],
  issued: ['ISSUE_DATE', 'ISSUED_DATE', 'DATE_ISSUED', 'APPROVAL_DATE'],
  value: ['CONSTRUCTION_VALUE', 'ESTIMATED_VALUE', 'PROJECT_VALUE', 'VALUE', 'EST_VALUE'],
  postal: ['POSTAL_CODE', 'POSTALCODE', 'FSA'],
  hood: ['NEIGHBOURHOOD', 'NEIGHBORHOOD', 'COMMUNITY', 'WARD_NAME'],
};

export function pick(row, names, override) {
  const keys = Object.keys(row);
  const list = override ? [override, ...names] : names;
  for (const n of list) {
    const k = keys.find((x) => x.toLowerCase() === n.toLowerCase());
    if (k && row[k] != null && row[k] !== '') return row[k];
  }
  return null;
}

export function toDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(v); // ArcGIS epoch milliseconds
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseAddress(raw) {
  const s = String(raw || '').split(',')[0].trim();
  const m = s.match(/^(?:(?:unit|suite|apt|#)\s*([\w-]+)[\s,-]+)?(\d+[A-Za-z]?)\s+(.+)$/i);
  if (!m) return { unit: null, number: null, street: s || 'Unknown' };
  return { unit: m[1] || null, number: m[2], street: m[3] };
}

export function inferCode(typeText, fallback) {
  const t = String(typeText || '').toUpperCase();
  if (/\bPE\b|POOL/.test(t)) return 'PE';
  if (/\bRP\b|INFILL|REPLACEMENT/.test(t)) return 'RP';
  if (/\bHP\b|NEW HOUSE|HOUSING|DWELLING/.test(t)) return 'HP';
  if (/\bPP\b|PLUMB|BACKWATER/.test(t)) return 'PP';
  if (/HVAC|MECHANICAL|FURNACE/.test(t)) return 'HV';
  if (/TREE/.test(t)) return 'TP';
  return fallback;
}

/** Map one raw live row to NormalizedPermit (allowlist only). Returns null if the row is unusable. */
export function fromLiveRow(row, { defaultCode, category, fieldMap = {} }) {
  const id = pick(row, FIELD_CANDIDATES.id, fieldMap.id);
  const filed = toDate(pick(row, FIELD_CANDIDATES.filed, fieldMap.filed));
  const addr = pick(row, FIELD_CANDIDATES.address, fieldMap.address);
  if (id == null || !filed || !addr) return null;
  const typeText = pick(row, FIELD_CANDIDATES.type, fieldMap.type) || '';
  const code = inferCode(`${typeText} ${id}`, defaultCode);
  const a = parseAddress(addr);
  const issued = toDate(pick(row, FIELD_CANDIDATES.issued, fieldMap.issued));
  const postal = pick(row, FIELD_CANDIDATES.postal, fieldMap.postal);
  const val = Number(pick(row, FIELD_CANDIDATES.value, fieldMap.value));
  return {
    source_id: String(id),
    permit_number: String(id),
    permit_code: code,
    permit_type: String(typeText || code),
    category,
    status: String(pick(row, FIELD_CANDIDATES.status, fieldMap.status) || 'Application Received'),
    filed_at: filed,
    issued_at: issued,
    status_changed_at: issued || filed,
    street_number: a.number,
    street_name: a.street,
    unit: a.unit,
    address: a.number ? `${a.number} ${a.street}` : a.street,
    neighbourhood: pick(row, FIELD_CANDIDATES.hood, fieldMap.hood),
    postal_fsa: postal ? String(postal).replace(/\s/g, '').slice(0, 3).toUpperCase() : null,
    est_value: Number.isFinite(val) && val > 0 ? Math.round(val) : null,
    scope: String(pick(row, FIELD_CANDIDATES.description, fieldMap.description) || typeText || 'Scope not published'),
    trades: tradesFor(code, `${typeText} ${category} ${pick(row, FIELD_CANDIDATES.description, fieldMap.description) || ''}`),
  };
}
