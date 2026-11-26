import { html, useState, useEffect, useApp, api, Icon, Modal, TRADES, tradeLabel, PRICING, fmtCents } from '/lib.js';

const money = (c) => fmtCents(c).replace('.00', '');
const included = `${PRICING.includedCities} cities included`;

const PLANS = [
  { key: 'starter', name: 'Starter Scout', price: 149, tag: 'Get in the game',
    blurb: 'Know about every relevant permit the day it is filed.',
    feats: ['Daily Email, SMS & WhatsApp alerts', `${PRICING.includedTrades.starter} services of your choice (+${money(PRICING.extraTradeCents)}/mo per extra service)`, `${included} (Markham, Toronto, Vaughan)`, 'Pay-as-you-go direct mailers ($2.50 property, $1.35 neighbour)', 'Done-for-you social campaigns: $99 setup + your own ad budget', 'Printable door-knock sheets if you want to visit sites yourself', 'Saved leads, notes & CSV export'] },
  { key: 'pro', name: 'Exclusive Neighborhood Pro', price: 399, tag: 'Own your territory', featured: true,
    blurb: 'Lock your service in up to 3 neighbourhoods. Only 2 contractors per service per city.',
    feats: [`Every service included (all ${TRADES.length})`, 'Exclusive lock on your service in up to 3 neighbourhoods', 'Capped at 2 contractors per service in each city', `${included} (Markham, Toronto, Vaughan)`, '50 automated neighbour postcards or letters every month', '1 done-for-you social campaign set up every month, no setup fee (ad budget paid separately)', 'Everything in Starter Scout'] },
];

function ReserveModal({ plan, slots, interval, onClose, onDone }) {
  const { meta, contractor } = useApp();
  const [trade, setTrade] = useState(contractor.trade);
  const [company, setCompany] = useState(contractor.company_name);
  const [email, setEmail] = useState('');
  const [hoods, setHoods] = useState([]);
  const [moreTrades, setMoreTrades] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [out, setOut] = useState(null);
  const slot = slots.find((s) => s.trade === trade);
  const pro = plan.key === 'pro';
  const toggle = (n) => setHoods((h) => (h.includes(n) ? h.filter((x) => x !== n) : h.length < 3 ? [...h, n] : h));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = await api.post('/api/territory/reserve', { plan: plan.key, trade, trades: [trade, ...moreTrades.filter((k) => k !== trade)], company, email, neighbourhoods: hoods });
      if (r.billing) { window.location.href = (await api.post('/api/billing/plan-checkout', { plan: plan.key, email, interval })).url; return; }
      setOut(r.outcome); onDone();
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  const msg = { pro_territory_reserved: ['Territory reserved', `You hold one of two ${tradeLabel(trade)} slots in ${hoods.join(', ')}, ${meta.city.name}. Demo mode: no payment was taken.`],
    pro_waitlisted_trade_full: ['This service is full: you are on the waitlist', `Both ${tradeLabel(trade)} slots in ${meta.city.name} are taken. We will contact you if one opens up.`],
    starter_subscribed_demo: ['Starter Scout activated (demo)', 'Daily alerts are ready to configure. Demo mode: no payment was taken.'] }[out];
  return html`<${Modal} title=${`${plan.name} · ${interval === 'year' ? `${money(PRICING.plans[plan.key].annualCents)}/yr` : `$${plan.price}/mo`} CAD`} onClose=${onClose}>
    ${out ? html`<div class="center-stack"><div class=${`big-check ${out === 'pro_waitlisted_trade_full' ? 'amber' : ''}`}><${Icon} name="check" size=${30} /></div><h3>${msg[0]}</h3><p class="muted">${msg[1]}</p><button class="btn btn-navy" onClick=${onClose}>Done</button></div>`
      : html`<form class="form-stack" onSubmit=${submit}>
        <label>Your service<select value=${trade} onChange=${(e) => setTrade(e.target.value)}>${TRADES.map((t) => html`<option value=${t.key}>${t.label}</option>`)}</select></label>
        ${!pro && html`<div><div class="sub-h">Pick up to ${PRICING.includedTrades.starter - 1} more services <small>${moreTrades.filter((k) => k !== trade).length}/${PRICING.includedTrades.starter - 1}</small></div>
          <div class="check-grid">${TRADES.filter((t) => t.key !== trade).map((t) => { const on = moreTrades.includes(t.key); return html`<label class=${`check-item ${on ? 'on' : ''}`}><input type="checkbox" checked=${on}
            onChange=${() => setMoreTrades((m) => (on ? m.filter((x) => x !== t.key) : m.filter((x) => x !== trade).length < PRICING.includedTrades.starter - 1 ? [...m, t.key] : m))} />${t.short}</label>`; })}</div>
          <p class="muted small">More services later: ${money(PRICING.extraTradeCents)}/month each.</p></div>`}
        ${pro && slot && html`<div class=${`slot-note ${slot.remaining === 0 ? 'full' : ''}`}>${slot.remaining === 0 ? 'Both slots for this service are taken. You can still join the waitlist.' : `${slot.remaining} of ${slot.total_slots} ${tradeLabel(trade)} slot${slot.remaining === 1 ? '' : 's'} left in ${meta.city.name} (demo availability).`}</div>`}
        ${pro && html`<div><div class="sub-h">Choose up to 3 ${meta.city.name} areas <small>${hoods.length}/3</small></div>
          ${meta.neighbourhoods.length ? html`<div class="check-grid">${meta.neighbourhoods.map((n) => html`<label class=${`check-item ${hoods.includes(n.name) ? 'on' : ''}`}><input type="checkbox" checked=${hoods.includes(n.name)} onChange=${() => toggle(n.name)} />${n.name}</label>`)}</div>`
            : html`<p class="muted small">No areas loaded for ${meta.city.name} yet. Run a sync in Data & Sync first.</p>`}</div>`}
        <label>Company name<input value=${company} onInput=${(e) => setCompany(e.target.value)} maxlength="80" required /></label>
        <label>Work email<input type="email" value=${email} onInput=${(e) => setEmail(e.target.value)} placeholder="you@company.ca" required /></label>
        ${err && html`<div class="form-error">${err}</div>`}
        <button class="btn btn-amber" disabled=${busy}>${busy ? 'Working…' : meta.billing.enabled ? `Start ${PRICING.trialDays}-day free trial` : pro ? 'Lock my territory' : 'Start Starter Scout'}</button>
        <p class="demo-note">${meta.billing.enabled ? `Free for ${PRICING.trialDays} days, then ${interval === 'year' ? `${money(PRICING.plans[plan.key].annualCents)}/year` : `$${plan.price}/month`} + HST. Card required, cancel anytime before the trial ends and pay nothing.${meta.billing.mode === 'test' ? ' Test mode: card 4242 4242 4242 4242.' : ''}` : 'Demo mode: no payment is collected.'}</p></form>`}
  <//>`;
}

