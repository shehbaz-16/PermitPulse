import { html, useState, useEffect, useCallback, useApp, api, qs, Icon, LEAD_STATUSES } from '/lib.js';
import { PermitCard, ExportBar } from '/views/feed.js';

export function SavedView() {
  const { tick, goto } = useApp();
  const [tab, setTab] = useState('all');
  const [items, setItems] = useState(null);
  const [sel, setSel] = useState(new Set());
  const load = useCallback(() => api.get(`/api/permits${qs({ bookmarked: '1', sort: 'status_change' })}`).then((r) => setItems(r.items)).catch(() => setItems([])), []);
  useEffect(() => { load(); }, [tick]);
  const onChange = useCallback((np) => setItems((xs) => xs.map((x) => (x.id === np.id ? { ...x, ...np } : x))), []);
  const onSelect = (id, on) => setSel((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });
  const shown = (items || []).filter((p) => tab === 'all' || p.lead_status === tab);
  const count = (k) => (items || []).filter((p) => k === 'all' || p.lead_status === k).length;
  const ids = [...sel].filter((id) => shown.some((p) => p.id === id));
  return html`<div class="view">
    <div class="view-head"><div><h1>Saved Leads</h1><p class="muted">Your watchlist and pipeline. Star a permit in the feed to track it here.</p></div></div>
    <div class="tabs">${[{ key: 'all', label: 'All saved' }, ...LEAD_STATUSES].map((t) => html`<button class=${tab === t.key ? 'on' : ''} onClick=${() => setTab(t.key)}>${t.label}<span>${count(t.key)}</span></button>`)}</div>
    ${items === null ? html`<div class="empty"><div class="spinner"></div></div>`
      : !items.length ? html`<div class="empty"><${Icon} name="star" size=${30} /><h3>No saved leads yet</h3><p class="muted">Tap the star on any permit to build your watchlist.</p><button class="btn btn-amber" onClick=${() => goto('feed')}>Browse the permit feed</button></div>`
      : html`<${ExportBar} total=${shown.length} selected=${new Set(ids)} filters=${{ bookmarked: '1', lead_status: tab, sort: 'status_change' }} onClearSel=${() => setSel(new Set())} onSelectAll=${() => setSel(new Set(shown.map((p) => p.id)))} />
        ${shown.length ? html`<div class="lead-grid">${shown.map((p) => html`<${PermitCard} key=${p.id} p=${p} selected=${sel.has(p.id)} onSelect=${onSelect} onChange=${(np) => { onChange(np); if (!np.bookmarked) load(); }} />`)}</div>` : html`<div class="empty"><p class="muted">No saved leads with this status.</p></div>`}`}
  </div>`;
}
