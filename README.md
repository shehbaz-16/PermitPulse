# PermitPulse Ontario

Municipal permit leads for Ontario home-service contractors. **Markham, Toronto and Vaughan are live** (real permits via BuildData) and included in every plan. **Mississauga, Brampton, Oakville, Hamilton and Barrie** are BuildData-covered add-on cities ($49/month each, or $199/month for every covered city; see `PRICING` in `server/lib/mapping.js`). Richmond Hill, Stouffville and Aurora have no data source yet and stay on the waitlist.

To make an add-on city live: set its `status` to `active` in `MUNICIPALITIES` (`server/adapters/fixtures.js`), register `makeBuilddataAdapter('<builddata-slug>', '<Name>')` in `server/adapters/index.js`, then run `npm run seed` with the dev server stopped.

BuildData keys allow 100 requests/day. A sync uses up to `BUILDDATA_MAX_PAGES` (default 5) requests per city, so `npm run seed` for three cities uses about 15. `npm test` blanks the key and never calls the real API.

Permit feed with filters and search, watchlist and lead pipeline with notes, direct-mail + social outreach studio, daily alert previews, territory plans, sync status, and CSV export.
Print, ads, SMS/WhatsApp/email and payments are **simulated** in demo mode: no API keys needed, everything persists to the database.

## Run it (macOS Apple Silicon or any Node 18+)

```bash
npm install
npm start          # first boot auto-seeds 20 Markham permits → http://localhost:3000
```

`http://localhost:3000/` is the public contractor landing page (`public/landing.html`); the dashboard lives at `http://localhost:3000/app`.

On Windows you can instead double-click `start-windows.cmd`: it installs dependencies if needed, starts the server and opens the browser.

Optional: `npm run seed` (idempotent), `npm run seed -- --reset` (wipe + reseed), `npm test` (API smoke test), `PORT=4000 npm start`.

No native binaries, no bundler, no CSS build. Express serves a no-build Preact + htm frontend, and the database is **embedded PostgreSQL (PGlite, WASM)** stored in `data/pgdata`.
To use a real PostgreSQL server instead: `DATABASE_URL=postgres://user:pass@localhost:5432/permitpulse npm run seed && DATABASE_URL=... npm start`. The SQL is identical.

## Verify end to end

```bash
curl localhost:3000/api/health                         # {"ok":true,"permits":20,...}
curl "localhost:3000/api/permits?trade=fencing&code=PE"  # 3 pool-enclosure leads
curl -o leads.csv "localhost:3000/api/permits.csv?neighbourhood=Unionville"
curl -X POST localhost:3000/api/sync -H 'Content-Type: application/json' -d '{}'
```
In the UI: filter the feed → star a lead and set it to Quoted → tick two cards → **Export to CSV** → **Launch Outreach** → Launch Campaign → check **Sent Campaigns**, **Daily Alerts → Send Me a Sample**, and **Data & Sync → Run Sync**. Restart the server: everything is still there.

## Map view

Feed → **Map** (next to List). Same filters and search; pins are coloured by lead status, saved leads have a dark ring, and opening a pin shows the permit, value and Launch Outreach plus a dashed ring showing the approximate reach of a 50-home neighbour mailing.

## Social ad targeting (Canada)

Meta's special-ad-category rules list "housing repairs" as housing ads. For ads shown in Canada that means a minimum 25 km radius, no postal-code targeting and no location exclusions, so Facebook and Instagram boosts are city-wide with neighbourhood wording in the creative (`socialTargeting` / `META_MIN_RADIUS_KM` in `server/lib/mapping.js`). Nextdoor targets by neighbourhood. Street-level precision comes from direct mail. Retargeting postcard QR visitors on Meta needs roughly 100+ visitors before it delivers, so it suits a contractor's whole mail program rather than one campaign. ## Billing (Stripe)

Without `STRIPE_SECRET_KEY` the app runs in demo mode: plans activate immediately and campaigns are marked "Demo · no charge". With a key (start with a **test** key, `sk_test_...`):

