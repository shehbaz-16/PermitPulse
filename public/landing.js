import { TRADES } from '/shared/mapping.js';

const form = document.getElementById('early-form');
const msg = form.querySelector('.form-msg');
const tradeSelect = form.elements.trade;

tradeSelect.innerHTML = TRADES.map((t) => `<option value="${t.key}">${t.label}</option>`).join('');

const show = (text, kind) => { msg.textContent = text; msg.className = `form-msg ${kind}`; };

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = form.elements;
  const company = f.company.value.trim();
  const email = f.email.value.trim();
  if (!company) return show('Enter your company name.', 'err');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return show('Enter a valid work email.', 'err');

  const select = f.city;
  const city = select.value;
  const cityName = select.options[select.selectedIndex].text.replace(/\s*\(.*\)$/, '');
  const kind = /\(live\)/.test(select.options[select.selectedIndex].text) ? 'live'
    : /\(add-on\)/.test(select.options[select.selectedIndex].text) ? 'addon' : 'waitlist';
  const url = { live: `/api/territory/reserve?city=${city}`, addon: '/api/cities/addon', waitlist: '/api/waitlist' }[kind];
  const body = kind === 'live'
    ? { plan: 'starter', trade: f.trade.value, company, email }
    : { city_slug: city, trade: f.trade.value, company, email };

  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    form.reset();
    show({
      live: `Thanks! We'll set up your ${cityName} demo feed and email you to book a walkthrough.`,
      addon: `Thanks! ${cityName} is a $49/month add-on on top of the 3 included cities. We'll be in touch to set it up.`,
      waitlist: `Thanks! You're #${data.position} on the ${data.city} early-access list for your service.`,
    }[kind], 'ok');
  } catch (err) {
    show(err.message, 'err');
  } finally {
    button.disabled = false;
  }
});
