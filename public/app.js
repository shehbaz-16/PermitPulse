import { html, render, useState, useEffect, useCallback, useRef, AppCtx, api, Icon, Modal, TRADES, tradeLabel, getCity, setCity, PRICING, fmtCents } from '/lib.js';
import { FeedView, DetailsDrawer } from '/views/feed.js';
import { Studio } from '/views/studio.js';
import { SavedView } from '/views/saved.js';
import { CampaignsView } from '/views/campaigns.js';
import { AlertsView } from '/views/alerts.js';
import { PlansView } from '/views/plans.js';
import { SyncView } from '/views/sync.js';
import { RequestsView } from '/views/requests.js';

const ROUTES = [
  { key: 'feed', label: 'Permit Feed', icon: 'feed' },
  { key: 'saved', label: 'Saved Leads', icon: 'star' },
  { key: 'campaigns', label: 'Sent Campaigns', icon: 'send' },
  { key: 'alerts', label: 'Daily Alerts', icon: 'bell' },
  { key: 'plans', label: 'Plans & Cities', icon: 'target' },
  { key: 'sync', label: 'Data & Sync', icon: 'database' },
  { key: 'requests', label: 'Social Requests', icon: 'edit', team: true },
];
const routeFromHash = () => {
  const k = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
  return ROUTES.some((r) => r.key === k) ? k : 'feed';
};

function CitySelector({ meta, onPickSoon, onPickCity, onPickAddon }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const active = meta.cities.find((c) => c.city_slug === meta.city.slug);
  return html`<div class="city" ref=${ref}>
    <button class="city-btn" onClick=${() => setOpen(!open)} aria-haspopup="listbox" aria-expanded=${open}>
      <span class="dot-live"></span>
      <span class="city-name">${active.name}, ${active.province} <em>(Live)</em></span>
      <${Icon} name="chevron" size=${16} />
    </button>
    ${open && html`<div class="city-menu" role="listbox">
      <div class="city-group">Included in your plan · ${PRICING.includedCities} cities</div>
      ${meta.cities.filter((c) => c.status === 'active').map((c) => html`<button key=${c.city_slug} class=${`city-item ${c.city_slug === meta.city.slug ? 'selected' : ''}`} role="option" aria-selected=${c.city_slug === meta.city.slug} onClick=${() => { setOpen(false); onPickCity(c.city_slug); }}>
            <span class="dot-live"></span><span>${c.name}, ${c.province} <em>(Live)</em></span>${c.city_slug === meta.city.slug ? html`<${Icon} name="check" size=${16} />` : null}</button>`)}
      <div class="city-group">Add a city · ${fmtCents(PRICING.extraCityCents).replace('.00', '')}/mo each</div>
      ${meta.cities.filter((c) => c.addon).map((c) => html`<button key=${c.city_slug} class="city-item locked" role="option" onClick=${() => { setOpen(false); onPickAddon(c); }}>
            <${Icon} name="lock" size=${15} /><span>${c.name}, ${c.province}</span><span class="badge-addon">Add-on</span></button>`)}
      <div class="city-group">Coming soon</div>
      ${meta.cities.filter((c) => c.status !== 'active' && !c.addon).map((c) => html`<button key=${c.city_slug} class="city-item locked" role="option" onClick=${() => { setOpen(false); onPickSoon(c); }}>
            <${Icon} name="lock" size=${15} /><span>${c.name}, ${c.province}</span><span class="badge-soon">Join waitlist</span></button>`)}
    </div>`}
  </div>`;
}

function WaitlistModal({ city, meta, contractor, onClose, toast }) {
  const [trade, setTrade] = useState(contractor.trade);
  const [company, setCompany] = useState(contractor.company_name);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { setDone(await api.post('/api/waitlist', { city_slug: city.city_slug, trade, company, email })); }
    catch (x) { setErr(x.message); }
    setBusy(false);
  };
  return html`<${Modal} title=${`Reserve early access: ${city.name}, ON`} onClose=${onClose}>
    ${done ? html`<div class="center-stack">
        <div class="big-check"><${Icon} name="check" size=${30} /></div>
        <h3>Territory request received</h3>
        <p class="muted">You are #${done.position} on the ${tradeLabel(trade)} early-access list for ${done.city}. Waitlist members get first pick of exclusive territories when ${done.city} launches.</p>
        <button class="btn btn-navy" onClick=${onClose}>Done</button></div>`
      : html`<form onSubmit=${submit} class="form-stack">
        <div class="soon-banner"><${Icon} name="lock" size=${18} /><div><b>${city.name} is not live yet.</b> Lock your service before competitors do. Exclusive Pro territories are capped at 2 contractors per service.</div></div>
        <label>Your service<select value=${trade} onChange=${(e) => setTrade(e.target.value)}>${TRADES.map((t) => html`<option value=${t.key}>${t.label}</option>`)}</select></label>
        <label>Company name<input value=${company} onInput=${(e) => setCompany(e.target.value)} maxlength="80" required /></label>
        <label>Work email<input type="email" value=${email} onInput=${(e) => setEmail(e.target.value)} placeholder="you@company.ca" required /></label>
        ${err && html`<div class="form-error">${err}</div>`}
        <button class="btn btn-amber" disabled=${busy}>${busy ? 'Reserving…' : `Reserve ${city.name} territory`}</button>
      </form>`}
  <//>`;
}

