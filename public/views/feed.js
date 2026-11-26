import { MapView } from '/views/map.js';
import {
  html, useState, useEffect, useMemo, useCallback, useApp, api, qs, Icon, StatusPill, RadiusDiagram, useDebounced, useLocalState,
  ValueInfo, TRADES, CODES, LEAD_STATUSES, tradeLabel, whyLead, compactMoney, fmtMoney, filedLabel, daysAgo, fmtDate, updateLead, PRICING, fmtCents, withCity, valueCaption,
} from '/lib.js';

// ---------------------------------------------------------------------------------------------------------------
export function DemoBanner({ stats }) {
  const { meta } = useApp();
  const [collapsed, setCollapsed] = useLocalState('pp.banner.collapsed', false);
  const [demo, setDemo] = useLocalState('pp.demo.figures', meta.showDemo);
  const k = meta.demoKpis;
  const useWeek = (stats?.thisWeek ?? 0) > 0;
  const permits = demo ? k.permitsThisWeek : useWeek ? stats?.thisWeek ?? 0 : stats?.last90 ?? 0;
  const value = demo ? k.projectValue : useWeek ? stats?.thisWeekValue ?? 0 : stats?.last90Value ?? 0;
  const liveLabel = useWeek ? `New Permits This Week (${meta.city.name})` : `Permits in the Last 90 Days (${meta.city.name})`;
  const tiles = [
    { tone: 'emerald', icon: 'building', big: String(permits), label: demo ? `New Permits This Week (${meta.city.name})` : liveLabel, sub: `${compactMoney(value)} Estimated Project Value`, tag: demo ? 'Demo scenario' : 'Live from database' },
    { tone: 'navy', icon: 'target', big: String(TRADES.length), label: 'Services Covered', sub: 'Every permit is mapped to the services that usually win the follow-on work, with a plain-English reason why' },
    { tone: 'amber', icon: 'mail', big: fmtCents(PRICING.propertyCents), label: 'Per Permit Mailer', sub: `Postcard to the permit address, ${fmtCents(PRICING.neighbourCents)} per nearby home. Pay only for what you send.` },
    { tone: 'navy', icon: 'shield', big: '0', label: 'Personal Records Stored', sub: 'Public permit records only. Mail is addressed to “Current Resident”; no names, phones or emails are collected.' },
  ];
  return html`<section class=${`demo-banner ${collapsed ? 'collapsed' : ''}`} aria-label="Contractor demo mode and ROI proof">
    <div class="demo-head">
      <div class="demo-title"><span class="pill pill-amber">Contractor Demo Mode</span><h2>How PermitPulse Turns a Permit Into a Campaign</h2></div>
      <div class="demo-controls">
        <label class="demo-toggle"><span>Demo figures</span><button type="button" role="switch" aria-checked=${demo} class=${`switch switch-sm ${demo ? 'on' : ''}`} onClick=${() => setDemo(!demo)}><span></span></button></label>
        <button class="icon-btn light" onClick=${() => setCollapsed(!collapsed)} aria-label=${collapsed ? 'Expand banner' : 'Collapse banner'}><${Icon} name="chevron" class=${collapsed ? '' : 'rot'} /></button>
      </div>
    </div>
    ${!collapsed && html`<div class="kpi-grid">
      ${tiles.map((t) => html`<div class=${`kpi kpi-${t.tone}`}>
        <div class="kpi-top"><span class="kpi-icon"><${Icon} name=${t.icon} size=${16} /></span>${t.tag ? html`<span class="kpi-tag">${t.tag}</span>` : null}</div>
        <div class="kpi-big">${t.big}</div><div class="kpi-label">${t.label}</div><div class="kpi-sub">${t.sub}</div></div>`)}
    </div>
    <div class="demo-foot">Mailer prices are this demo's pay-as-you-go rates before HST. Permit counts above are ${demo ? 'a pitch scenario (switch “Demo figures” off for live counts from this database)' : `live counts from the ${stats?.total ?? 0} records in this database`}.</div>`}
  </section>`;
}

// ---------------------------------------------------------------------------------------------------------------
export function LeadStatusSelect({ value, onChange, compact }) {
  return html`<select class=${`lead-select ls-${value} ${compact ? 'compact' : ''}`} value=${value} onChange=${(e) => onChange(e.target.value)} aria-label="Lead status">
    ${LEAD_STATUSES.map((s) => html`<option value=${s.key}>${s.label}</option>`)}</select>`;
}

export function PermitCard({ p, selected, onSelect, onChange, tradeKey }) {
  const { openStudio, openDetails, toast, bump, meta } = useApp();
  const fresh = daysAgo(p.filed_at) <= 3 && p.lead_status === 'new';
  const issuedOnly = p.issued_at && new Date(p.issued_at).getTime() === new Date(p.filed_at).getTime();
  const issuedLabel = (iso) => { const d = daysAgo(iso); return d === 0 ? 'Issued today' : d === 1 ? 'Issued 1 day ago' : `Issued ${d} days ago`; };
  const why = tradeKey && p.trades.includes(tradeKey) ? whyLead(p.permit_code, tradeKey) : p.why;
  const patch = async (body) => {
    try { const r = await updateLead(p.id, body); onChange({ ...p, ...r }); bump(); if (body.bookmarked !== undefined) toast(body.bookmarked ? 'Saved to your watchlist' : 'Removed from watchlist'); }
    catch (e) { toast(e.message, 'err'); }
  };
  return html`<article class=${`lead-card ${selected ? 'selected' : ''}`}>
    <div class="lead-top">
      <label class="check"><input type="checkbox" checked=${selected} onChange=${(e) => onSelect(p.id, e.target.checked)} aria-label=${`Select ${p.permit_number}`} /></label>
      <span class="permit-no">${p.permit_number}</span>
      ${fresh ? html`<span class="pill pill-green"><${Icon} name="zap" size=${12} /> High-Intent / New Lead</span>` : null}
      <span class="grow"></span>
      <button class=${`star ${p.bookmarked ? 'on' : ''}`} onClick=${() => patch({ bookmarked: !p.bookmarked })} aria-pressed=${p.bookmarked} aria-label=${p.bookmarked ? 'Remove from watchlist' : 'Save to watchlist'}><${Icon} name="star" size=${19} /></button>
    </div>
    <div class="lead-tags">
      <span class="tag tag-hood"><${Icon} name="pin" size=${12} /> ${p.neighbourhood || meta.city.name}</span>
      <span class="tag">${p.permit_type}</span>
      <${StatusPill} status=${p.status} />
      <span class=${`pill ${p.is_demo ? 'pill-slate' : 'pill-blue'}`} title=${p.is_demo ? 'Fictional sample record for demos' : 'Real public permit record'}>${p.is_demo ? 'Demo record' : 'Public record'}</span>
      <span class="filed">${issuedOnly ? issuedLabel(p.issued_at) : filedLabel(p.filed_at)}</span>
    </div>
    <div class="lead-addr"><div><h3>${p.address}</h3><span class="muted">${meta.city.name}, ON${p.postal_fsa ? ` · ${p.postal_fsa}` : ''}</span></div>
      <div class="lead-value"><b>${p.est_value == null ? (p.is_demo ? 'Not disclosed' : 'Value not published') : fmtMoney(p.est_value)}</b><span>${valueCaption(p)} <${ValueInfo} /></span></div></div>
    <p class="scope">${p.scope}</p>
    ${(() => { const chips = [...(p.facts?.facts || []).map((x) => `${x.label}: ${x.value}`), ...(p.facts?.tags || [])].slice(0, 7); return chips.length ? html`<div class="fact-chips">${chips.map((c) => html`<span>${c}</span>`)}</div>` : null; })()}
    <div class="why"><div class="why-h"><${Icon} name="target" size=${14} /> Why This Is a Lead For You</div><p>${why}</p>
      <div class="why-trades">${p.trades.slice(0, 4).map((t) => html`<span class="chip">${tradeLabel(t)}</span>`)}</div></div>
    <div class="lead-actions">
      <button class="btn btn-amber" onClick=${() => openStudio(p)}><${Icon} name="send" size=${16} /> Launch Outreach (Mail + Social)</button>
      <button class="btn btn-ghost" onClick=${() => openDetails(p)}><${Icon} name="pin" size=${16} /> View Radius & Details</button>
      <${LeadStatusSelect} value=${p.lead_status} onChange=${(s) => patch({ status: s })} />
    </div>
  </article>`;
}

// ---------------------------------------------------------------------------------------------------------------
const csvUrl = (filters, ids) => withCity(`/api/permits.csv${qs({ ...filters, q: filters.q, ids: ids?.length ? ids.join(',') : undefined })}`);

export function Filters({ f, set, meta, onClear }) {
  const { openTradeAddon } = useApp();
  const ta = meta.tradeAccess;
  const isLocked = (k) => !ta.all && !ta.trades.includes(k);
  const pick = (k) => (isLocked(k) ? openTradeAddon(k) : set({ trade: k }));
  const quick = (days) => {
    const to = new Date(); const from = new Date(Date.now() - days * 86400000);
    const iso = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
    set({ from: iso(from), to: iso(to) });
  };
  return html`<div class="filters">
    <div class="search"><${Icon} name="search" size=${17} /><input type="search" placeholder="Search street, permit #, or keyword (e.g. pool, basement)" value=${f.q} onInput=${(e) => set({ q: e.target.value })} /></div>
    <div class="trade-chips" role="group" aria-label="Filter by service">
      <button class=${`tchip ${f.trade === 'all' ? 'on' : ''}`} onClick=${() => set({ trade: 'all' })}>${ta.all ? 'All services' : 'All my services'}</button>
      ${TRADES.filter((t) => !isLocked(t.key)).map((t) => html`<button key=${t.key} class=${`tchip ${f.trade === t.key ? 'on' : ''}`} onClick=${() => set({ trade: t.key })}>${t.short}</button>`)}
      ${!ta.all && TRADES.filter((t) => isLocked(t.key)).map((t) => html`<button key=${t.key} class="tchip locked" title=${`Add ${t.label} for $${PRICING.extraTradeCents / 100}/month`} onClick=${() => openTradeAddon(t.key)}><${Icon} name="lock" size=${11} /> ${t.short}</button>`)}
    </div>
    ${!ta.all && html`<p class="muted small">Your plan follows ${ta.trades.length} of ${ta.limit} services. Locked services are $${PRICING.extraTradeCents / 100}/month each, or switch to Pro for every service.</p>`}
    <div class="filter-row">
      <label>Your service<select value=${f.trade} onChange=${(e) => pick(e.target.value)}><option value="all">${ta.all ? 'All services' : 'All my services'}</option>${TRADES.map((t) => html`<option value=${t.key}>${t.label}${isLocked(t.key) ? ` (locked · $${PRICING.extraTradeCents / 100}/mo)` : ''}</option>`)}</select></label>
      <label>Neighbourhood<select value=${f.neighbourhood} onChange=${(e) => set({ neighbourhood: e.target.value })}><option value="all">All neighbourhoods</option>${meta.neighbourhoods.map((n) => html`<option value=${n.name}>${n.name}</option>`)}</select></label>
      <label>Permit type / code<select value=${f.code} onChange=${(e) => set({ code: e.target.value })}><option value="all">All permit types</option>${CODES.map((c) => html`<option value=${c.code}>${c.label}</option>`)}</select></label>
      <label>Status<select value=${f.status} onChange=${(e) => set({ status: e.target.value })}><option value="all">Any status</option>${meta.statuses.map((s) => html`<option value=${s}>${s}</option>`)}</select></label>
      <label>Filed from<input type="date" value=${f.from} onChange=${(e) => set({ from: e.target.value })} /></label>
      <label>Filed to<input type="date" value=${f.to} onChange=${(e) => set({ to: e.target.value })} /></label>
    </div>
    <div class="filter-row value-row">
      <label>Min est. value <${ValueInfo} /><select value=${f.value_min} onChange=${(e) => set({ value_min: e.target.value })}><option value="all">No minimum</option>${[10000, 25000, 50000, 100000, 250000, 500000, 1000000].map((v) => html`<option value=${String(v)}>${fmtMoney(v)}+</option>`)}</select></label>
      <label>Max est. value<select value=${f.value_max} onChange=${(e) => set({ value_max: e.target.value })}><option value="all">No maximum</option>${[25000, 50000, 100000, 250000, 500000, 1000000, 5000000].map((v) => html`<option value=${String(v)}>Up to ${fmtMoney(v)}</option>`)}</select></label>
      <label class="check-item has-value"><input type="checkbox" checked=${f.has_value === '1'} onChange=${(e) => set({ has_value: e.target.checked ? '1' : '' })} />Only permits that publish a value</label>
    </div>
    <div class="filter-foot">
      <div class="quick"><span>Quick range</span>${[[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '1 year']].map(([d, l]) => html`<button class="chip-btn" onClick=${() => quick(d)}>${l}</button>`)}<button class="chip-btn" onClick=${onClear}>Clear all</button></div>
      <label class="sort">Sort<select value=${f.sort} onChange=${(e) => set({ sort: e.target.value })}><option value="newest">Newest filed</option><option value="value">Highest project value</option><option value="status_change">Latest status change</option></select></label>
    </div>
  </div>`;
}

export const DEFAULT_FILTERS = { q: '', trade: 'all', neighbourhood: 'all', code: 'all', status: 'all', from: '', to: '', sort: 'newest', value_min: 'all', value_max: 'all', has_value: '' };

export function ExportBar({ total, selected, onClearSel, onSelectAll, filters }) {
  const n = selected.size;
  const href = csvUrl(filters, [...selected]);
  return html`<div class="export-bar">
    <label class="check"><input type="checkbox" checked=${n > 0 && n === total} onChange=${(e) => (e.target.checked ? onSelectAll() : onClearSel())} aria-label="Select all leads" /></label>
    <span>${n ? `${n} selected` : `${total} lead${total === 1 ? '' : 's'}`}</span>
    ${n ? html`<button class="chip-btn" onClick=${onClearSel}>Clear selection</button>` : null}
    <span class="grow"></span>
    <a class=${`btn btn-ghost btn-sm ${total === 0 ? 'disabled' : ''}`} href=${withCity(`/api/route-sheet${qs({ ...filters, q: filters.q, ids: n ? [...selected].join(',') : undefined })}`)} target="_blank" rel="noopener" title="Printable door-knock route for these permits"><${Icon} name="pin" size=${15} /> ${n ? `Door-knock sheet (${n})` : 'Door-knock sheet'}</a>
    <a class=${`btn btn-navy btn-sm ${total === 0 ? 'disabled' : ''}`} href=${href} download><${Icon} name="download" size=${15} /> ${n ? `Export ${n} to CSV` : `Export all ${total} to CSV`}</a>
  </div>`;
}

export function FeedView() {
  const { meta, tick, openDetails, openTradeAddon } = useApp();
  const [f, setF] = useState(DEFAULT_FILTERS);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const dq = useDebounced(f.q, 250);
  const [items, setItems] = useState([]);
  const [lockedTrade, setLockedTrade] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [view, setView] = useLocalState('pp.feed.view', 'list');
  const query = useMemo(() => ({ ...f, q: dq }), [f.trade, f.neighbourhood, f.code, f.status, f.from, f.to, f.sort, f.value_min, f.value_max, f.has_value, dq]);

  useEffect(() => { api.get('/api/stats').then(setStats).catch(() => {}); }, [tick]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    api.get(`/api/permits${qs(query)}`).then((r) => { if (live) { setItems(r.items); setLockedTrade(Boolean(r.locked)); setLoading(false); } }).catch(() => live && setLoading(false));
    return () => { live = false; };
  }, [query]);

  const onChange = useCallback((np) => setItems((xs) => xs.map((x) => (x.id === np.id ? { ...x, ...np } : x))), []);
  const onSelect = (id, on) => setSel((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });

  return html`<div class="view">
    <${DemoBanner} stats=${stats} />
    <div class="view-head"><div><h1>Live ${meta.city.name} Permit Feed</h1><p class="muted">Fresh municipal permits mapped to the services that win the follow-on work. Reach the home while the project is still being planned.</p></div>
      <div class="seg" role="tablist" aria-label="Feed view"><button role="tab" aria-selected=${view === 'list'} class=${view === 'list' ? 'on' : ''} onClick=${() => setView('list')}><${Icon} name="feed" size=${14} /> List</button><button role="tab" aria-selected=${view === 'map'} class=${view === 'map' ? 'on' : ''} onClick=${() => setView('map')}><${Icon} name="pin" size=${14} /> Map</button></div></div>
    <${Filters} f=${f} set=${set} meta=${meta} onClear=${() => setF(DEFAULT_FILTERS)} />
    <${ExportBar} total=${items.length} selected=${sel} filters=${query} onClearSel=${() => setSel(new Set())} onSelectAll=${() => setSel(new Set(items.map((i) => i.id)))} />
    ${lockedTrade ? html`<div class="empty"><${Icon} name="lock" size=${28} /><h3>${tradeLabel(f.trade)} isn't on your plan</h3><p class="muted">Add it for $${PRICING.extraTradeCents / 100}/month, or switch to Pro for every service.</p><button class="btn btn-amber" onClick=${() => openTradeAddon(f.trade)}>Add ${tradeLabel(f.trade)}</button></div>`
      : loading && !items.length ? html`<div class="empty"><div class="spinner"></div></div>`
      : !items.length ? html`<div class="empty"><${Icon} name="search" size=${28} /><h3>No permits match these filters</h3><p class="muted">Try clearing a filter or widening the date range.</p><button class="btn btn-ghost" onClick=${() => setF(DEFAULT_FILTERS)}>Clear filters</button></div>`
      : view === 'map' ? html`<${MapView} items=${items} />`
      : html`<div class=${`lead-grid ${loading ? 'dim' : ''}`}>${items.map((p) => html`<${PermitCard} key=${p.id} p=${p} tradeKey=${f.trade === 'all' ? null : f.trade} selected=${sel.has(p.id)} onSelect=${onSelect} onChange=${onChange} />`)}</div>`}
  </div>`;
}

// ---------------------------------------------------------------------------------------------------------------
function AiSummary({ permit }) {
  const { meta, toast } = useApp();
  const [e, setE] = useState(permit.enrichment || null);
  const [busy, setBusy] = useState(false);
  const run = async (refresh) => {
    setBusy(true);
    try { setE((await api.post(`/api/permits/${permit.id}/enrich`, { refresh })).enrichment); } catch (x) { toast(x.message, 'err'); }
    setBusy(false);
  };
  return html`<div class="ai-box">
    <div class="ai-head"><b>AI summary</b>${e ? html`<button class="link" disabled=${busy} onClick=${() => run(true)}>${busy ? 'Working…' : 'Regenerate'}</button>` : null}</div>
    ${e ? html`<p>${e.summary}</p>
        ${e.included.length ? html`<ul>${e.included.map((x) => html`<li>${x}</li>`)}</ul>` : null}
        ${e.opportunity ? html`<p><b>Opportunity:</b> ${e.opportunity}</p>` : null}
        ${e.ask.length ? html`<p><b>Ask the homeowner:</b></p><ul>${e.ask.map((x) => html`<li>${x}</li>`)}</ul>` : null}
        <small>Written by AI from this permit record only (no address or contact data is sent). It can only restate what the record says. Check before quoting.</small>`
      : meta.aiEnabled ? html`<p class="muted small">Turns the permit text into a plain-English summary, what the work includes and questions to ask.</p><button class="btn btn-ghost btn-sm" disabled=${busy} onClick=${() => run(false)}>${busy ? 'Writing…' : 'Generate AI summary'}</button>`
      : html`<p class="muted small">AI summaries are off. Add <code>ANTHROPIC_API_KEY</code> to your <code>.env</code> and restart to enable them. Only the permit text is sent, never the address or contact data.</p>`}
  </div>`;
}

export function DetailsDrawer({ permit, onClose }) {
  const { openStudio, toast, bump, meta } = useApp();
  const [p, setP] = useState(permit);
  const [notes, setNotes] = useState(permit.notes || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const patch = async (body) => {
    setSaving(true);
    try { const r = await updateLead(p.id, body); setP({ ...p, ...r }); bump(); if (body.notes !== undefined) toast('Notes saved'); }
    catch (e) { toast(e.message, 'err'); }
    setSaving(false);
  };
  const mailCost = PRICING.propertyCents + 50 * PRICING.neighbourCents;
  const rows = [['Permit type', p.permit_type], ['Category', p.category], ['Status', p.status], ['Filed', fmtDate(p.filed_at)], ['Issued', p.issued_at ? fmtDate(p.issued_at) : 'Not yet issued'],
    ['Postal area', p.postal_fsa || '—'], ['Neighbourhood', p.neighbourhood || '—'], ['Data source', p.source_key]];
  return html`<div class="drawer-wrap" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
    <aside class="drawer" role="dialog" aria-label="Permit details">
      <div class="drawer-head"><div><span class="permit-no">${p.permit_number}</span><h2>${p.address}</h2><span class="muted">${p.neighbourhood ? `${p.neighbourhood}, ` : ''}${meta.city.name} ON · ${p.est_value == null ? `Value not published (${valueCaption(p).toLowerCase()})` : `${fmtMoney(p.est_value)} · ${valueCaption(p).toLowerCase()}`} <${ValueInfo} /></span></div>
        <button class="icon-btn" onClick=${onClose} aria-label="Close"><${Icon} name="x" /></button></div>
      <div class="drawer-body">
        <p class="scope big">${p.scope}</p>
        <div class="detail-grid">${rows.map(([k, v]) => html`<div><span>${k}</span><b>${v}</b></div>`)}</div>
        <h4>Project details</h4>
        ${(() => { const rows2 = [...(p.facts?.facts || []).map((x) => [x.label, x.value]), ...Object.entries(p.details || {})]; return html`${p.facts?.tags?.length ? html`<div class="fact-chips">${p.facts.tags.map((t) => html`<span>${t}</span>`)}</div>` : null}
          ${rows2.length ? html`<div class="detail-grid">${rows2.map(([k, v]) => html`<div><span>${k}</span><b>${v}</b></div>`)}</div>` : html`<p class="muted small">The city published only the description above for this permit. No further details are available.</p>`}`; })()}
        <${AiSummary} permit=${p} />
        <h4>Radius reach</h4>
        <${RadiusDiagram} homes=${50} street=${p.street_name} />
        <p class="muted small">Mail this property plus up to 50 nearest neighbours: <b>${fmtCents(mailCost)}</b> total (${fmtCents(PRICING.propertyCents)} + 50 × ${fmtCents(PRICING.neighbourCents)}). Homes nearest the permit see your mailer first.</p>
        <h4>Why this is a lead for you</h4>
        ${p.trades.map((t) => html`<div class="why why-sm"><div class="why-h">${tradeLabel(t)}</div><p>${whyLead(p.permit_code, t)}</p></div>`)}
        <h4>Your pipeline</h4>
        <div class="seg">${LEAD_STATUSES.map((s) => html`<button class=${p.lead_status === s.key ? 'on' : ''} onClick=${() => patch({ status: s.key })}>${s.label}</button>`)}</div>
        <label class="notes">Internal notes<textarea rows="4" placeholder="Call log, quote amount, gate code, anything your crew needs…" value=${notes} onInput=${(e) => setNotes(e.target.value)} maxlength="4000"></textarea></label>
        <div class="drawer-actions">
          <button class="btn btn-navy btn-sm" disabled=${saving || notes === (p.notes || '')} onClick=${() => patch({ notes })}>Save notes</button>
          <button class=${`btn btn-ghost btn-sm`} onClick=${() => patch({ bookmarked: !p.bookmarked })}><${Icon} name="star" size=${15} /> ${p.bookmarked ? 'Saved' : 'Save lead'}</button>
          <a class="btn btn-ghost btn-sm" href=${withCity(`/api/permits.csv?ids=${p.id}`)} download><${Icon} name="download" size=${15} /> CSV</a>
        </div>
      </div>
      <div class="drawer-foot"><button class="btn btn-amber btn-block" onClick=${() => openStudio(p)}><${Icon} name="send" size=${16} /> Launch Outreach (Mail + Social)</button></div>
    </aside></div>`;
}
