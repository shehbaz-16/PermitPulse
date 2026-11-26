import {
  html, useState, useMemo, useApp, api, Icon, Modal, Switch, Phone, QR, HouseArt, RadiusDiagram, initials, wait,
  TRADES, PRICING, priceCampaign, mailCopy, adHook, tradeLabel, fmtCents, fmtMoney, NEIGHBOURHOOD_FSA, socialTargeting, META_MIN_RADIUS_KM, SOCIAL_ACCOUNT_STATUSES,
} from '/lib.js';

const HOMES = [0, 10, 25, 50];
const APPROX_M = { 0: 0, 10: 80, 25: 130, 50: 190 };
const STAGES_MAIL = ['Validating addresses against Canada Post data', 'Generating print-ready proofs', 'Queueing mail for print & drop'];
const STAGES_SOCIAL = ['Sending your social campaign request to the PermitPulse team', 'Saving ad preview, budget and targeting notes'];

function Postcard({ permit, copy, company, tradeKey, coupon, flipped, onFlip, hood }) {
  const { meta } = useApp();
  const fsa = permit.postal_fsa || NEIGHBOURHOOD_FSA[permit.neighbourhood] || '';
  return html`<div class="pc-stage"><div class=${`pc ${flipped ? 'flipped' : ''}`} onClick=${onFlip} role="button" tabindex="0" aria-label="Flip postcard" onKeyDown=${(e) => (e.key === 'Enter' || e.key === ' ') && onFlip()}>
    <div class="pc-face pc-front">
      <div class="pc-art"><${HouseArt} /></div>
      <div class="pc-copy">
        <div class="pc-eyebrow">${hood} homeowners</div>
        <h3>${copy.headline}</h3>
        <p>${copy.sub}</p>
        <div class="pc-offer-ribbon"><b>15% OFF</b><span>your project · code ${coupon}</span></div>
      </div>
      <div class="pc-foot">${company} · Serving ${meta.city.name}</div>
    </div>
    <div class="pc-face pc-back">
      <div class="pc-back-left">
        <div class="pc-brand">${company}</div>
        <p>${copy.body}</p>
        <div class="pc-offer"><div><small>EXCLUSIVE OFFER</small><b>15% off + free on-site quote</b><span>Mention code <u>${coupon}</u></span></div><${QR} text=${`${location.origin}/offer/${coupon}`} size=${62} /></div>
        <small class="pc-scan">Scan to claim · Valid for 60 days</small>
      </div>
      <div class="pc-back-right">
        <div class="pc-indicia">POSTAGE PAID<br/>PORT PAYÉ<br/>CANADA</div>
        <div class="pc-address"><b>CURRENT RESIDENT</b><br/>${permit.address}<br/>${meta.city.name.toUpperCase()} ON ${fsa} ···<small>Postal code completed from Canada Post address data at print</small></div>
      </div>
    </div></div></div>`;
}

function Letter({ permit, copy, company, coupon, isProp }) {
  const { meta } = useApp();
  const fsa = permit.postal_fsa || NEIGHBOURHOOD_FSA[permit.neighbourhood] || '';
  return html`<div class="letter-stage">
    <div class="envelope"><div class="env-return">${company}<br/>${meta.city.name}, ON</div><div class="env-window"><b>CURRENT RESIDENT</b><br/>${permit.address}<br/>${meta.city.name.toUpperCase()} ON ${fsa} ···</div></div>
    <div class="paper">
      <div class="letterhead"><div class="lh-mark">${initials(company)}</div><div><b>${company}</b><span>Licensed · Insured · Serving ${meta.city.name} homeowners</span></div></div>
      <p class="lh-date">${new Date().toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Toronto' })}</p>
      <p><b>Dear Homeowner at ${permit.address},</b></p>
      ${copy.letter.map((t) => html`<p>${t}</p>`)}
      <p>Sincerely,<br/><b>The ${company} Team</b></p>
      <div class="voucher"><div class="cut"><${Icon} name="send" size=${13} /> tear here</div>
        <div class="voucher-body"><div><small>HOMEOWNER VOUCHER</small><b>15% OFF your project</b><span>Free on-site quote · Code <u>${coupon}</u></span></div><${QR} text=${`${location.origin}/offer/${coupon}`} size=${58} /></div></div>
    </div></div>`;
}

