import { html, useState, useEffect, useApp, api, Icon, Modal, Switch, Phone, TRADES, tradeLabel, relTime, wait } from '/lib.js';

const fmtInput = (v) => {
  const d = String(v || '').replace(/\D/g, '').replace(/^1(?=\d)/, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};
const stripPlus = (v) => String(v || '').replace(/^\+1\s*/, '');

function Channel({ icon, title, sub, on, setOn, children, badge }) {
  return html`<div class=${`channel ${on ? 'on' : ''}`}>
    <div class="channel-head"><span class=${`channel-icon ${badge || ''}`}>${icon}</span><div><b>${title}</b><small>${sub}</small></div><${Switch} checked=${on} onChange=${setOn} label=${title} /></div>
    ${on && html`<div class="channel-body">${children}</div>`}
  </div>`;
}

function SampleModal({ data, onClose }) {
  const { meta } = useApp();
  const [tab, setTab] = useState('whatsapp');
  const lines = (t) => t.split('\n');
  return html`<${Modal} title="Sample alert preview" onClose=${onClose} wide>
    <div class="sample-grid">
      <div class="sample-phone">
        <div class="seg seg-sm center-seg"><button class=${tab === 'sms' ? 'on' : ''} onClick=${() => setTab('sms')}>SMS</button><button class=${tab === 'whatsapp' ? 'on' : ''} onClick=${() => setTab('whatsapp')}>WhatsApp</button></div>
        <${Phone} tone=${tab === 'whatsapp' ? 'wa' : 'sms'}>
          ${tab === 'whatsapp' ? html`<div class="wa-head"><span class="wa-avatar"><${Icon} name="pulse" size=${16} /></span><div><b>PermitPulse Ontario</b><small>Business account</small></div></div>
            <div class="wa-body"><div class="wa-bubble"><div class="wa-text">${lines(data.whatsapp).map((l) => html`<div>${l || ' '}</div>`)}</div><span class="wa-time">7:00 AM ✓✓</span></div></div>`
            : html`<div class="sms-head"><b>PermitPulse</b><small>Text Message · Today 7:00 AM</small></div>
            <div class="sms-body"><div class="sms-bubble">${lines(data.sms).map((l) => html`<div>${l || ' '}</div>`)}</div></div>`}
        <//>
      </div>
      <div class="sample-email">
        <div class="email">
          <div class="email-meta"><small>From</small> PermitPulse Ontario (demo sender)<br/><small>Subject</small> <b>${data.email.subject}</b></div>
          <div class="email-body">
            <p class="email-pre">${data.email.preheader}</p>
            <h3>${data.email.items.length} new permits · ${data.email.total} in projects</h3>
            <p>${data.email.intro}</p>
            ${data.email.items.map((i) => html`<div class="email-item"><div class="email-item-h"><b>${i.address}</b><span>${i.value}</span></div><small>${i.permit_number} · ${i.neighbourhood || meta.city.name} · filed ${i.filed}</small><p>${i.scope}</p><p class="email-why">${i.why}</p></div>`)}
            <div class="email-cta">Launch Outreach (Mail + Social)</div>
            <small class="email-foot">${data.email.footer}</small>
          </div>
        </div>
      </div>
    </div>
    <p class="demo-note">${data.emailStatus === 'emailed' ? `Email sent to ${data.recipients.email}. ` : data.emailStatus && data.emailStatus !== 'not_configured' ? 'The email could not be sent; check the server log. ' : ''}${data.simulatedChannels.filter((c) => c !== 'email' || data.emailStatus !== 'emailed').length ? `Simulated delivery logged for: ${data.simulatedChannels.filter((c) => c !== 'email' || data.emailStatus !== 'emailed').join(', ')}. ` : ''}${data.simulatedChannels.length ? '' : 'Preview only. Turn on a channel and save to send. '}SMS and WhatsApp are still simulated.</p>
  <//>`;
}

export function AlertsView() {
  const { meta, toast, contractor } = useApp();
  const [s, setS] = useState({ email_enabled: true, email: '', sms_enabled: true, sms_phone: '', wa_enabled: false, wa_phone: '', trades: [contractor.trade], neighbourhoods: [], frequency: 'daily_7am' });
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState('');
  const [sample, setSample] = useState(null);
  const [log, setLog] = useState([]);
  const set = (p) => { setS((x) => ({ ...x, ...p })); setSaved(false); };

  const loadLog = () => api.get('/api/alerts/log').then((r) => setLog(r.items)).catch(() => {});
  useEffect(() => {
    api.get('/api/alerts/subscription').then((r) => {
      if (r) { setS({ ...r, sms_phone: stripPlus(r.sms_phone), wa_phone: stripPlus(r.wa_phone), email: r.email || '' }); setSaved(true); }
    }).catch(() => {});
    loadLog();
  }, []);

  const toggle = (key, v) => set({ [key]: s[key].includes(v) ? s[key].filter((x) => x !== v) : [...s[key], v] });
  const payload = () => ({ ...s, sms_phone: s.sms_phone, wa_phone: s.wa_phone });
  const save = async () => {
    setBusy('save'); setErrors({});
    try { const r = await api.put('/api/alerts/subscription', payload()); setSaved(true); toast('Alert preferences saved'); return r; }
    catch (e) { setErrors(e.errors || {}); toast(e.message, 'err'); return null; }
    finally { setBusy(''); }
  };
  const preview = async () => {
    setBusy('preview'); setErrors({});
    let ok = true;
    if (!saved) ok = Boolean(await save());
    if (!ok) { setBusy(''); return; }
    setBusy('preview');
    try { const [d] = await Promise.all([api.post('/api/alerts/preview', {}), wait(1100)]); setSample(d); loadLog(); }
    catch (e) { toast(e.message, 'err'); }
    setBusy('');
  };

  const anyChannel = s.email_enabled || s.sms_enabled || s.wa_enabled;
  return html`<div class="view">
    <div class="view-head"><div><h1>Daily Lead Alerts</h1><p class="muted">Get fresh ${meta.city.name} permits for your services delivered to your phone every morning.</p></div></div>
    <div class="alerts-grid">
      <div class="card-stack">
        <section class="card"><h3>1. Choose your channels</h3>
          <${Channel} icon=${html`<${Icon} name="mail" size=${18} />`} title="Email Digest" sub="A tidy morning brief with scope, value and why it's a lead" on=${s.email_enabled} setOn=${(v) => set({ email_enabled: v })}>
            <label class=${errors.email ? 'err' : ''}>Email address<input type="email" placeholder="you@yourcompany.ca" value=${s.email} onInput=${(e) => set({ email: e.target.value })} />${errors.email && html`<em>${errors.email}</em>`}</label><//>
          <${Channel} icon=${html`<${Icon} name="comment" size=${18} />`} title="SMS Text Message" sub="Short, scannable, works on any phone" on=${s.sms_enabled} setOn=${(v) => set({ sms_enabled: v })}>
            <label class=${errors.sms_phone ? 'err' : ''}>Canadian mobile number<div class="phone-input"><span>+1</span><input inputmode="tel" placeholder="(905) 555-0142" value=${s.sms_phone} onInput=${(e) => set({ sms_phone: fmtInput(e.target.value) })} /></div>${errors.sms_phone && html`<em>${errors.sms_phone}</em>`}</label><//>
          <${Channel} badge="wa" icon=${html`<span class="wa-glyph">W</span>`} title="WhatsApp Instant Alert" sub="Rich formatting, read receipts, tap to act" on=${s.wa_enabled} setOn=${(v) => set({ wa_enabled: v })}>
            <label class=${errors.wa_phone ? 'err' : ''}>WhatsApp number<div class="phone-input"><span>+1</span><input inputmode="tel" placeholder="(416) 555-0177" value=${s.wa_phone} onInput=${(e) => set({ wa_phone: fmtInput(e.target.value) })} /></div>${errors.wa_phone && html`<em>${errors.wa_phone}</em>`}</label><//>
        </section>
        <section class="card"><h3>2. Services & territory</h3>
          <div class="check-grid">${TRADES.map((t) => html`<label class=${`check-item ${s.trades.includes(t.key) ? 'on' : ''}`}><input type="checkbox" checked=${s.trades.includes(t.key)} onChange=${() => toggle('trades', t.key)} />${t.label}</label>`)}</div>
          <div class="sub-h">${meta.city.name} neighbourhoods <small>${s.neighbourhoods.length ? `${s.neighbourhoods.length} selected` : 'None selected = all neighbourhoods'}</small></div>
          <div class="check-grid">${meta.neighbourhoods.map((n) => html`<label class=${`check-item ${s.neighbourhoods.includes(n.name) ? 'on' : ''}`}><input type="checkbox" checked=${s.neighbourhoods.includes(n.name)} onChange=${() => toggle('neighbourhoods', n.name)} />${n.name}</label>`)}</div>
        </section>
        <section class="card"><h3>3. Delivery timing</h3>
          <div class="radio-cards">
            <label class=${s.frequency === 'daily_7am' ? 'on' : ''}><input type="radio" name="freq" checked=${s.frequency === 'daily_7am'} onChange=${() => set({ frequency: 'daily_7am' })} /><b>Daily at 7:00 AM ET</b><small>One consolidated brief every morning</small></label>
            <label class=${s.frequency === 'instant' ? 'on' : ''}><input type="radio" name="freq" checked=${s.frequency === 'instant'} onChange=${() => set({ frequency: 'instant' })} /><b>Instant as filed</b><small>Alert the moment a matching permit appears</small></label>
          </div>
          <div class="row-gap end">
            <button class="btn btn-navy" disabled=${busy === 'save' || !anyChannel} onClick=${save}>${busy === 'save' ? 'Saving…' : saved ? 'Saved ✓' : 'Save alert preferences'}</button>
            <button class="btn btn-amber" disabled=${!!busy || !anyChannel} onClick=${preview}><${Icon} name="send" size=${16} /> ${busy === 'preview' ? 'Preparing preview…' : 'Send Me a Sample Alert Preview'}</button>
          </div>
          ${!anyChannel && html`<p class="muted small">Turn on at least one channel to continue.</p>`}
        </section>
      </div>
      <aside class="card-stack">
        <section class="card tip-card"><h3>What you will get</h3><ul class="ticks"><li>New permits matched to your services, not noise</li><li>Value, scope and a plain-English reason it is a lead</li><li>One tap from alert to a mail + social campaign</li></ul></section>
        <section class="card"><h3>Recent deliveries</h3>
          ${log.length ? html`<ul class="log">${log.map((l) => html`<li><span class=${`pill pill-${l.channel === 'whatsapp' ? 'green' : l.channel === 'sms' ? 'blue' : 'slate'}`}>${l.channel}</span><span class="log-to">${l.recipient}</span><small>${relTime(l.created_at)}</small></li>`)}</ul>` : html`<p class="muted small">Nothing yet. Save your preferences and send a sample.</p>`}</section>
      </aside>
    </div>
    ${sample && html`<${SampleModal} data=${sample} onClose=${() => setSample(null)} />`}
  </div>`;
}