export function AddonCityModal({ city, meta, contractor, onClose }) {
  const [trade, setTrade] = useState(contractor.trade);
  const [company, setCompany] = useState(contractor.company_name);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const live = meta.cities.filter((c) => c.status === 'active').map((c) => c.name);
  const price = fmtCents(PRICING.extraCityCents).replace('.00', '');
  const unlimited = fmtCents(PRICING.unlimitedCitiesCents).replace('.00', '');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await api.post('/api/cities/addon', { city_slug: city.city_slug, trade, company, email }); setDone(true); }
    catch (x) { setErr(x.message); }
    setBusy(false);
  };
  return html`<${Modal} title=${`Add ${city.name} to your plan`} onClose=${onClose}>
    ${done ? html`<div class="center-stack">
        <div class="big-check"><${Icon} name="check" size=${30} /></div>
        <h3>${city.name} add-on requested</h3>
        <p class="muted">We'll switch on ${city.name} permits for your account at ${price}/month. Demo mode: no payment was taken.</p>
        <button class="btn btn-navy" onClick=${onClose}>Done</button></div>`
      : html`<form onSubmit=${submit} class="form-stack">
        <div class="addon-price"><b>${price}</b><span>/month per extra city, added to your plan</span></div>
        <p class="muted small">Every plan includes ${PRICING.includedCities} cities: ${live.join(', ')}. Each city beyond that is ${price}/month, or unlock every covered Ontario city for ${unlimited}/month.</p>
        <label>Your service<select value=${trade} onChange=${(e) => setTrade(e.target.value)}>${TRADES.map((t) => html`<option value=${t.key}>${t.label}</option>`)}</select></label>
        <label>Company name<input value=${company} onInput=${(e) => setCompany(e.target.value)} maxlength="80" required /></label>
        <label>Work email<input type="email" value=${email} onInput=${(e) => setEmail(e.target.value)} placeholder="you@company.ca" required /></label>
        ${err && html`<div class="form-error">${err}</div>`}
        <button class="btn btn-amber" disabled=${busy}>${busy ? 'Requesting…' : `Add ${city.name} for ${price}/mo`}</button>
        <p class="demo-note">Demo mode: no payment is collected.</p>
      </form>`}
  <//>`;
}

function TradeAddonModal({ trade, meta, onClose, onAdded }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const ta = meta.tradeAccess;
  const price = fmtCents(PRICING.extraTradeCents).replace('.00', '');
  const add = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.post('/api/trades/addon', { trade });
      if (r.url) { window.location.href = r.url; return; }
      setDone(true); onAdded();
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  return html`<${Modal} title=${`Add ${tradeLabel(trade)}`} onClose=${onClose}>
    ${done ? html`<div class="center-stack"><div class="big-check"><${Icon} name="check" size=${30} /></div><h3>${tradeLabel(trade)} added</h3>
        <p class="muted">Its permits now show in your feed and alerts. Demo mode: no payment was taken.</p><button class="btn btn-navy" onClick=${onClose}>Done</button></div>`
      : ta.all ? html`<div class="form-stack"><p class="muted">${meta.contractor.plan_status === 'active' ? 'Your plan already includes every service.' : 'Choose a plan first: Starter Scout includes 3 services, Pro includes every service.'}</p><button class="btn btn-navy" onClick=${onClose}>OK</button></div>`
      : html`<div class="form-stack">
        <div class="addon-price"><b>${price}</b><span>/month per extra service, added to Starter Scout</span></div>
        <p class="muted small">Your plan includes ${ta.included} services${ta.extra ? ` plus ${ta.extra} add-on${ta.extra === 1 ? '' : 's'}` : ''}: ${ta.trades.map(tradeLabel).join(', ')}. Adding ${tradeLabel(trade)} shows its permits in your feed and alerts. Or switch to Exclusive Neighborhood Pro ($399/month) for every service.</p>
        ${err && html`<div class="form-error">${err}</div>`}
        <button class="btn btn-amber" disabled=${busy} onClick=${add}>${busy ? 'Working…' : meta.billing.enabled ? `Continue to payment · ${price}/mo + HST` : `Add ${tradeLabel(trade)} for ${price}/mo`}</button>
        <p class="demo-note">${meta.billing.enabled ? 'Secure monthly billing by Stripe. Cancel anytime.' : 'Demo mode: no payment is collected.'}</p>
      </div>`}
  <//>`;
}

