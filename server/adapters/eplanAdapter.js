// City of Markham ePLAN / AMANDA building-permit adapter.
// No documented public API for building permits was found: the City points people to the ePLAN public
// permit search. This adapter therefore does NOT scrape the portal. To ingest real building permits, point it
// at a JSON array you are authorised to use (an official export/feed, or your own scheduled export):
//   MARKHAM_EPLAN_JSON_URL=https://.../permits.json    MARKHAM_EPLAN_FIELD_MAP='{"id":"PermitNo",...}'
// Rows are mapped through an allowlist (see normalize.js) so personal data is never stored.
import { EPLAN_PERMITS } from './fixtures.js';
import { fromFixture, fromLiveRow } from './normalize.js';

export const eplanAdapter = {
  key: 'eplan',
  name: 'ePLAN / AMANDA',
  kind: 'eplan_amanda',
  description: 'Building permits (PE, HP/RP, AL, PP, HV). Fixture until an authorised export feed is configured.',
  isConfigured: () => Boolean(process.env.MARKHAM_EPLAN_JSON_URL),
  async fetchLive() {
    const res = await fetch(process.env.MARKHAM_EPLAN_JSON_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('Expected a JSON array of permit rows');
    const fieldMap = process.env.MARKHAM_EPLAN_FIELD_MAP ? JSON.parse(process.env.MARKHAM_EPLAN_FIELD_MAP) : {};
    const since = Date.now() - Number(process.env.MARKHAM_SYNC_DAYS || 31) * 86400000;
    return rows
      .map((r) => fromLiveRow(r, { defaultCode: 'AL', category: 'Residential Renovation', fieldMap }))
      .filter((n) => n && n.filed_at.getTime() >= since);
  },
  fixture: (now) => EPLAN_PERMITS.map((r) => fromFixture(r, now)),
};