function TradesCard() {
  const { meta, toast, openTradeAddon, reloadMeta } = useApp();
  const ta = meta.tradeAccess;
  const [picked, setPicked] = useState(ta.trades);
  const [busy, setBusy] = useState(false);
  const dirty = picked.join() !== ta.trades.join();
  const save = async () => {
    setBusy(true);
    try { await api.put('/api/contractor/trades', { trades: picked }); toast('Your services are updated'); reloadMeta(); }
    catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  const toggle = (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : ta.all || p.length < ta.limit ? [...p, k] : p));
  return html`<section class="card">
    <div class="panel-title"><h3>Your services</h3><span class="pill pill-slate">${ta.all ? `All ${TRADES.length} services` : `${picked.length} of ${ta.limit} used`}</span></div>
    <p class="muted small">${ta.all
      ? (meta.contractor.plan_status === 'active' ? 'Your plan includes every service. Ticked services are your favourites for alerts.' : `Free trial: every service is visible. Starter Scout includes ${PRICING.includedTrades.starter} services (+${money(PRICING.extraTradeCents)}/month each extra); Pro includes all ${TRADES.length}.`)
      : `Starter Scout includes ${ta.included} services${ta.extra ? ` plus ${ta.extra} paid add-on${ta.extra === 1 ? '' : 's'}` : ''}. Swap them anytime, or add more for ${money(PRICING.extraTradeCents)}/month each.`}</p>
    <div class="trade-pick">${TRADES.map((t) => {
      const on = picked.includes(t.key);
      const full = !ta.all && !on && picked.length >= ta.limit;
      return html`<div class=${`city-plan-item ${on ? 'included' : ''}`}>
        <label class="check-row"><input type="checkbox" checked=${on} disabled=${full} onChange=${() => toggle(t.key)} /> ${t.label}</label>
        ${full && html`<button class="btn btn-ghost btn-sm" onClick=${() => openTradeAddon(t.key)}>+ ${money(PRICING.extraTradeCents)}/mo</button>`}
      </div>`;
    })}</div>
    <div class="row-gap" style="margin-top:12px"><button class="btn btn-navy btn-sm" disabled=${!dirty || busy || !picked.length} onClick=${save}>${busy ? 'Saving…' : 'Save my services'}</button></div>
  </section>`;
}

