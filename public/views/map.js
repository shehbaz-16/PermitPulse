import { html, useEffect, useRef, useState, useApp, fmtMoney, LEAD_STATUSES, ValueInfo } from '/lib.js';

const COLORS = { new: '#10B981', contacted: '#2563EB', quoted: '#F59E0B', won_archived: '#64748B' };
const CITY_CENTERS = { markham: [43.8561, -79.337], toronto: [43.6532, -79.3832], vaughan: [43.8361, -79.4983] };
const VALUE_GREEN = '#10B981', NO_VALUE = '#94A3B8';
const MAIL_RING_M = 190; // approximate street reach of the property + 50 nearest neighbours (matches the studio)
const sizeFor = (v) => (v >= 1e6 ? 13 : v >= 250000 ? 11 : v >= 50000 ? 9 : 7); // bigger dot = higher construction value

function tip(p) {
  const d = node('div', 'map-tip-in');
  d.append(node('b', p.est_value == null ? 'map-tip-none' : 'map-tip-val', p.est_value == null ? 'Value not published' : fmtMoney(p.est_value)));
  d.append(node('span', null, p.address));
  return d;
}

function node(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text; // textContent only: record text comes from an external API
  return n;
}

function popup(p, { openStudio, openDetails }) {
  const d = node('div', 'map-pop');
  d.append(node('div', 'map-pop-no', p.permit_number));
  d.append(node('b', 'map-pop-addr', p.address));
  d.append(node('div', 'map-pop-meta', `${p.neighbourhood || p.postal_fsa || 'Permit'} · ${p.status}`));
  d.append(node('div', 'map-pop-value', p.est_value == null ? 'Value not published' : `${fmtMoney(p.est_value)} est. construction value`));
  d.append(node('p', 'map-pop-scope', p.scope));
  const row = node('div', 'map-pop-actions');
  const a = node('button', 'btn btn-amber btn-sm', 'Launch Outreach');
  a.addEventListener('click', () => openStudio(p));
  const b = node('button', 'btn btn-ghost btn-sm', 'Details');
  b.addEventListener('click', () => openDetails(p));
  row.append(a, b);
  d.append(row);
  d.append(node('div', 'map-pop-note', `${p.is_demo ? 'Demo record · approximate location · ' : ''}Dashed ring ≈ reach of a 50-home neighbour mailing`));
  return d;
}

export function MapView({ items }) {
  const app = useApp();
  const el = useRef();
  const st = useRef({});
  const [tilesFailed, setTilesFailed] = useState(false);
  const [mode, setMode] = useState('value'); // 'value' = green dots for permits that publish a construction value; 'status' = lead pipeline colours
  const mapped = items.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const hasLeaflet = typeof window !== 'undefined' && window.L;

  useEffect(() => {
    const L = window.L;
    if (!L || !el.current) return;
    const map = L.map(el.current, { scrollWheelZoom: true }).setView(CITY_CENTERS[app.meta.city.slug] || CITY_CENTERS.markham, 12);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
    let errors = 0;
    tiles.on('tileerror', () => { if (++errors === 4) setTilesFailed(true); });
    tiles.on('tileload', () => { if (errors) { errors = 0; setTilesFailed(false); } });
    st.current = { map, layer: L.layerGroup().addTo(map), ring: null, sig: '' };
    return () => { map.remove(); st.current = {}; };
  }, []);

  useEffect(() => {
    const { map, layer } = st.current;
    const L = window.L;
    if (!map || !L) return;
    layer.clearLayers();
    const bounds = [];
    for (const p of mapped) {
      const has = p.est_value != null;
      const byValue = mode === 'value';
      const m = L.circleMarker([p.lat, p.lng], {
        radius: byValue ? sizeFor(p.est_value || 0) + (p.bookmarked ? 2 : 0) : p.bookmarked ? 11 : 9,
        fillColor: byValue ? (has ? VALUE_GREEN : NO_VALUE) : COLORS[p.lead_status] || COLORS.new,
        fillOpacity: byValue && !has ? 0.7 : 0.95,
        color: p.bookmarked ? '#0F172A' : '#fff', weight: p.bookmarked ? 3 : 2,
      });
      m.bindTooltip(tip(p), { direction: 'top', offset: [0, -6], className: 'map-tip' });
      m.bindPopup(popup(p, app), { minWidth: 250, maxWidth: 300 });
      m.on('popupopen', () => { st.current.ring?.remove(); st.current.ring = L.circle([p.lat, p.lng], { radius: MAIL_RING_M, color: '#F59E0B', weight: 1.5, dashArray: '5 4', fillOpacity: 0.08 }).addTo(map); });
      m.on('popupclose', () => { st.current.ring?.remove(); st.current.ring = null; });
      m.addTo(layer);
      bounds.push([p.lat, p.lng]);
    }
    const sig = mapped.map((p) => p.id).join(',');
    if (bounds.length && sig !== st.current.sig) { // re-fit only when the set of leads changes, not on every status edit
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      st.current.sig = sig;
    }
  }, [items, mode]);

  const missing = items.length - mapped.length;
  return html`<div class="map-wrap">
    <div class="map-bar">
      <span><b>${mapped.length}</b> of ${items.length} leads on the map</span>
      <span class="legend">
        <span class="seg seg-sm" role="group" aria-label="Colour pins by"><button class=${mode === 'value' ? 'on' : ''} onClick=${() => setMode('value')}>By construction value</button><button class=${mode === 'status' ? 'on' : ''} onClick=${() => setMode('status')}>By lead status</button></span>
        ${mode === 'value'
          ? html`<span><i style=${{ background: VALUE_GREEN }}></i>Value published (bigger = higher) <${ValueInfo} /></span><span><i style=${{ background: NO_VALUE }}></i>No value published</span>`
          : LEAD_STATUSES.map((s) => html`<span><i style=${{ background: COLORS[s.key] }}></i>${s.label}</span>`)}
        <span><i class="ring"></i>Saved</span></span>
    </div>
    ${hasLeaflet ? html`<div class="map" ref=${el}></div>` : html`<div class="map map-missing">The map library did not load. Restart the app and refresh.</div>`}
    ${tilesFailed && html`<div class="map-note">Map background could not load (offline?). Pins are still placed correctly. Tiles need an internet connection.</div>`}
    ${missing > 0 && html`<div class="map-note subtle">${missing} lead${missing === 1 ? ' has' : 's have'} no coordinates and ${missing === 1 ? 'is' : 'are'} only visible in the list view.</div>`}
  </div>`;
}
