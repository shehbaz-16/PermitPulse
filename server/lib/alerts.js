import { tradeLabel, whyLead, TRADES } from './mapping.js';

export const fmtValue = (n) => {
  if (n == null) return 'Value n/a';
  if (n >= 1e6) return `$${Number((n / 1e6).toFixed(2))}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
};

const ago = (iso) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`;
};

/** Builds the exact SMS / WhatsApp / Email content a contractor would receive. Pure function. */
export function buildAlert({ permits, sub, contractor, cityName = 'Markham', license = 'City of Markham Open Data Licence v1.0' }) {
  const top = permits.slice(0, 4);
  const trades = sub.trades?.length ? sub.trades : contractor.trade ? [contractor.trade] : [];
  const tradePhrase = trades.length === 1 ? tradeLabel(trades[0]) : trades.length > 1 ? `${trades.length} services` : 'all services';
  const total = permits.reduce((s, p) => s + (p.est_value || 0), 0);
  const when = sub.frequency === 'instant' ? 'Just filed' : '7:00 AM brief';
  const head = `${top.length} new ${cityName} permit${top.length === 1 ? '' : 's'} for ${tradePhrase}`;

  const smsLines = [`PermitPulse Ontario · ${cityName}, ON`, head, ''];
  top.forEach((p, i) => {
    smsLines.push(`${i + 1}) ${p.address}${p.neighbourhood ? ` (${p.neighbourhood})` : ''} · ${fmtValue(p.est_value)}`);
    smsLines.push(`   ${p.permit_number} · ${p.scope.length > 58 ? p.scope.slice(0, 55) + '…' : p.scope}`);
  });
  smsLines.push('', `Est. project value ${fmtValue(total)}. Open PermitPulse to launch mail + social outreach.`, 'Reply STOP to unsubscribe.');

  const waLines = [`*PermitPulse Ontario* · ${cityName}`, `_${when}_`, '', `*${head}*`, ''];
  top.forEach((p, i) => {
    waLines.push(`📍 *${p.address}*${p.neighbourhood ? ` · ${p.neighbourhood}` : ''}`);
    waLines.push(`${p.permit_number} · ${fmtValue(p.est_value)} · filed ${ago(p.filed_at)}`);
    waLines.push(p.scope);
    if (i < top.length - 1) waLines.push('');
  });
  waLines.push('', `💰 Est. project value: *${fmtValue(total)}*`, 'Open PermitPulse to launch mail + social outreach.');

  const email = {
    subject: `${top.length} new ${cityName} permit leads for ${tradePhrase} · ${fmtValue(total)} in projects`,
    preheader: `${when}: ${top.map((p) => p.address).slice(0, 2).join(', ')} and more.`,
    intro: `Good morning${contractor.contact_name && contractor.contact_name !== 'Demo Contractor' ? ' ' + contractor.contact_name.split(' ')[0] : ''}, here are the freshest ${cityName} building permits matching ${tradePhrase}.`,
    items: top.map((p) => ({
      permit_number: p.permit_number,
      address: p.address,
      neighbourhood: p.neighbourhood,
      value: fmtValue(p.est_value),
      filed: ago(p.filed_at),
      scope: p.scope,
      why: whyLead(p.permit_code, trades.find((t) => (p.trades || []).includes(t))),
    })),
    total: fmtValue(total),
    footer: `You are receiving this because you subscribed to PermitPulse Ontario alerts for ${cityName}. Data source: ${license}.`,
  };

  return {
    count: top.length,
    sms: smsLines.join('\n'),
    whatsapp: waLines.join('\n'),
    email,
    tradeLabels: trades.map(tradeLabel),
    knownTrades: TRADES.length,
  };
}
