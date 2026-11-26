// Outgoing email through Resend (resend.com). Configure in .env:
//   RESEND_API_KEY=re_...            required to actually send
//   NOTIFY_EMAIL=you@example.com     where team notifications go (new sign-ups, social requests)
//   EMAIL_OVERRIDE_TO=you@example.com  optional test mode: EVERY email goes here instead, with the intended
//                                    recipient noted at the top. Leave empty in production.
//   NOTIFY_FROM="PermitPulse <alerts@yourdomain.ca>"  optional; defaults to Resend's shared test sender, which
//                                    can only deliver to the email address your Resend account was created with.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);

/** Sends one email. Returns 'emailed', 'not_configured' or 'failed_…'. Never throws. */
export async function sendEmail({ to, subject, text, html }) {
  const key = process.env.RESEND_API_KEY;
  const override = process.env.EMAIL_OVERRIDE_TO;
  const recipient = override || to;
  if (!key || !recipient) {
    console.log(`[email] ${subject} → ${to || '(no recipient)'} (email not configured)`);
    return 'not_configured';
  }
  const note = override && to && override.toLowerCase() !== String(to).toLowerCase() ? `Test mode: this email was meant for ${to}.` : null;
  const body = {
    from: process.env.NOTIFY_FROM || 'PermitPulse <onboarding@resend.dev>',
    to: [recipient],
    subject: note ? `[for ${to}] ${subject}` : subject,
    text: note ? `${note}\n\n${text}` : text,
  };
  if (html) body.html = note ? `<p style="background:#FDF5E8;padding:8px 12px;border-radius:6px;font:13px system-ui">${esc(note)}</p>${html}` : html;
  try {
    const res = await fetch(`${process.env.RESEND_BASE_URL || 'https://api.resend.com'}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) { console.error(`[email] Resend HTTP ${res.status}: ${await res.text().catch(() => '')}`); return `failed_${res.status}`; }
    return 'emailed';
  } catch (e) {
    console.error(`[email] ${e.message}`);
    return 'failed';
  }
}

/** Emails the PermitPulse team (NOTIFY_EMAIL) about new work or sign-ups. */
export async function notifyTeam({ subject, text }) {
  const to = process.env.NOTIFY_EMAIL;
  if (!to) { console.log(`[notify] ${subject} (NOTIFY_EMAIL not set)`); return 'not_configured'; }
  return sendEmail({ to, subject, text });
}

/** Simple, readable HTML version of a daily permit alert. */
export function alertEmailHtml({ intro, items, total, footer }) {
  const rows = items.map((i) => `<tr><td style="padding:12px 0;border-bottom:1px solid #eee">
    <div style="font-weight:700;font-size:15px">${esc(i.address)} <span style="color:#1F7A50">${esc(i.value)}</span></div>
    <div style="color:#6E6960;font-size:12px">${esc(i.permit_number)}${i.neighbourhood ? ` · ${esc(i.neighbourhood)}` : ''} · filed ${esc(i.filed)}</div>
    <div style="margin-top:4px">${esc(i.scope)}</div>
    <div style="margin-top:6px;background:#EAF6EF;border-left:3px solid #2FA36B;padding:6px 10px;font-size:13px">${esc(i.why)}</div></td></tr>`).join('');
  return `<div style="font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;color:#1E2A3A;max-width:600px">
    <div style="background:#1F3A5F;color:#fff;padding:14px 18px;border-radius:10px 10px 0 0;font-weight:700">PermitPulse <span style="color:#2FA36B">Ontario</span></div>
    <div style="border:1px solid #E5E1D8;border-top:0;padding:16px 18px;border-radius:0 0 10px 10px">
      <p>${esc(intro)}</p><table style="width:100%;border-collapse:collapse">${rows}</table>
      <p style="margin-top:14px"><b>Estimated project value: ${esc(total)}</b></p>
      <p style="color:#6E6960;font-size:12px">${esc(footer)}</p></div></div>`;
}