const PLATFORMS = [{ key: 'facebook', label: 'Facebook' }, { key: 'instagram', label: 'Instagram' }, { key: 'nextdoor', label: 'Nextdoor' }];

function AdPreview({ platform, company, hood, area, adjacent, hook, street, account }) {
  const { meta } = useApp();
  const tag = `Attention ${hood}${adjacent ? ` & ${adjacent}` : ''} Homeowners`;
  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const media = html`<div class="ad-media"><${HouseArt} /><div class="ad-overlay"><span class="ad-pin"><${Icon} name="pin" size=${12} /> ${socialTargeting(platform, area, meta.city.name).label}</span><b>${tag}</b></div></div>`;
  if (platform === 'nextdoor') {
    const name = account || company;
    return html`<${Phone}><div class="ad ad-nd">
      <div class="nd-bar"><b class="nd-word">nextdoor</b><span>${hood}</span></div>
      <div class="nd-card">
        <div class="ad-head"><div class="ad-avatar nd">${initials(name)}</div><div class="ad-who"><b>${name}</b><span>Sponsored · ${hood}, ON</span></div><span class="ad-dots">•••</span></div>
        <p class="nd-text">${hook}</p>
        ${media}
        <div class="nd-cta"><b>Free City of ${meta.city.name} compliant quote</b><button type="button">Learn more</button></div>
        <div class="nd-react">👍 Thank · 💬 Comment · ↪ Share</div>
      </div>
      <p class="nd-note">Neighbours in ${hood} see this as a sponsored local post.</p>
    </div><//>`;
  }
  const ig = platform === 'instagram';
  const igName = (account || slug.replace(/(.{1,30}).*/, '$1')).replace(/^@/, '');
  const fbName = company;
  return html`<${Phone}><div class=${`ad ${ig ? 'ad-ig' : 'ad-fb'}`}>
    <div class="ad-bar">${ig ? html`<b class="ig-word">Instagram</b>` : html`<b class="fb-word">facebook</b>`}<span><${Icon} name="heart" size=${16} /> <${Icon} name="comment" size=${16} /></span></div>
    <div class="ad-head"><div class="ad-avatar">${initials(ig ? igName : fbName)}</div><div class="ad-who"><b>${ig ? igName : fbName}</b><span>Sponsored · ${hood}, ON</span></div><span class="ad-dots">•••</span></div>
    ${!ig && html`<p class="ad-fb-text">${hook}</p>`}
    ${media}
    <div class="ad-cta"><span><small>${ig ? `${slug}.ca` : account ? account.replace(/^https?:\/\/(www\.)?/, '') : `${slug}.ca`}</small><b>Free City of ${meta.city.name} compliant quote</b></span><button type="button">Get Free Quote</button></div>
    ${ig ? html`<div class="ad-actions"><${Icon} name="heart" size=${20} /><${Icon} name="comment" size=${20} /><${Icon} name="send" size=${20} /></div>
      <p class="ad-cap"><b>${igName}</b> ${hook}</p>` : html`<div class="ad-fb-react">👍 Like · 💬 Comment · ↪ Share</div>`}
  </div><//>`;
}