function ProfileModal({ contractor, onClose, onSaved }) {
  const [name, setName] = useState(contractor.company_name);
  const [trade, setTrade] = useState(contractor.trade);
  const [fb, setFb] = useState(contractor.facebook_page || '');
  const [ig, setIg] = useState(contractor.instagram_handle ? '@' + contractor.instagram_handle : '');
  const [nd, setNd] = useState(contractor.nextdoor_name || '');
  const [err, setErr] = useState('');
  const save = async (e) => {
    e.preventDefault();
    try { onSaved(await api.put('/api/contractor', { company_name: name, trade, facebook_page: fb, instagram_handle: ig, nextdoor_name: nd })); onClose(); } catch (x) { setErr(x.message); }
  };
  return html`<${Modal} title="Contractor profile" onClose=${onClose}>
    <form onSubmit=${save} class="form-stack">
      <p class="muted">Pitching to a prospect? Swap in their company name, main service and social pages. Every mailer, ad preview and alert updates instantly.</p>
      <label>Company name<input value=${name} onInput=${(e) => setName(e.target.value)} maxlength="80" required /></label>
      <label>Main service<select value=${trade} onChange=${(e) => setTrade(e.target.value)}>${TRADES.map((t) => html`<option value=${t.key}>${t.label}</option>`)}</select></label>
      <div class="sub-h">Social profiles <small>used for ad previews</small></div>
      <label>Facebook Page<input value=${fb} onInput=${(e) => setFb(e.target.value)} placeholder="facebook.com/yourcompany" /></label>
      <label>Instagram handle<input value=${ig} onInput=${(e) => setIg(e.target.value)} placeholder="@yourcompany" /></label>
      <label>Nextdoor business page<input value=${nd} onInput=${(e) => setNd(e.target.value)} placeholder="Your company name on Nextdoor" maxlength="80" /></label>
      <p class="demo-note">Proof of concept: these only drive the previews. Nothing is connected to Meta or Nextdoor, and nothing is posted.</p>
      ${err && html`<div class="form-error">${err}</div>`}
      <button class="btn btn-navy">Save profile</button>
    </form>
  <//>`;
}

