// Minimal Stripe client (REST, no SDK). Billing is enabled only when STRIPE_SECRET_KEY is set.
//   STRIPE_SECRET_KEY=sk_test_...      required (use a test key until you are ready to take real money)
//   STRIPE_WEBHOOK_SECRET=whsec_...    optional, for POST /api/billing/webhook in production
//   APP_URL=https://yourdomain.ca      optional, base URL for Checkout success/cancel redirects
import crypto from 'node:crypto';

export const billingEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);
export const billingMode = () => (String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_') ? 'live' : 'test');

/** Stripe expects nested form encoding: line_items[0][price_data][currency]=cad */
function encode(value, prefix, out) {
  if (value === undefined || value === null) return out;
  if (Array.isArray(value)) value.forEach((v, i) => encode(v, `${prefix}[${i}]`, out));
  else if (typeof value === 'object') for (const [k, v] of Object.entries(value)) encode(v, prefix ? `${prefix}[${k}]` : k, out);
  else out.append(prefix, String(value));
  return out;
}

async function call(method, path, params) {
  const base = (process.env.STRIPE_BASE_URL || 'https://api.stripe.com').replace(/\/$/, '');
  const res = await fetch(`${base}/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params ? encode(params, '', new URLSearchParams()).toString() : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Stripe HTTP ${res.status}`);
  return data;
}

export const createCheckoutSession = (params) => call('POST', '/checkout/sessions', params);
export const getCheckoutSession = (id) => call('GET', `/checkout/sessions/${encodeURIComponent(id)}`);

/** Verifies a Stripe-Signature header (t=...,v1=...) against the raw request body. */
export function verifyWebhookSignature(rawBody, header, secret, toleranceSec = 300) {
  const parts = Object.fromEntries(String(header || '').split(',').map((p) => p.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const signatures = String(header || '').split(',').filter((p) => p.trim().startsWith('v1=')).map((p) => p.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return signatures.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}
