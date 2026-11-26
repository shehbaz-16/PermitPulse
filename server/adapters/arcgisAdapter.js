// City of Markham Open Data (ArcGIS REST FeatureServer) adapter — tree permits + development applications.
// Plug in real layers with env vars (layer URL = .../FeatureServer/<n>):
//   MARKHAM_ARCGIS_TREE_URL, MARKHAM_ARCGIS_DEVAPP_URL
//   MARKHAM_ARCGIS_FIELD_MAP='{"id":"FILE_NO","address":"SITE_ADDR",...}'   (optional overrides)
//   MARKHAM_SYNC_DAYS=31   (how far back to pull; feed prioritises the latest)
// NOTE: layer URLs and field names are NOT hard-coded because they could not be verified from here —
// open <layer-url>?f=json to confirm field names, then set the env vars above.
import { ARCGIS_RECORDS } from './fixtures.js';
import { fromFixture, fromLiveRow } from './normalize.js';

const layers = () => [
  { url: process.env.MARKHAM_ARCGIS_TREE_URL, code: 'TP', category: 'Tree Removal' },
  { url: process.env.MARKHAM_ARCGIS_DEVAPP_URL, code: 'DA', category: 'Commercial / Development Application' },
].filter((l) => l.url);

async function queryLayer(url, sinceMs) {
  const params = new URLSearchParams({
    where: '1=1', outFields: '*', returnGeometry: 'false', f: 'json', resultRecordCount: '500',
  });
  const res = await fetch(`${url.replace(/\/$/, '')}/query?${params}`, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'PermitPulse-Ontario/0.1 (open-data client)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'ArcGIS error');
  return (json.features || []).map((f) => f.attributes || {});
}

export const arcgisAdapter = {
  key: 'markham_arcgis',
  name: 'Markham Open Data ArcGIS',
  kind: 'arcgis_rest',
  description: 'Tree permits and development applications from City of Markham Open Data (ArcGIS REST FeatureServer).',
  isConfigured: () => layers().length > 0,
  async fetchLive() {
    const days = Number(process.env.MARKHAM_SYNC_DAYS || 31);
    const since = Date.now() - days * 86400000;
    const fieldMap = process.env.MARKHAM_ARCGIS_FIELD_MAP ? JSON.parse(process.env.MARKHAM_ARCGIS_FIELD_MAP) : {};
    const out = [];
    for (const l of layers()) {
      const rows = await queryLayer(l.url, since);
      for (const r of rows) {
        const n = fromLiveRow(r, { defaultCode: l.code, category: l.category, fieldMap });
        if (n && n.filed_at.getTime() >= since) out.push(n);
      }
    }
    return out;
  },
  fixture: (now) => ARCGIS_RECORDS.map((r) => fromFixture(r, now)),
};
