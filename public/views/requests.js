import { html, useState, useEffect, useApp, api, Icon, fmtCents, fmtDateTime, relTime, tradeLabel, SOCIAL_REQUEST_STATUSES, SOCIAL_ACCOUNT_STATUSES } from '/lib.js';

const STATUS_PILL = { new: 'pill-amber', in_progress: 'pill-blue', awaiting_approval: 'pill-blue', live: 'pill-green', done: 'pill-slate', cancelled: 'pill-slate' };
const label = (k) => SOCIAL_REQUEST_STATUSES.find((s) => s.key === k)?.label || k;
const PLATFORM_NAME = { facebook: 'Facebook', instagram: 'Instagram', nextdoor: 'Nextdoor' };
const PAY = { paid: ['pill-green', 'Paid'], unpaid: ['pill-red', 'Not paid yet'], demo: ['pill-slate', 'Demo · no billing'] };

function RequestCard({ r, onSaved }) {
  const { toast, bump } = useApp();
  const [status, setStatus] = useState(r.status);
  const [notes, setNotes] = useState(r.manager_notes || '');
  const [busy, setBusy] = useState(false);
  const dirty = status !== r.status || notes !== (r.manager_notes || '');
  const save = async () => {
    setBusy(true);
    try { onSaved(await api.put(`/api/social-requests/${r.id}`, { status, manager_notes: notes })); bump(); toast(`Request #${r.id} updated`); }
    catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy failed', 'err'); } };
  const pages = { facebook: r.facebook_page, instagram: r.instagram_handle && `@${r.instagram_handle}`, nextdoor: r.nextdoor_name };
  const meta = r.platforms.some((p) => p !== 'nextdoor');
  return html`<article class=${`req ${r.status === 'new' ? 'is-new' : ''}`}>
    <div>
      <h3><span>#${r.id} · ${r.company_name}</span><span class=${`pill ${STATUS_PILL[r.status]}`}>${label(r.status)}</span><span class=${`pill ${PAY[r.payment_status]?.[0] || 'pill-slate'}`}>${PAY[r.payment_status]?.[1] || r.payment_status}</span><small>${relTime(r.created_at)}</small></h3>
      <p class="muted small">${tradeLabel(r.trade)} · ${r.city_name} · campaign #${r.campaign_id} (${r.mail_pieces} ${r.format === 'postcard' ? 'postcards' : 'letters'})</p>
      <div class="req-facts">
        <div><span>Permit</span>${r.address}<small>${r.permit_number} · ${r.scope}</small></div>
        <div><span>Ad budget (contractor pays platforms)</span>${fmtCents(r.ad_budget_cents)} over ${r.duration_days} days<small>about ${fmtCents(Math.round(r.ad_budget_cents / r.duration_days))}/day · your fee ${r.management_cents ? fmtCents(r.management_cents) : 'included in Pro plan'}</small></div>
        <div><span>Targeting</span>${r.platforms.map((p) => html`<div>${PLATFORM_NAME[p]}: ${r.targeting[p]}</div>`)}</div>
        <div><span>Pages to post as</span>${r.platforms.map((p) => html`<div>${PLATFORM_NAME[p]}: ${pages[p] || html`<i class="muted">not given</i>`}</div>`)}</div>
        <div><span>Voucher code</span>${r.coupon_code}</div>
        <div><span>Ad accounts</span>${SOCIAL_ACCOUNT_STATUSES.find((s) => s.key === r.account_status)?.label}</div>
        ${r.contractor_email || r.contractor_phone ? html`<div><span>Contractor contact</span>${r.contractor_email || ''} ${r.contractor_phone || ''}</div>` : null}
      </div>
      <div class="req-copy"><span>${r.ad_copy}</span><button class="btn btn-ghost btn-sm" onClick=${() => copy(r.ad_copy)}>Copy ad text</button></div>
      ${r.notes ? html`<p class="small" style="margin-top:10px"><b>Contractor notes:</b> ${r.notes}</p>` : null}
    </div>
    <div class="req-side">
      <ol class="req-steps">
        ${r.payment_status === 'unpaid' && html`<li><b>Wait for payment</b>: the contractor has not finished Stripe checkout yet.</li>`}
        <li>Confirm you have partner access to their ad accounts${r.account_status !== 'ready' ? ' (they need help: start here)' : ''}.</li>
        ${meta && html`<li>Meta Ads Manager: Special ad category <b>Housing</b>, ${r.targeting.facebook || r.targeting.instagram}, ${r.duration_days}-day lifetime budget.</li>`}
        ${r.platforms.includes('nextdoor') && html`<li>Nextdoor Ads Manager: target ${r.target_area}.</li>`}
        <li>Send the contractor a preview; set status to Awaiting approval.</li>
        <li>Once approved, publish and set status to Live. Report results when Finished.</li>
      </ol>
      <label class="budget-custom">Status<select value=${status} onChange=${(e) => setStatus(e.target.value)}>${SOCIAL_REQUEST_STATUSES.map((s) => html`<option value=${s.key}>${s.label}</option>`)}</select></label>
      <label class="budget-custom">Team notes <small>private: ad IDs, approvals, results</small><textarea rows="4" maxlength="4000" value=${notes} onInput=${(e) => setNotes(e.target.value)}></textarea></label>
      <div class="row-gap"><button class="btn btn-navy btn-sm" disabled=${!dirty || busy} onClick=${save}>${busy ? 'Saving…' : 'Save'}</button>
        <small>${r.notified === 'emailed' ? 'You were emailed about this request' : 'Email alerts not configured'} · updated ${fmtDateTime(r.updated_at)}</small></div>
    </div>
  </article>`;
}

export function RequestsView() {
  const { tick } = useApp();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('open');
  const load = () => api.get('/api/social-requests').then(setData).catch(() => setData({ items: [], newCount: 0 }));
  useEffect(() => { load(); }, [tick]);
  const items = (data?.items || []).filter((r) => filter === 'all' || (filter === 'open' ? !['done', 'cancelled'].includes(r.status) : r.status === filter));
  const onSaved = (row) => setData((d) => ({ ...d, items: d.items.map((x) => (x.id === row.id ? { ...x, ...row } : x)), newCount: d.items.filter((x) => (x.id === row.id ? row.status : x.status) === 'new').length }));
  return html`<div class="view">
    <div class="view-head"><div><h1>Social Requests</h1><p class="muted">Done-for-you social campaigns requested by contractors, across every city. Build each one by hand in the contractor's own ad accounts, get their approval, then set it live.</p></div></div>
    <div class="seg" role="tablist">${[['open', 'Open'], ['new', 'New'], ['awaiting_approval', 'Awaiting approval'], ['live', 'Live'], ['all', 'All']].map(([k, l]) => html`<button class=${filter === k ? 'on' : ''} onClick=${() => setFilter(k)}>${l}${k === 'new' && data?.newCount ? ` (${data.newCount})` : ''}</button>`)}</div>
    ${data === null ? html`<div class="empty"><div class="spinner"></div></div>`
      : !items.length ? html`<div class="empty"><${Icon} name="send" size=${28} /><h3>No requests here</h3><p class="muted">When a contractor requests a social campaign in the outreach studio, it shows up here${data.items.length ? '' : ' and you get an email (once email is set up)'}.</p></div>`
      : html`<div class="req-list">${items.map((r) => html`<${RequestCard} key=${r.id + r.updated_at} r=${r} onSaved=${onSaved} />`)}</div>`}
    <p class="demo-note">Team-only page. This demo has no login, so in production it must sit behind a staff sign-in. Email alerts need RESEND_API_KEY and NOTIFY_EMAIL in .env.</p>
  </div>`;
}