- **Plans**: "Start Starter Scout" / "Lock my territory" open Stripe Checkout for a monthly subscription ($149 or $399 + 13% HST). The plan activates when payment is confirmed.
- **Campaigns**: "Pay & send" opens Stripe Checkout for mail plus the social setup fee plus HST. Social ad budgets are never charged by PermitPulse.
- **Confirmation**: when the contractor returns from Stripe, `GET /api/billing/verify` checks the session with Stripe, so it works on localhost. In production also add a webhook to `POST /api/billing/webhook` (event `checkout.session.completed`) and set `STRIPE_WEBHOOK_SECRET`.
- **Pro allowance**: an active Pro plan waives the setup fee on 1 social campaign per calendar month.

Test card: 4242 4242 4242 4242, any future expiry, any CVC. HST is a plain line item; consider Stripe Tax and register for HST with the CRA before charging it for real. The app has a single demo contractor and no login, so real billing needs contractor accounts first.

## Email (Resend)

Set `RESEND_API_KEY`, `NOTIFY_EMAIL` and, while testing, `EMAIL_OVERRIDE_TO` in `.env`. Then new sign-ups (plans, waitlist, add-on cities), social requests and the Daily Alerts "Send Me a Sample" email are sent for real. With `EMAIL_OVERRIDE_TO` set, every email goes to that address with the intended recipient shown in the subject. Without a verified domain, Resend's shared sender only delivers to the address your Resend account was created with; check the junk folder the first time. SMS and WhatsApp remain simulated.

## Free hosting (Render + Neon)

1. Push this folder to a GitHub repo (`.env`, `node_modules/` and `data/` are git-ignored, so keys stay private).
2. Create a free Postgres database at neon.tech and copy its connection string.
3. At render.com: New → Blueprint → select the repo (uses `render.yaml`). Fill in `DATABASE_URL` (Neon), `TEAM_PASSWORD`, `BUILDDATA_API_KEY`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `NOTIFY_EMAIL`, `EMAIL_OVERRIDE_TO` and, after the first deploy, `APP_URL`.
4. The first start creates the tables and loads permits (about 15 BuildData requests). In GitHub add the `APP_URL` and `TEAM_PASSWORD` secrets so `.github/workflows/daily-sync.yml` refreshes permits every morning.

The free Render plan sleeps after ~15 idle minutes, so the first visit after that takes 30–60 seconds. Its disk is wiped on restart, which is why the database lives in Neon. The demo uses one shared contractor profile, so every visitor sees and can change the same demo data; real customers need per-contractor logins first. `TEAM_PASSWORD` protects Social Requests, Data & Sync and the demo-data switch.

## Pricing model (all values in `PRICING`, `server/lib/mapping.js`)

- Plans: Starter Scout $149/mo (3 trades, +$29/mo per extra trade), Exclusive Neighborhood Pro $399/mo (every trade). Annual billing = 2 months free ($1,490 / $3,990 per year). Every plan starts with a 14-day free trial (card collected by Stripe, charged after the trial). Stripe Checkout accepts promotion codes, so a founding-member coupon can be created in the Stripe dashboard without code changes.
- Cities: 3 included, $49/mo per extra city, $199/mo for every covered city.
- Mail: $2.50 per permit home, $1.35 per neighbour. Social: $99 setup per campaign (Pro: 1 included per month); ad budget paid by the contractor to Meta / Nextdoor.
- Site visits are the contractor's choice and are not a paid service: a free printable door-knock sheet (`GET /api/route-sheet`, "Door-knock sheet" in the feed) groups the selected permits by street. It warns HVAC contractors off door knocking and flags plumbing/solar/drywall, because Ontario's Consumer Protection Act (O. Reg. 17/05 s. 35.1) bans unsolicited door-to-door selling of furnaces, air conditioners, air cleaners, water heaters, water treatment and duct cleaning.

## Missing construction values (Toronto)

Toronto's open data leaves the construction value blank on almost all plumbing, mechanical and drain permits. These are usually filed with a main building permit sharing the same `YY NNNNNN` number, so after every sync (and on server start) `borrowRelatedValues` copies that value and records "Value source: Related permit …". Cards say where a value came from, or why it is missing.

## Done-for-you social campaigns