function RouteSheetNote() {
  return html`<section class="card">
    <div class="panel-title"><h3>Visiting sites yourself</h3><span class="pill pill-slate">Free in every plan</span></div>
    <p class="muted small">Prefer to drop by in person? Select permits in the feed and print a <b>door-knock sheet</b>: addresses grouped by street, a suggested opener, the project for context, and boxes to track each visit. When and whether to visit is entirely up to you.</p>
    <p class="muted small">Heads-up: Ontario's Consumer Protection Act bans unsolicited door-to-door selling of furnaces, air conditioners, water heaters, water treatment and duct cleaning, so HVAC contractors should stick to mail and social.</p>
  </section>`;
}

function SocialPricing() {
  const fee = money(PRICING.socialManagementCents);
  const exMail = 250 + 25 * 135; // permit home + 25 neighbours
  const exSub = exMail + PRICING.socialManagementCents;
  const exTax = Math.round(exSub * PRICING.hstRate);
  return html`<section class="card">
    <div class="panel-title"><h3>Done-for-you social campaigns: how it works</h3><span class="pill pill-slate">Optional add-on</span></div>
    <div class="social-how">
      <div><span class="step-dot">1</span><b>You request it</b><p class="muted small">In Launch Outreach, switch on the social campaign, pick your ad budget (from $50), length and platforms.</p></div>
      <div><span class="step-dot">2</span><b>We build it</b><p class="muted small">Our team creates the Facebook, Instagram and Nextdoor ads in your own ad accounts within 1 business day and sends you a preview.</p></div>
      <div><span class="step-dot">3</span><b>You approve, it runs</b><p class="muted small">Nothing goes live without your OK. You see the status on Sent Campaigns and get a results summary when it ends.</p></div>
    </div>
    <div class="table-wrap" style="margin-top:14px"><table class="table"><thead><tr><th>What you pay</th><th>Paid to</th><th class="r">Price</th></tr></thead><tbody>
      <tr><td><b>Setup fee</b><small>We plan, write and build the campaign, then report results</small></td><td>PermitPulse</td><td class="r"><b>${fee}</b> per campaign<small>Pro: 1 included every month</small></td></tr>
      <tr><td><b>Ad budget</b><small>The money that actually shows your ads. You choose it.</small></td><td>Meta / Nextdoor, from your own card</td><td class="r"><b>From $50</b><small>we never mark it up</small></td></tr>
    </tbody></table></div>
    <div class="social-example">
      <div><b>Suggested budgets</b><p class="muted small">Test: $150 over 14 days (about $11/day). Steady: $300–$500 per month. Busy season: scale up only after a test brings in quote requests.</p></div>
      <div><b>Example on Starter Scout</b><p class="muted small">Postcards to a permit home + 25 neighbours ${money(exMail)} + setup fee ${fee} = ${money(exSub)} + HST ${money(exTax)} = <b>${money(exSub + exTax)} charged by PermitPulse</b>. A $300 ad budget is billed separately by Meta and Nextdoor.</p></div>
    </div>
  </section>`;
}

function CityPlan() {
  const { meta, openAddon, switchCity } = useApp();
  const live = meta.cities.filter((c) => c.status === 'active');
  const addons = meta.cities.filter((c) => c.addon);
  const example = (n) => 149 * 100 + Math.max(0, n - PRICING.includedCities) * PRICING.extraCityCents;
  return html`<section class="card">
    <div class="panel-title"><h3>Cities on your plan</h3><span class="pill pill-slate">Demo billing</span></div>
    <p class="muted small">Every plan includes ${PRICING.includedCities} cities. Add more for <b>${money(PRICING.extraCityCents)}/month each</b>, or unlock every covered Ontario city for <b>${money(PRICING.unlimitedCitiesCents)}/month</b>.</p>
    <div class="city-plan">
      ${live.map((c) => html`<div class="city-plan-item included"><${Icon} name="check" size=${15} /><b>${c.name}</b>
        ${c.city_slug === meta.city.slug ? html`<small>Viewing</small>` : html`<button class="btn btn-ghost btn-sm" onClick=${() => switchCity(c.city_slug)}>View</button>`}</div>`)}
      ${addons.map((c) => html`<div class="city-plan-item"><${Icon} name="lock" size=${15} /><span>${c.name}</span>
        <button class="btn btn-ghost btn-sm" onClick=${() => openAddon(c)}>Add · ${money(PRICING.extraCityCents)}/mo</button></div>`)}
    </div>
    <div class="table-wrap" style="margin-top:14px"><table class="table"><thead><tr><th>Starter Scout with</th><th class="r">Monthly total (before HST)</th></tr></thead><tbody>
      ${[3, 4, 5].map((n) => html`<tr><td>${n} cities${n === PRICING.includedCities ? ' (included)' : ` (${n - PRICING.includedCities} add-on${n - PRICING.includedCities === 1 ? '' : 's'})`}</td><td class="r"><b>${money(example(n))}</b></td></tr>`)}
      <tr><td>Every covered Ontario city</td><td class="r"><b>${money(149 * 100 + PRICING.unlimitedCitiesCents)}</b></td></tr>
    </tbody></table></div>
  </section>`;
}

