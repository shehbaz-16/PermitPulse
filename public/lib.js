import { html, render, useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } from '/vendor/preact.js';
import qrcode from '/vendor/qrcode.js';

export { html, render, useState, useEffect, useMemo, useRef, useCallback, createContext, useContext };
export * from '/shared/mapping.js';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

// ---------- API ---------------------------------------------------------------------------------------------
let currentCity = localStorage.getItem('pp.city') || 'markham';
export const getCity = () => currentCity;
export const setCity = (slug) => { currentCity = slug; localStorage.setItem('pp.city', slug); };
/** Scope an /api/ URL to the selected city unless it already names one. */
export const withCity = (url) => (url.startsWith('/api/') && !/[?&]city=/.test(url)
  ? `${url}${url.includes('?') ? '&' : '?'}city=${encodeURIComponent(currentCity)}` : url);

async function req(method, url, body) {
  const r = await fetch(withCity(url), {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(data.error || `Request failed (${r.status})`);
    e.errors = data.errors;
    e.status = r.status;
    throw e;
  }
  return data;
}
export const api = {
  get: (u) => req('GET', u),
  post: (u, b = {}) => req('POST', u, b),
  put: (u, b = {}) => req('PUT', u, b),
};
export const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '' && v !== 'all') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- formatting --------------------------------------------------------------------------------------
const TZ = 'America/Toronto';
export const fmtMoney = (n) => (n == null ? 'Not disclosed' : new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n));
/** Caption under a permit's value: where it came from, or why the city left it blank. */
export const valueCaption = (p) => {
  if (p.est_value != null) return p.details?.['Value source'] ? `From ${p.details['Value source'].replace(/^Related permit/, 'related permit')}` : 'Est. construction value';
  if (/mechanical|plumbing|drain|hvac/i.test(p.permit_type || '')) return 'City doesn\u2019t publish values for this permit type';
  return 'Applicant left the value blank';
};
export const fmtCents = (c) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(c / 100);
export const compactMoney = (n) => {
  if (n == null) return 'n/a';
  if (n >= 1e6) return `$${Number((n / 1e6).toFixed(2))}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
};
const dayKey = (d) => {
  const s = new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
  return Date.parse(`${s}T00:00:00Z`);
};
export const daysAgo = (iso) => Math.max(0, Math.round((dayKey(new Date()) - dayKey(iso)) / 86400000));
export const filedLabel = (iso) => {
  const d = daysAgo(iso);
  return d === 0 ? 'Filed today' : d === 1 ? 'Filed 1 day ago' : `Filed ${d} days ago`;
};
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ }) : '—');
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ }) : 'Never');
export const relTime = (iso) => {
  if (!iso) return 'Never';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return fmtDateTime(iso);
};
export const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function useLocalState(key, initial) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s == null ? initial : JSON.parse(s); } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } }, [key, v]);
  return [v, setV];
}

export async function updateLead(permitId, patch) {
  return api.put(`/api/leads/${permitId}`, patch);
}

// ---------- icons -------------------------------------------------------------------------------------------
const ICONS = {
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  feed: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  dollar: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  flip: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21v-4h6v4M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  comment: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
};
export function Icon({ name, size = 18, class: cls = '', stroke = 2 }) {
  return html`<svg class=${`icon ${cls}`} width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=${stroke}
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: ICONS[name] || '' }}></svg>`;
}

// ---------- shared UI ---------------------------------------------------------------------------------------
export function Modal({ title, onClose, children, wide, flush }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, []);
  return html`<div class="overlay" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
    <div class=${`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label=${title}>
      <div class="modal-head"><h2>${title}</h2><button class="icon-btn" onClick=${onClose} aria-label="Close"><${Icon} name="x" /></button></div>
      <div class=${flush ? '' : 'modal-body'}>${children}</div>
    </div>
  </div>`;
}

export function Switch({ checked, onChange, label, id }) {
  return html`<button type="button" role="switch" aria-checked=${checked} aria-label=${label} id=${id}
    class=${`switch ${checked ? 'on' : ''}`} onClick=${() => onChange(!checked)}><span></span></button>`;
}

export function Phone({ children, tone = 'light' }) {
  return html`<div class=${`phone phone-${tone}`}><div class="phone-notch"></div><div class="phone-screen">${children}</div></div>`;
}

export function QR({ text, size = 72 }) {
  const svg = useMemo(() => {
    try {
      const q = qrcode(0, 'M');
      q.addData(text);
      q.make();
      return q.createSvgTag({ scalable: true, margin: 0 });
    } catch { return ''; }
  }, [text]);
  return html`<div class="qr" style=${{ width: size + 'px', height: size + 'px' }} dangerouslySetInnerHTML=${{ __html: svg }}></div>`;
}