Social campaigns are a managed service, not an automated launch. In the outreach studio the contractor requests a campaign and sets their own ad budget ($50–$5,000), length (7/14/30 days), platforms, ad-account readiness and notes. PermitPulse invoices mail plus a $99 setup fee (`PRICING.socialManagementCents`); the ad budget is paid by the contractor directly to Meta / Nextdoor from their own ad accounts and is shown separately, never invoiced.

Each request lands on **Social Requests** (sidebar, "PermitPulse team") with the permit, budget, per-platform targeting, voucher code, ad text and a fulfilment checklist. Build the ads by hand in Meta Ads Manager (special ad category Housing) and Nextdoor Ads Manager, using partner access to the contractor's accounts, then move the status through Setting up → Awaiting approval → Live → Finished. The contractor sees each status on Sent Campaigns.

Email alerts for new requests: set `RESEND_API_KEY` and `NOTIFY_EMAIL` (optionally `NOTIFY_FROM`) in `.env`. Without them requests are only listed in the app. The team page has no login in this demo and must sit behind staff authentication before real use.
- Real permits use BuildData's `lat`/`lng` (not every record has them; the map shows "N of M leads on the map").
- Demo permits get **approximate** positions inside their neighbourhood, and are labelled as such.
- Map tiles come from OpenStreetMap and need internet; pins still work offline. For a paid product use a tile provider (MapTiler, Mapbox, etc.).

## Value filter, social linking, listing details

- **Estimated value**: filter by min/max value or "only permits that publish a value". The (i) disclosure explains it is the applicant-declared construction value on the permit, not a quote, appraisal or contract price, and many permits leave it blank.
- **Map**: green dots = permit publishes a value (bigger = higher); grey = none; hover shows value + address. Toggle "By lead status" for pipeline colours.
- **Social profiles** (company chip, top right): Facebook Page, Instagram handle, Nextdoor business name. Proof of concept only: they drive the Facebook, Instagram and Nextdoor ad previews and the campaign log. Nothing is posted. A real integration needs Meta Business/Marketing API OAuth and an ad account (Nextdoor Ads has a separate partner API).
- **Listing details**: the drawer shows facts extracted from the record. Set `ANTHROPIC_API_KEY` in `.env` for an optional AI summary. Only permit type, status, neighbourhood, value and description are sent (never the address or contacts), and it only restates the record.

## Trades

Trades are separate and filterable (chip row above the filters, plus the dropdown): Fencing, Landscaping & Interlock, Waterproofing, Windows & Blinds, Decks/Porches/Pergolas, Roofing, Basement & Interior Reno, Additions & General Contracting, HVAC, Electrical, Plumbing, Pest Control, Tree Services. A permit's trades come from its code plus keywords in the scope text (`tradesFor` in `server/lib/mapping.js`). Add a trade by adding it to `TRADES`, `TRADES_BY_CODE`/`TEXT_TRADES`, and the copy tables. Existing databases migrate automatically on start.

## Layout

```
server/
  schema.sql            PostgreSQL schema (municipalities → permits, leads, campaigns, alerts, sync…)
  db.js                 PGlite by default, DATABASE_URL → pg
  seed.js               idempotent seed + first sync
  sync.js               runs adapters, upserts, records sync_runs, live→fixture fallback
  adapters/             builddataAdapter, arcgisAdapter, eplanAdapter, seedAdapter, fixtures, normalize (field allowlist)
  lib/mapping.js        permit code → trades → "why it's a lead", pricing, ad/mail copy (shared with the browser)
  lib/alerts.js         SMS / WhatsApp / email content builder
  index.js              REST API + static hosting
public/                 index.html, styles.css, app.js, lib.js, views/*
```

## Real data in 3 minutes (BuildData)

