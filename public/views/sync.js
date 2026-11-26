import { html, useState, useEffect, useApp, api, Icon, relTime, fmtDateTime } from '/lib.js';

const MODE = {
  live: ['pill-green', 'Live'], fixture: ['pill-amber', 'Fixture data'], fallback: ['pill-red', 'Live failed → fixture'], null: ['pill-slate', 'Never synced'],
};

export function SyncView() {
  const { toast, bump, meta } = useApp();
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState('');
  const [cfg, setCfg] = useState(null);
  const loadCfg = () => api.get('/api/settings').then(setCfg).catch(() => {});
  const setDemo = async (v) => { try { await api.put('/api/settings', { showDemo: v }); await loadCfg(); bump(); toast(v ? 'Demo records are now shown' : 'Showing real records only'); } catch (e) { toast(e.message, 'err'); } };
  const load = () => api.get('/api/sync/status').then(setD).catch((e) => toast(e.message, 'err'));
  useEffect(() => { load(); loadCfg(); }, []);
  const run = async (source) => {
    setBusy(source || 'all');
    try { const r = await api.post('/api/sync', source ? { source } : {}); toast(`Sync complete: ${r.results.reduce((s, x) => s + x.upserted, 0)} record(s) updated`); await load(); await loadCfg(); bump(); }
    catch (e) { toast(e.message, 'err'); }
    setBusy('');
  };
  if (!d) return html`<div class="view"><div class="empty"><div class="spinner"></div></div></div>`;
  return html`<div class="view">
    <div class="view-head"><div><h1>Data & Sync</h1><p class="muted">Ingestion status for ${meta.city.name}. Falls back to realistic fixture data whenever a live municipal endpoint is not configured or unreachable.</p></div>
      <button class="btn btn-navy" disabled=${!!busy} onClick=${() => run(null)}><${Icon} name="refresh" size=${16} class=${busy ? 'spin' : ''} /> ${busy === 'all' ? 'Syncing…' : 'Run Sync (all sources)'}</button></div>
    ${cfg && html`<div class=${`data-mode ${cfg.showDemo ? '' : 'real'}`}>
      <div><b>${cfg.showDemo ? 'Showing real + demo records' : 'Showing real records only'}</b>
        <small>${cfg.realCount ? `${cfg.realCount} real public record${cfg.realCount === 1 ? '' : 's'} loaded.` : 'No real records yet. Add a BuildData key and run a sync.'} Demo records are fictional samples.</small></div>
      <label class="demo-toggle dark"><span>Show demo records</span><button type="button" role="switch" aria-checked=${cfg.showDemo} class=${`switch switch-sm ${cfg.showDemo ? 'on' : ''}`} onClick=${() => setDemo(!cfg.showDemo)}><span></span></button></label>
    </div>`}
    <div class="stat-row"><div class="stat"><b>${d.total}</b><span>Permit records</span></div><div class="stat"><b>${d.sources.length}</b><span>Sources</span></div><div class="stat"><b class="sm">${d.database}</b><span>Database</span></div></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Source</th><th>Mode</th><th>Last sync</th><th class="r">Records</th><th></th></tr></thead><tbody>
      ${d.sources.map((s) => { const m = MODE[s.last_mode] || MODE.null; return html`<tr key=${s.source_key}>
        <td><b>${s.name}</b><small>${s.description}</small></td>
        <td><span class=${`pill ${m[0]}`}>${m[1]}</span><small>${s.last_message || ''}</small></td>
        <td>${relTime(s.last_sync_at)}<small>${s.last_sync_at ? fmtDateTime(s.last_sync_at) : ''}</small></td>
        <td class="r"><b>${s.record_count}</b></td>
        <td class="r"><button class="btn btn-ghost btn-sm" disabled=${!!busy} onClick=${() => run(s.source_key)}>${busy === s.source_key ? 'Syncing…' : 'Run Sync'}</button></td></tr>`; })}
    </tbody></table></div>
    <div class="two-col">
      <section class="card"><h3>Recent sync runs</h3>
        ${d.runs.length ? html`<ul class="log">${d.runs.map((r) => html`<li><span class=${`pill ${(MODE[r.mode] || MODE.null)[0]}`}>${r.source_key}</span><span class="log-to">${r.upserted} upserted</span><small>${relTime(r.started_at)}</small></li>`)}</ul>` : html`<p class="muted small">No runs yet.</p>`}</section>
      <section class="card"><h3>Open data compliance</h3>
        <ul class="ticks small">
          <li>${d.license || 'City of Markham Open Data Licence v1.0'} attribution is shown on every screen.</li>
          <li>No claim of City of ${meta.city.name} endorsement or affiliation.</li>
          <li>Only allow-listed permit fields are ingested. Owner names, phone numbers and applicant details are never read or stored.</li>
          <li>No portal scraping. Live sources are official ArcGIS REST layers or an export feed you are authorised to use.</li>
        </ul><p class="legal-inline">${d.attribution}</p></section>
    </div>
    <section class="card"><h3>Go live with real data</h3>
      <p class="muted small">Set these environment variables, restart, then press Run Sync. Until then the app uses fixtures. ${d.live.builddata || d.live.arcgis || d.live.eplan ? 'A live source is configured.' : 'No live source is configured.'} Each sync of one city uses up to 5 of the BuildData key's 100 daily requests.</p>
      <pre class="code">BUILDDATA_API_KEY=your-key                            # real building permits (builddata.ca)
BUILDDATA_LOOKBACK_DAYS=120                           # free keys return records ~30+ days old
MARKHAM_ARCGIS_TREE_URL=https://…/FeatureServer/0     # tree permits layer
MARKHAM_ARCGIS_DEVAPP_URL=https://…/FeatureServer/0   # development applications layer
MARKHAM_EPLAN_JSON_URL=https://…/permits.json         # authorised building-permit export
MARKHAM_SYNC_DAYS=31                                  # how far back to pull</pre></section>
  </div>`;
}