export function Studio({ permit, onClose }) {
  const { contractor, toast, bump, goto, meta, openProfile } = useApp();
  const initialTrade = permit.trades.includes(contractor.trade) ? contractor.trade : permit.trades[0] || contractor.trade;
  const [step, setStep] = useState(1);
  const [format, setFormat] = useState('postcard');
  const [includeProperty, setIncludeProperty] = useState(true);
  const [homes, setHomes] = useState(25);
  const [audience, setAudience] = useState('property');
  const [flipped, setFlipped] = useState(false);
  const [trade, setTrade] = useState(initialTrade);
  const [company, setCompany] = useState(contractor.company_name);
  const [coupon, setCoupon] = useState(`${meta.city.name.toUpperCase().replace(/[^A-Z]/g, '')}15`);
  const [socialOn, setSocialOn] = useState(false);
  const [budget, setBudget] = useState(PRICING.socialBudgetsCents[1]);
  const [duration, setDuration] = useState(PRICING.socialDurations[0]);
  const [accountStatus, setAccountStatus] = useState('unsure');
  const [socialNotes, setSocialNotes] = useState('');
  const [platform, setPlatform] = useState('instagram');
  const [platforms, setPlatforms] = useState(['facebook', 'instagram', 'nextdoor']);
  const acct = {
    facebook: contractor.facebook_page ? contractor.facebook_page.replace(/^https?:\/\/(www\.)?/, '') : null,
    instagram: contractor.instagram_handle ? '@' + contractor.instagram_handle : null,
    nextdoor: contractor.nextdoor_name || null,
  };
  const togglePlatform = (k) => setPlatforms((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const [tip, setTip] = useState(false);
  const [launch, setLaunch] = useState(null); // {stage, labels}
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  const waived = socialOn && meta.socialIncludedRemaining > 0;
  const price = priceCampaign({ includeProperty, neighbourHomes: homes, socialEnabled: socialOn, socialBudgetCents: budget, managementWaived: waived });
  const co = company.trim() || contractor.company_name;
  const cpn = (coupon.trim() || 'SAVE15').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16) || 'SAVE15';
  const copy = useMemo(() => mailCopy(permit, trade, co, audience, meta.city.name), [permit, trade, co, audience, meta.city.name]);
  const area = permit.neighbourhood || meta.city.name; // targeting area: neighbourhood, or postal area (e.g. M4J) in Toronto
  const hood = /^[A-Z]\d[A-Z]$/.test(area) ? meta.city.name : area; // name used in ad and mail copy
  const adjacent = meta.neighbourhoods.find((n) => n.name === hood)?.adjacent?.[0];
  const hook = adHook(trade, permit.permit_code, meta.city.name);
  const budgetOk = Number.isInteger(budget) && budget >= PRICING.socialBudgetMinCents && budget <= PRICING.socialBudgetMaxCents;
  const canLaunch = price.pieces > 0 && !launch && !(socialOn && (platforms.length === 0 || !budgetOk));

  const doLaunch = async () => {
    setErr('');
    const labels = [...STAGES_MAIL, ...(socialOn ? STAGES_SOCIAL : [])];
    setLaunch({ stage: 0, labels });
    try {
      const post = api.post('/api/campaigns', {
        permitId: permit.id, trade, format, includeProperty, neighbourHomes: homes, companyName: co, couponCode: cpn,
        social: { enabled: socialOn, budgetCents: socialOn ? budget : 0, durationDays: duration, platforms, accountStatus, notes: socialNotes },      });
      for (let i = 0; i < labels.length; i++) { setLaunch({ stage: i, labels }); await wait(520); }
      const c = await post;
      if (c.checkout_url) { setLaunch({ stage: labels.length, labels: [...labels, 'Opening secure Stripe checkout'] }); window.location.href = c.checkout_url; return; }
      setLaunch({ stage: labels.length, labels });
      await wait(350);
      setResult(c); setLaunch(null); bump();
    } catch (e) { setLaunch(null); setErr(e.message); toast(e.message, 'err'); }
  };

  if (result) return html`<${Modal} title=${result.social_enabled ? 'Mail sent, social campaign requested' : 'Campaign launched'} onClose=${onClose}>
    <div class="center-stack">
      <div class="big-check"><${Icon} name="check" size=${32} /></div>
      <h3>${result.address}: campaign #${result.id}</h3>
      <div class="badge-row"><span class="pill pill-amber">${result.mail_status}</span>${result.social_status ? html`<span class="pill pill-blue">${result.social_status}</span>` : null}</div>
      <p class="muted">${result.mail_pieces} ${format === 'postcard' ? 'postcards' : 'letters'} queued · ${fmtCents(result.total_cents)} CAD incl. HST.</p>
      ${result.social_enabled && html`<p class="muted">Our team will set up your ${fmtCents(result.social_budget_cents).replace('.00', '')} social campaign within 1 business day and send you a preview to approve before anything goes live. Ad spend is billed by Meta and Nextdoor to your own ad account.</p>`}
      <p class="demo-note">Demo mode: nothing was printed or posted. The campaign is saved to your Sent Campaigns log.</p>
      <div class="row-gap"><button class="btn btn-navy" onClick=${() => { onClose(); goto('campaigns'); }}>View Sent Campaigns</button><button class="btn btn-ghost" onClick=${onClose}>Back to feed</button></div>
    </div><//>`;

  const tabs = [{ n: 1, t: 'Direct Mail', s: 'Street-level precision' }, { n: 2, t: 'Social Campaign', s: 'Done for you · optional' }];

  return html`<${Modal} title=${`Outreach Studio · ${permit.address}`} onClose=${onClose} wide flush>
    <div class="studio">
      <div class="studio-main">
        <div class="studio-top">
          <div class="stepper">${tabs.map((x) => html`<button class=${`step ${step === x.n ? 'on' : ''}`} onClick=${() => setStep(x.n)}><span>${x.n}</span><div><b>${x.t}</b><small>${x.s}</small></div></button>`)}</div>
          <div class="omni"><button class="omni-btn" onClick=${() => setTip(!tip)} aria-expanded=${tip}><${Icon} name="zap" size=${14} /> Why Mail + Social Together</button>
            ${tip && html`<div class="omni-tip">Homeowners see you in the mailbox <i>and</i> on their phone in the same week, so your name is familiar when they are ready to hire. The QR code and voucher code on every piece let you measure which campaigns produce enquiries.</div>`}</div>
        </div>
        <div class="permit-strip"><span class="permit-no">${permit.permit_number}</span><span>${permit.scope}</span></div>

        ${step === 1 && html`<div class="panel-grid">
          <section class="panel">
            <h4>Radius targeting</h4>
            <div class="toggle-row"><div><b>Target Permit Property</b><small>1 home · ${fmtCents(PRICING.propertyCents)} CAD</small></div><${Switch} checked=${includeProperty} onChange=${setIncludeProperty} label="Target permit property" /></div>
            <div class="pill-label">Nearest Neighbour Homes <small>${fmtCents(PRICING.neighbourCents)} CAD / mailer</small></div>
            <div class="pills">${HOMES.map((n) => html`<button class=${`pill-btn ${homes === n ? 'on' : ''}`} onClick=${() => setHomes(n)}>${n === 0 ? 'None' : `+${n} homes`}<small>${n === 0 ? '—' : fmtCents(n * PRICING.neighbourCents)}</small></button>`)}</div>
            <${RadiusDiagram} homes=${homes} street=${permit.street_name} includeProperty=${includeProperty} />
            <p class="muted small">${price.pieces ? `${price.pieces} piece${price.pieces === 1 ? '' : 's'} · ${homes ? `reaches about ${APPROX_M[homes]} m from the permit address along ${permit.street_name}` : 'permit property only'}.` : 'Select at least one home to mail.'}</p>
            <div class="note-ok"><${Icon} name="shield" size=${14} /> Addressed to “Current Resident”. No owner names are ever used or stored.</div>
            <p class="muted small">Want to visit in person too? Print a free door-knock sheet from the feed and drop by on your own schedule.</p>
          </section>
          <section class="panel">
            <div class="panel-title"><h4>Format & live preview</h4>
              <div class="seg seg-sm"><button class=${format === 'postcard' ? 'on' : ''} onClick=${() => setFormat('postcard')}>6″×9″ Glossy Postcard</button><button class=${format === 'letter' ? 'on' : ''} onClick=${() => setFormat('letter')}>Personalized Letter</button></div></div>
            ${format === 'postcard' ? html`<div class="flip-ctl"><button class=${`chip-btn ${!flipped ? 'on' : ''}`} onClick=${() => setFlipped(false)}>Front</button><button class=${`chip-btn ${flipped ? 'on' : ''}`} onClick=${() => setFlipped(true)}>Back</button><span class="muted small">Click the card to flip</span></div>
              <${Postcard} permit=${permit} copy=${copy} company=${co} tradeKey=${trade} coupon=${cpn} flipped=${flipped} onFlip=${() => setFlipped(!flipped)} hood=${hood} />`
              : html`<${Letter} permit=${permit} copy=${copy} company=${co} coupon=${cpn} isProp=${audience === 'property'} />`}
            <div class="aud"><span>Preview as</span><div class="seg seg-sm"><button class=${audience === 'property' ? 'on' : ''} onClick=${() => setAudience('property')}>Permit property</button><button class=${audience === 'neighbour' ? 'on' : ''} onClick=${() => setAudience('neighbour')}>Neighbour</button></div></div>
            <div class="custom-row">
              <label>Company name<input value=${company} onInput=${(e) => setCompany(e.target.value)} maxlength="80" /></label>
              <label>Your service<select value=${trade} onChange=${(e) => setTrade(e.target.value)}>${TRADES.map((t) => html`<option value=${t.key}>${t.label}</option>`)}</select></label>
              <label>Voucher code<input value=${coupon} onInput=${(e) => setCoupon(e.target.value)} maxlength="16" /></label>
            </div>
          </section>
        </div>`}

        ${step === 2 && html`<div class="panel-grid">
          <section class="panel">
            <div class="toggle-row big"><div><b>Request a done-for-you Facebook, Instagram & Nextdoor campaign</b>
              <small><span class="info-badge"><${Icon} name="info" size=${12} /> Our team builds the ads in your own ad accounts within 1 business day and sends you a preview to approve before anything goes live. Setup fee ${waived ? 'included in your Pro plan this month' : `${fmtCents(PRICING.socialManagementCents).replace('.00', '')} + HST`}. Your ad budget is billed by Meta and Nextdoor directly to your card.</span></small></div>
              <${Switch} checked=${socialOn} onChange=${setSocialOn} label="Request a social campaign" /></div>
            <div class=${socialOn ? '' : 'faded'}>
              <div class="pill-label">Your ad budget <small>paid to Meta / Nextdoor</small></div>
              <div class="pills">${PRICING.socialBudgetsCents.map((c) => html`<button class=${`pill-btn ${budget === c ? 'on' : ''}`} onClick=${() => setBudget(c)}>${fmtCents(c).replace('.00', '')}<small>total</small></button>`)}</div>
              <label class="budget-custom">Or enter an amount (CAD)
                <input type="number" min=${PRICING.socialBudgetMinCents / 100} max=${PRICING.socialBudgetMaxCents / 100} step="10" value=${budget / 100} onInput=${(e) => setBudget(Math.round(Number(e.target.value || 0) * 100))} /></label>
              ${socialOn && !budgetOk && html`<div class="form-error">Ad budget must be between ${fmtCents(PRICING.socialBudgetMinCents)} and ${fmtCents(PRICING.socialBudgetMaxCents)}.</div>`}
              <div class="pill-label">Campaign length</div>
              <div class="seg seg-sm">${PRICING.socialDurations.map((d) => html`<button class=${duration === d ? 'on' : ''} onClick=${() => setDuration(d)}>${d} days</button>`)}</div>
              <div class="reach"><div class="reach-big">~${Math.round((Math.max(budget, 0) / 100) * PRICING.impressionsPerDollar).toLocaleString('en-CA')}</div><div><b>estimated views</b><span class="muted small">About ${fmtCents(Math.round(budget / duration)).replace(/\.\d\d$/, '')}/day. Nextdoor: ${area} · Facebook & Instagram: ${meta.city.name} (${META_MIN_RADIUS_KM} km, Meta's minimum for home-repair ads in Canada). Estimate only.</span></div></div>
              <div class="pill-label">Where it runs <small>pick one or more</small></div>
              <div class="plat-list">${PLATFORMS.map((pl) => html`<label class=${`plat ${platforms.includes(pl.key) ? 'on' : ''}`}><input type="checkbox" checked=${platforms.includes(pl.key)} onChange=${() => togglePlatform(pl.key)} /><div><b>${pl.label}</b><small>${acct[pl.key] ? `Your page: ${acct[pl.key]}` : 'Page not added yet'}</small></div></label>`)}</div>
              ${socialOn && platforms.length === 0 && html`<div class="form-error">Pick at least one platform.</div>`}
              <label class="budget-custom">Your ad accounts
                <select value=${accountStatus} onChange=${(e) => setAccountStatus(e.target.value)}>${SOCIAL_ACCOUNT_STATUSES.map((s) => html`<option value=${s.key}>${s.label}</option>`)}</select></label>
              <label class="budget-custom">Anything we should know? <small>offer, photos to use, areas to avoid</small>
                <textarea rows="3" maxlength="1000" value=${socialNotes} onInput=${(e) => setSocialNotes(e.target.value)} placeholder="e.g. Use the backyard photos on our Instagram. Mention free design consult."></textarea></label>
              <button type="button" class="link" onClick=${openProfile}>Add your Facebook, Instagram and Nextdoor page names →</button>
            </div>
          </section>
          <section class="panel"><div class="panel-title"><h4>Live mobile ad preview</h4>
            <div class="seg seg-sm">${PLATFORMS.slice().reverse().map((pl) => html`<button class=${platform === pl.key ? 'on' : ''} onClick=${() => setPlatform(pl.key)}>${pl.label}</button>`)}</div></div>
            <div class=${`phone-wrap ${socialOn ? '' : 'faded'}`}><${AdPreview} platform=${platform} company=${co} hood=${hood} area=${area} adjacent=${adjacent} hook=${hook} street=${permit.street_name} account=${acct[platform]} /></div>
            ${!socialOn && html`<p class="muted small center">Sample of what our team would build for you. Switch the request on to include it.</p>`}
          </section>
        </div>`}

        <div class="studio-nav">${step === 2 ? html`<button class="btn btn-ghost" onClick=${() => setStep(1)}>← Back to Direct Mail</button>` : html`<span></span>`}
          ${step === 1 ? html`<button class="btn btn-navy" onClick=${() => setStep(2)}>Next: Social Campaign →</button>` : null}</div>
      </div>

      <aside class="studio-summary">
        <h4>Campaign summary</h4>
        <div class="sum-lines">
          ${includeProperty && html`<div><span>Permit property × 1</span><b>${fmtCents(PRICING.propertyCents)}</b></div>`}
          ${homes > 0 && html`<div><span>Neighbour homes × ${homes} @ ${fmtCents(PRICING.neighbourCents)}</span><b>${fmtCents(homes * PRICING.neighbourCents)}</b></div>`}
          <div class="sum-sub"><span>Direct mail · ${format === 'postcard' ? '6″×9″ postcard' : 'letter'} (${price.pieces})</span><b>${fmtCents(price.mail)}</b></div>          ${socialOn ? html`<div class="sum-sub"><span>Done-for-you social setup<small>${waived ? 'Included in your Pro plan this month' : platforms.map((k) => PLATFORMS.find((x) => x.key === k).label).join(', ') || 'No platform selected'}</small></span><b>${waived ? 'Included' : fmtCents(price.management)}</b></div>` : html`<div class="sum-off"><span>Social campaign not requested</span><button class="link" onClick=${() => setStep(2)}>Add</button></div>`}
          <div class="sum-rule"></div>
          <div><span>Subtotal</span><b>${fmtCents(price.subtotal)}</b></div>
          <div><span>HST (13%)</span><b>${fmtCents(price.tax)}</b></div>
          <div class="sum-total"><span>Charged by PermitPulse (CAD)</span><b>${fmtCents(price.total)}</b></div>
        </div>
        ${socialOn && html`<div class="ad-spend-box"><span>Ad budget · ${duration} days<small>Billed by Meta / Nextdoor to your card, not included above</small></span><b>${budgetOk ? fmtCents(budget) : '—'}</b></div>`}
        ${err && html`<div class="form-error">${err}</div>`}
        ${launch ? html`<div class="launching"><div class="spinner sm"></div><ul>${launch.labels.map((l, i) => html`<li class=${i < launch.stage ? 'done' : i === launch.stage ? 'now' : ''}><${Icon} name=${i < launch.stage ? 'check' : 'refresh'} size=${13} /> ${l}</li>`)}</ul></div>`
          : html`<button class="btn btn-amber btn-block btn-lg" disabled=${!canLaunch} onClick=${doLaunch}><${Icon} name="send" size=${17} /> ${meta.billing.enabled ? `Pay ${fmtCents(price.total)} & ` : ''}${socialOn ? (meta.billing.enabled ? 'send' : 'Send mail + request social') : (meta.billing.enabled ? 'send' : 'Launch mail campaign')}</button>`}
        <p class="demo-note">${meta.billing.enabled
          ? html`Secure payment by Stripe${meta.billing.mode === 'test' ? ' (test mode: use card 4242 4242 4242 4242, any future date and CVC)' : ''}. Your ad budget is not charged here.`
          : 'Demo mode: no card is charged and nothing is mailed. Social requests go to the PermitPulse team\u2019s queue.'}</p>
      </aside>
    </div><//>`;
}
