import { html, useState, useEffect, useApp, api, Icon, fmtCents, fmtDateTime, tradeLabel } from '/lib.js';

const PAY = { paid: ['pill-green', 'Paid'], unpaid: ['pill-red', 'Awaiting payment'], demo: ['pill-slate', 'Demo · no charge'] };

export function CampaignsView() {
  const { tick, goto } = useApp();
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get('/api/campaigns').then((r) => setRows(r.items)).catch(() => setRows([])); }, [tick]);
  const total = (rows || []).reduce((s, r) => s + r.total_cents, 0);
  const pieces = (rows || []).reduce((s, r) => s + r.mail_pieces, 0);
  return html`<div class="view">
    <div class="view-head"><div><h1>Sent Campaigns</h1><p class="muted">Every mail campaign and social request you send is logged here with its current status.</p></div></div>
    ${rows === null ? html`<div class="empty"><div class="spinner"></div></div>`
      : !rows.length ? html`<div class="empty"><${Icon} name="send" size=${30} /><h3>No campaigns yet</h3><p class="muted">Pick a permit in the feed and hit Launch Outreach. It takes about 30 seconds.</p><button class="btn btn-amber" onClick=${() => goto('feed')}>Go to the permit feed</button></div>`
      : html`<div class="stat-row"><div class="stat"><b>${rows.length}</b><span>Campaigns</span></div><div class="stat"><b>${pieces}</b><span>Mail pieces queued</span></div><div class="stat"><b>${fmtCents(total)}</b><span>Charged by PermitPulse incl. HST</span></div></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Launched</th><th>Permit</th><th>Mail</th><th>Social</th><th>Status</th><th class="r">Total</th></tr></thead><tbody>
          ${rows.map((r) => html`<tr key=${r.id}><td><b>#${r.id}</b><small>${fmtDateTime(r.created_at)}</small></td>
            <td><b>${r.address}</b><small>${r.permit_number} · ${r.neighbourhood || ''}</small></td>
            <td>${r.format === 'postcard' ? '6″×9″ postcard' : 'Letter'}<small>${r.mail_pieces} piece${r.mail_pieces === 1 ? '' : 's'}${r.neighbour_homes ? ` (+${r.neighbour_homes} neighbours)` : ''}</small></td>
            <td>${r.social_enabled ? html`Done for you · ${fmtCents(r.social_budget_cents)} ad budget<small>${r.social_duration_days || 7} days · paid to Meta / Nextdoor from your ad account</small><small>${(r.social_platforms || []).map((k) => `${k[0].toUpperCase()}${k.slice(1)}`).join(', ')}</small>` : html`<span class="muted">Not requested</span>`}</td>
            <td><div class="badge-col"><span class="pill pill-amber">${r.mail_status}</span>${r.social_status ? html`<span class="pill pill-blue">${r.social_status}</span>` : null}<span class=${`pill ${PAY[r.payment_status]?.[0] || 'pill-slate'}`}>${PAY[r.payment_status]?.[1] || r.payment_status}</span></div></td>
            <td class="r"><b>${fmtCents(r.total_cents)}</b><small>${r.company_name}</small></td></tr>`)}
        </tbody></table></div>
        <p class="demo-note">Demo mode: printing is simulated. Social campaigns are built by hand by the PermitPulse team; their status updates here as they progress.</p>`}
  </div>`;
}
