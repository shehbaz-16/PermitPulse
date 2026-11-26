import './env.js';
// One-command seed:  npm run seed        (idempotent)       npm run seed -- --reset   (wipes everything first)
import { pathToFileURL } from 'node:url';
import { getDb, migrate } from './db.js';
import { runSync } from './sync.js';
import { adaptersFor } from './adapters/index.js';
import { MUNICIPALITIES, MARKHAM_NEIGHBOURHOODS } from './adapters/fixtures.js';
import { TRADES } from './lib/mapping.js';

export async function seed({ reset = false, quiet = false } = {}) {
  const db = await getDb();
  if (reset) await db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();

  for (const m of MUNICIPALITIES) {
    await db.query(
      `INSERT INTO municipalities (city_slug, name, status, sort_order, license_name, attribution)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (city_slug) DO UPDATE SET name=EXCLUDED.name, status=EXCLUDED.status, sort_order=EXCLUDED.sort_order,
         license_name=EXCLUDED.license_name, attribution=EXCLUDED.attribution`,
      [m.slug, m.name, m.status, m.order, m.license || null, m.attribution || null]);
  }
  const markham = (await db.query(`SELECT id FROM municipalities WHERE city_slug='markham'`)).rows[0];

  for (const n of MARKHAM_NEIGHBOURHOODS) {
    const slug = n.name.toLowerCase().replace(/\s+/g, '-');
    await db.query(
      `INSERT INTO neighbourhoods (municipality_id, slug, name, adjacent) VALUES ($1,$2,$3,$4::jsonb)
       ON CONFLICT (municipality_id, slug) DO UPDATE SET adjacent = EXCLUDED.adjacent`,
      [markham.id, slug, n.name, JSON.stringify(n.adjacent)]);
  }

  const active = (await db.query(`SELECT id, city_slug FROM municipalities WHERE status='active' ORDER BY sort_order`)).rows;
  for (const city of active) {
    for (const a of adaptersFor(city.city_slug)) {
      await db.query(
        `INSERT INTO data_sources (municipality_id, source_key, name, kind, description) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (municipality_id, source_key) DO UPDATE SET name=EXCLUDED.name, kind=EXCLUDED.kind, description=EXCLUDED.description`,
        [city.id, a.key, a.name, a.kind, a.description]);
    }
  }

  if (!(await db.query('SELECT 1 FROM contractors LIMIT 1')).rows.length) {
    await db.query(
      `INSERT INTO contractors (company_name, trade, contact_name, email, phone) VALUES ($1,$2,$3,$4,$5)`,
      ['Maple Ridge Fence & Interlock', 'fencing', 'Demo Contractor', '', '']);
  }

  // Demo-only territory availability (clearly labelled as demo in the UI).
  const claimed = { fencing: 1, landscaping: 1, reno: 1, plumbing: 1, tree: 0, waterproofing: 0, windows: 0, hvac: 0, electrical: 0 };
  for (const city of active) {
    for (const t of TRADES) {
      await db.query(
        `INSERT INTO territory_slots (municipality_id, trade, total_slots, claimed) VALUES ($1,$2,2,$3)
         ON CONFLICT (municipality_id, trade) DO NOTHING`, [city.id, t.key, city.id === markham.id ? claimed[t.key] ?? 0 : 0]);
    }
  }

  // Pitch-deck scenario figures (shown only while "Demo Mode" is on in the UI).
  await db.query(
    `INSERT INTO app_settings (key, value) VALUES ('demo_kpis', $1::jsonb) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify({ permitsThisWeek: 42, projectValue: 4800000 })]);

  const results = [];
  for (const city of active) {
    for (const r of await runSync({ citySlug: city.city_slug })) results.push({ ...r, city: city.city_slug });
  }
  const count = (await db.query('SELECT count(*)::int AS n FROM permits')).rows[0].n;
  if (!quiet) {
    console.log(`Database: ${db.kind}`);
    for (const r of results) console.log(`  sync ${r.city.padEnd(8)} ${r.source.padEnd(15)} ${r.mode.padEnd(8)} ${r.upserted} record(s)`);
    console.log(`Seeded. ${count} permits in database.`);
  }
  return count;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed({ reset: process.argv.includes('--reset') }).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