export function PlansView() {
  const { meta, reloadMeta } = useApp();
  const [interval, setInterval] = useState('month');
  const [slots, setSlots] = useState([]);
  const [plan, setPlan] = useState(null);
  const load = () => api.get('/api/territory').then((r) => setSlots(r.items)).catch(() => {});
  useEffect(() => { load(); }, []);
  return html`<div class="view">
    <div class="view-head"><div><h1>Plans & Cities</h1><p class="muted">Permits are public records, so anyone can look them up. Exclusive territories cap how many PermitPulse contractors per service get alerts and run mail in your neighbourhoods.</p></div></div>
    ${meta.contractor.plan_status === 'active' && html`<div class="plan-current"><${Icon} name="check" size=${16} /> You're on <b>${PRICING.plans[meta.contractor.plan]?.name || meta.contractor.plan}</b>${meta.socialIncludedRemaining ? ` · ${meta.socialIncludedRemaining} done-for-you social campaign included this month` : ''}${meta.billing.enabled ? '' : ' (demo)'}</div>`}
    <div class="billing-toggle">
      <div class="seg" role="tablist" aria-label="Billing period"><button class=${interval === 'month' ? 'on' : ''} onClick=${() => setInterval('month')}>Monthly</button><button class=${interval === 'year' ? 'on' : ''} onClick=${() => setInterval('year')}>Yearly <span class="save-chip">2 months free</span></button></div>
      <span class="muted small">Every plan starts with a ${PRICING.trialDays}-day free trial. Cancel anytime.</span>
    </div>
    <div class="plan-grid">
      ${PLANS.map((p) => html`<section class=${`plan ${p.featured ? 'featured' : ''}`}>
        ${p.featured && html`<span class="plan-flag">Most popular for closers</span>`}
        <small class="plan-tag">${p.tag}</small><h2>${p.name}</h2>
        <div class="plan-price">${interval === 'year' ? html`<b>${money(PRICING.plans[p.key].annualCents)}</b><span>/year CAD</span>` : html`<b>$${p.price}</b><span>/month CAD</span>`}</div>
        <div class="plan-alt">${interval === 'year'
          ? html`<span>Same as ${money(Math.round(PRICING.plans[p.key].annualCents / 12))}/month</span><span class="save-chip">Save ${money(PRICING.plans[p.key].monthlyCents * 12 - PRICING.plans[p.key].annualCents)}</span>`
          : html`<button class="link" onClick=${() => setInterval('year')}>or ${money(PRICING.plans[p.key].annualCents)}/year</button><span class="save-chip">Save ${money(PRICING.plans[p.key].monthlyCents * 12 - PRICING.plans[p.key].annualCents)}</span>`}</div><p class="muted">${p.blurb}</p>
        <ul class="ticks">${p.feats.map((f) => html`<li>${f}</li>`)}</ul>
        <button class=${`btn btn-block ${p.featured ? 'btn-amber' : 'btn-navy'}`} onClick=${() => setPlan(p)}>${p.featured ? 'Lock my territory' : 'Start Starter Scout'}${meta.billing.enabled ? ` · ${PRICING.trialDays} days free` : ''}</button>
      </section>`)}
    </div>
    <${TradesCard} key=${meta.tradeAccess.trades.join() + meta.tradeAccess.limit} />
    <${SocialPricing} />
    <${RouteSheetNote} />
    <${CityPlan} />
    <section class="card"><div class="panel-title"><h3>Live territory availability · ${meta.city.name}</h3><span class="pill pill-slate">Demo availability</span></div>
      <p class="muted small">Exclusive Neighborhood Pro is capped at 2 contractors per service in each city. Slots fill first-come, first-served.</p>
      <div class="slot-grid">${slots.map((s) => html`<div class=${`slot ${s.remaining === 0 ? 'full' : ''}`}><b>${s.label}</b>
        <div class="slot-dots">${Array.from({ length: s.total_slots }, (_, i) => html`<span class=${i < s.claimed ? 'taken' : 'open'}></span>`)}</div>
        <small>${s.remaining === 0 ? 'Full · waitlist only' : `${s.remaining} of ${s.total_slots} open`}</small></div>`)}</div>
    </section>
    ${plan && html`<${ReserveModal} plan=${plan} slots=${slots} interval=${interval} onClose=${() => setPlan(null)} onDone=${() => { load(); reloadMeta(); }} />`}
  </div>`;
}