function App() {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [route, setRoute] = useState(routeFromHash());
  const [studio, setStudio] = useState(null);
  const [details, setDetails] = useState(null);
  const [waitlist, setWaitlist] = useState(null);
  const [addonCity, setAddonCity] = useState(null);
  const [addonTrade, setAddonTrade] = useState(null);
  const [citySlug, setCitySlug] = useState(getCity());
  const [profile, setProfile] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [tick, setTick] = useState(0);
  const [counts, setCounts] = useState({ saved: 0, campaigns: 0, requests: 0 });

  const toast = useCallback((msg, kind = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  const bump = useCallback(() => setTick((x) => x + 1), []);
  const goto = useCallback((k) => { location.hash = `#/${k}`; }, []);

  useEffect(() => { // returning from Stripe Checkout
    const q = new URLSearchParams(location.search);
    const checkout = q.get('checkout');
    if (!checkout) return;
    history.replaceState(null, '', `${location.pathname}${location.hash}`);
    if (checkout === 'cancelled') { toast('Payment cancelled. Nothing was charged.', 'err'); return; }
    api.get(`/api/billing/verify?session_id=${encodeURIComponent(q.get('session_id') || '')}`)
      .then((r) => {
        toast(r.applied ? (r.kind === 'plan' ? 'Payment received. Your plan is active.' : 'Payment received. Your campaign is confirmed.') : 'Payment is still processing. Refresh in a minute.', r.applied ? 'ok' : 'err');
        bump();
        api.get('/api/meta').then(setMeta).catch(() => {});
      })
      .catch((e) => toast(e.message, 'err'));
  }, []);

  useEffect(() => {
    const h = () => { setRoute(routeFromHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  useEffect(() => {
    setCity(citySlug);
    api.get('/api/meta').then((m) => {
      if (m.city.status !== 'active' && citySlug !== 'markham') { setCitySlug('markham'); return; }
      setMeta(m);
    }).catch((e) => (citySlug !== 'markham' ? setCitySlug('markham') : setError(e.message)));
  }, [citySlug]);

  useEffect(() => {
    if (!meta) return;
    Promise.all([api.get('/api/permits?bookmarked=1'), api.get('/api/campaigns'), api.get('/api/social-requests?status=new')])
      .then(([a, b, c]) => setCounts({ saved: a.total, campaigns: b.total, requests: c.newCount })).catch(() => {});
  }, [meta, tick]);

  if (error) return html`<div class="boot"><h2>Could not reach the PermitPulse API</h2><p>${error}</p><p>Is the server running? Try <code>npm start</code>.</p></div>`;
  if (!meta) return html`<div class="boot"><div class="spinner"></div><p>Loading permit data…</p></div>`;

  const ctx = {
    meta, contractor: meta.contractor, city: meta.city, toast, bump, tick, goto,
    openStudio: (p) => { setDetails(null); setStudio(p); },
    openDetails: (p) => setDetails(p),
    openProfile: () => setProfile(true),
    openAddon: (c) => setAddonCity(c),
    openTradeAddon: (t) => setAddonTrade(t),
    reloadMeta: () => api.get('/api/meta').then((m) => { setMeta(m); bump(); }).catch(() => {}),
    switchCity: (slug) => { setStudio(null); setDetails(null); setCitySlug(slug); },
  };
  const View = { feed: FeedView, saved: SavedView, campaigns: CampaignsView, alerts: AlertsView, plans: PlansView, sync: SyncView, requests: RequestsView }[route];

  return html`<${AppCtx.Provider} value=${ctx}>
    <div class="app">
      <header class="topbar">
        <a class="brand" href="/" title="Back to the PermitPulse home page" style="text-decoration:none"><span class="brand-mark"><${Icon} name="pulse" size=${20} stroke=${2.4} /></span><span>PermitPulse <b>Ontario</b></span></a>
        <${CitySelector} meta=${meta} onPickSoon=${setWaitlist} onPickAddon=${setAddonCity}
          onPickCity=${(slug) => { if (slug !== meta.city.slug) { setStudio(null); setDetails(null); setCitySlug(slug); } }} />
        <div class="grow"></div>
        <button class="company-chip" onClick=${() => setProfile(true)} title="Edit the demo contractor profile">
          <span class="avatar-sm">${(meta.contractor.company_name || '?').slice(0, 1)}</span>
          <span class="company-text"><b>${meta.contractor.company_name}</b><small>${tradeLabel(meta.contractor.trade)}</small></span>
          <${Icon} name="edit" size=${14} />
        </button>
      </header>
      <div class="shell">
        <nav class="sidebar" aria-label="Main">
          ${ROUTES.map((r) => html`${r.team ? html`<div class="nav-group">PermitPulse team</div>` : null}<a key=${r.key} href=${`#/${r.key}`} class=${`nav-item ${route === r.key ? 'active' : ''}`} title=${r.label}>
            <${Icon} name=${r.icon} size=${19} /><span class="nav-label">${r.label}</span>
            ${r.key === 'saved' && counts.saved ? html`<span class="nav-count">${counts.saved}</span>` : null}
            ${r.key === 'campaigns' && counts.campaigns ? html`<span class="nav-count">${counts.campaigns}</span>` : null}
            ${r.key === 'requests' && counts.requests ? html`<span class="nav-count">${counts.requests}</span>` : null}
          </a>`)}
          <div class="sidebar-foot"><${Icon} name="shield" size=${15} /><span>No personal data. Public permit records only.</span></div>
        </nav>
        <main class="main"><${View} key=${route + meta.city.slug} /><footer class="legal">${meta.city.attribution}</footer></main>
      </div>
      ${studio && html`<${Studio} permit=${studio} onClose=${() => setStudio(null)} />`}
      ${details && html`<${DetailsDrawer} permit=${details} onClose=${() => setDetails(null)} />`}
      ${waitlist && html`<${WaitlistModal} city=${waitlist} meta=${meta} contractor=${meta.contractor} toast=${toast} onClose=${() => setWaitlist(null)} />`}
      ${addonCity && html`<${AddonCityModal} city=${addonCity} meta=${meta} contractor=${meta.contractor} onClose=${() => setAddonCity(null)} />`}
      ${addonTrade && html`<${TradeAddonModal} trade=${addonTrade} meta=${meta} onClose=${() => setAddonTrade(null)} onAdded=${() => ctx.reloadMeta()} />`}
      ${profile && html`<${ProfileModal} contractor=${meta.contractor} onClose=${() => setProfile(false)} onSaved=${(c) => { setMeta({ ...meta, contractor: c }); toast('Demo profile updated'); }} />`}
      <div class="toasts" aria-live="polite">${toasts.map((t) => html`<div key=${t.id} class=${`toast toast-${t.kind}`}>${t.msg}</div>`)}</div>
    </div>
  <//>`;
}

render(html`<${App} />`, document.getElementById('app'));