export function HouseArt({ accent = '#F59E0B' }) {
  return html`<svg viewBox="0 0 240 150" class="house-art" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="240" height="150" fill="url(#sky)" />
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1E3A5F"/><stop offset="1" stop-color="#0F172A"/></linearGradient></defs>
    <circle cx="200" cy="30" r="14" fill=${accent} opacity=".9" />
    <rect x="0" y="112" width="240" height="38" fill="#14532D" opacity=".85" />
    <path d="M70 112V70l50-34 50 34v42z" fill="#E2E8F0" />
    <path d="M62 72 120 30l58 42" fill="none" stroke="#94A3B8" stroke-width="6" stroke-linejoin="round" />
    <rect x="108" y="86" width="24" height="26" fill="#475569" />
    <rect x="82" y="82" width="16" height="16" fill="#7DD3FC" /><rect x="142" y="82" width="16" height="16" fill="#7DD3FC" />
    <g fill="#F8FAFC" stroke="#CBD5E1"><rect x="8" y="100" width="6" height="30"/><rect x="26" y="100" width="6" height="30"/><rect x="44" y="100" width="6" height="30"/><rect x="190" y="100" width="6" height="30"/><rect x="208" y="100" width="6" height="30"/><rect x="226" y="100" width="6" height="30"/>
    <rect x="4" y="108" width="50" height="5"/><rect x="4" y="120" width="50" height="5"/><rect x="186" y="108" width="52" height="5"/><rect x="186" y="120" width="52" height="5"/></g>
  </svg>`;
}

export function ValueInfo() {
  return html`<details class="info-pop"><summary aria-label="What is estimated construction value?" title="What is this?"><${Icon} name="info" size=${14} /></summary>
    <div class="info-pop-body"><b>About “estimated construction value”</b>
      <p>This is typically the project cost the applicant declared on the building-permit application, as published by the municipality (here via BuildData). Cities use it to calculate permit fees.</p>
      <p>It is <b>not</b> an appraisal, a contractor quote or the final price. It often leaves out land, HST and fixtures, can be rounded or revised later, and is blank on many permits because not every record publishes it.</p>
      <p>Use it to prioritise leads, not to price a job. Demo records show fictional values.</p></div></details>`;
}

export function StatusPill({ status }) {
  const k = status === 'Issued' ? 'green' : status === 'Under Review' ? 'blue' : 'slate';
  return html`<span class=${`pill pill-${k}`}>${status}</span>`;
}

// Concentric "nearest neighbour" radius diagram: centre = permit property, dots = surrounding homes.
export function RadiusDiagram({ homes, street, includeProperty = true }) {
  const W = 360, H = 250, cx = W / 2, cy = H / 2, k = 13.4;
  const dots = [];
  for (let i = 1; i <= 50; i++) {
    const r = k * Math.sqrt(i) + 9;
    const a = i * 2.39996;
    dots.push({ i, x: cx + r * Math.cos(a) * 1.35, y: cy + r * Math.sin(a) * 0.88 });
  }
  const ringR = homes ? k * Math.sqrt(homes) + 22 : 0;
  return html`<svg viewBox=${`0 0 ${W} ${H}`} class="radius-svg" role="img" aria-label=${`Mailing radius around ${street}: ${includeProperty ? 1 : 0} permit home plus ${homes} neighbours`}>
    <rect width=${W} height=${H} rx="12" fill="#F8FAFC" />
    <g stroke="#E2E8F0" stroke-width="10" stroke-linecap="round"><path d=${`M0 ${cy} H${W}`}/><path d=${`M${cx} 0 V${H}`}/><path d=${`M0 ${cy - 78} H${W}`} stroke-width="6"/><path d=${`M0 ${cy + 78} H${W}`} stroke-width="6"/></g>
    ${homes ? html`<ellipse cx=${cx} cy=${cy} rx=${ringR * 1.35} ry=${ringR * 0.88} fill="#F59E0B" fill-opacity=".10" stroke="#F59E0B" stroke-width="1.5" stroke-dasharray="5 4" />` : null}
    ${dots.map((d) => html`<rect key=${d.i} x=${d.x - 4} y=${d.y - 4} width="8" height="8" rx="2" fill=${d.i <= homes ? '#F59E0B' : '#CBD5E1'} opacity=${d.i <= homes ? 1 : 0.55} />`)}
    <g transform=${`translate(${cx} ${cy})`}>
      <circle r="13" fill=${includeProperty ? '#10B981' : '#94A3B8'} opacity=".25" />
      <rect x="-8" y="-8" width="16" height="16" rx="3" fill=${includeProperty ? '#10B981' : '#94A3B8'} stroke="#fff" stroke-width="2" />
    </g>
    <text x=${cx} y=${cy - 20} text-anchor="middle" font-size="10" font-weight="700" fill="#0F172A">Permit property</text>
    <text x=${W - 10} y=${cy - 84} text-anchor="end" font-size="9" fill="#64748B">${street}</text>
  </svg>`;
}