[BuildData](https://www.builddata.ca/api/) sells a REST API of Canadian building permits. It is the quickest route to real Markham permits for a demo.

```bash
cp .env.example .env          # then paste your key:  BUILDDATA_API_KEY=...
npm start                     # then Data & Sync → "Run Sync (all sources)"
```
On the first successful live sync the app switches to **real records only** (the fictional demo permits are hidden, not deleted). Flip **Show demo records** in Data & Sync to bring them back. Each card is tagged *Demo record* or *Public record*.

- **Free key = records at least ~30 days old; Pro ($29 CAD/mo) includes today's.** Free is fine for a proof of concept, but the feed will say "Issued 38 days ago", not "filed 2 days ago". The "42 permits / $4.8M" tiles stay a pitch scenario unless you turn **Demo figures** off.
- First check Markham is covered: `curl -H "X-API-Key: $BUILDDATA_API_KEY" https://api.builddata.ca/permit/coverage`
- After each sync, **Data & Sync** shows e.g. "4 of 5 records have a construction value; 4 have map coordinates". If that count is 0, send me one raw record: the value field may be named differently for Markham. Values are accepted as numbers, "$85,000.00" strings, or cents.
- Free keys allow 100 requests/day; a sync uses up to `BUILDDATA_MAX_PAGES` (default 5).
- Most records have an issued date but only ~half have an application date, so many leads are already-issued permits.
- **Not verified against the live API** (no key was available while building): field names come from BuildData's docs and are tested against a mock server (`npm test`). If a field is missing or renamed, adjust `mapRecord()` in `server/adapters/builddataAdapter.js`.
- Mapping to PermitPulse categories is keyword-based (pool → PE, backwater/plumbing → PP, basement/second unit, etc.). Demolition-only permits are skipped; commercial/industrial ones become "Commercial / Development Application". Contractor phone and address fields are never read.
- **Check BuildData's licence and terms before charging contractors.** Its licence page doesn't address lead generation or direct mail, and showing raw records in a paid product may need a written licence. Markham's credit line is optional per that page; the app's footer credits BuildData and Markham public records anyway.

## Going live with other sources

An adapter is `{key, name, kind, isConfigured(), fetchLive(), fixture(now)}`; register it in `server/adapters/index.js` under a `city_slug`. With no live config the sync runs on fixtures and says so in the Data & Sync view. If a live fetch fails it falls back to fixtures and records `Live failed → fixture`.

| Source | Env vars |
|---|---|
| Real building permits (BuildData) | `BUILDDATA_API_KEY`, optional `BUILDDATA_MUNICIPALITY`, `BUILDDATA_LOOKBACK_DAYS`, `BUILDDATA_MAX_PAGES` |
| Tree permits / development applications (ArcGIS REST) | `MARKHAM_ARCGIS_TREE_URL`, `MARKHAM_ARCGIS_DEVAPP_URL` (layer URLs ending `/FeatureServer/<n>`), optional `MARKHAM_ARCGIS_FIELD_MAP` |
| Building permits (ePLAN / AMANDA) | `MARKHAM_EPLAN_JSON_URL` (an authorised JSON export), optional `MARKHAM_EPLAN_FIELD_MAP` |
| Window | `MARKHAM_SYNC_DAYS` (default 31) |

**Not verified:** I could not confirm the exact Markham FeatureServer layer URLs or field names from here, so none are hard-coded. Open `<layer-url>?f=json`, check the field names, and use the `*_FIELD_MAP` overrides. Markham's public building-permit search is a web portal with no documented API, so the ePLAN adapter does **not** scrape it; it ingests a feed you are entitled to use.

## Data and compliance

- **All seed (demo) records are fictional.** Street names are real Markham streets; numbers, permit numbers, values and dates are invented, and dates are re-based on each sync so the feed looks fresh. Do not present them as real permits to contractors.
- The footer and Data & Sync view carry the *City of Markham Open Data Licence v1.0* attribution and a no-endorsement disclaimer (stored per municipality).
- Only allow-listed fields are ingested (`normalize.js`). Owner names, phones and applicant details are never read or stored. Mailers are addressed to "Current Resident".
- Demo-only: the "42 permits / $4.8M" tiles are a pitch scenario (toggle **Demo figures** off for live counts); territory availability is simulated. The unverified mail read-rate, response-lift and trust statistics were removed; add marketing statistics back only with a citable source.
- Before real mailing you need a licensed address source (e.g. Canada Post / Lob). The "nearest neighbours" count is simulated.
- Canada's anti-spam law (CASL) and CRTC rules apply to real email/SMS alerts.
