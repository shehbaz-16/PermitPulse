// Database adapter. Default: embedded Postgres (PGlite, WASM — no install, no native binaries).
// Set DATABASE_URL=postgres://... to use a real PostgreSQL server instead. Same SQL either way.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let db;

export async function getDb() {
  if (db) return db;
  if (process.env.DATABASE_URL) {
    const pg = (await import('pg')).default;
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    db = {
      kind: 'PostgreSQL (DATABASE_URL)',
      query: (sql, params) => pool.query(sql, params),
      exec: (sql) => pool.query(sql),
      close: () => pool.end(),
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = process.env.PGLITE_DIR || path.join(root, 'data', 'pgdata');
    if (dir !== 'memory://') fs.mkdirSync(path.dirname(dir), { recursive: true });
    const pg = new PGlite(dir);
    await pg.waitReady;
    db = {
      kind: 'Embedded PostgreSQL (PGlite)',
      query: (sql, params) => pg.query(sql, params),
      exec: (sql) => pg.exec(sql),
      close: () => pg.close(),
    };
  }
  return db;
}

export async function migrate() {
  const d = await getDb();
  const sql = fs.readFileSync(path.join(root, 'server', 'schema.sql'), 'utf8');
  await d.exec(sql);
  await migrateTrades(d);
  await migrateSecondUnits(d);
  return d;
}

// One-off: Markham "Accessory Apartment" permits were stored as Commercial. Relabel them as second suites.
async function migrateSecondUnits(d) {
  const done = (await d.query(`SELECT 1 FROM app_settings WHERE key='second_units_v' AND value='2'::jsonb`)).rows.length;
  if (done) return;
  const { tradesFor } = await import('./lib/mapping.js');
  const re = 'accessory apartment|basement apartment|secondary suite';
  const rows = (await d.query(`SELECT id, permit_type, scope FROM permits
    WHERE category <> 'Secondary Suite / Basement' AND (scope ~* '${re}' OR permit_type ~* '${re}')
      AND permit_code IN ('DA','AL')`)).rows;
  for (const r of rows) {
    await d.query(`UPDATE permits SET permit_code='AL', category='Secondary Suite / Basement', trades=$1::jsonb WHERE id=$2`,
      [JSON.stringify(tradesFor('AL', `${r.permit_type} Secondary Suite / Basement ${r.scope}`)), r.id]);
  }
  await d.query(`INSERT INTO app_settings (key, value) VALUES ('second_units_v','2'::jsonb) ON CONFLICT (key) DO UPDATE SET value='2'::jsonb`);
}

// One-off: trades were split (hvac_electrical → hvac + electrical, plus new trades). Recompute stored permit trades from
// code + scope text, and rewrite any saved reference to the old key. Guarded by a version flag so it runs once.
async function migrateTrades(d) {
  const done = (await d.query(`SELECT 1 FROM app_settings WHERE key='trades_v' AND value='4'::jsonb`)).rows.length;
  if (done) return;
  const { tradesFor, TRADES } = await import('./lib/mapping.js');
  const rows = (await d.query(`SELECT id, permit_code, permit_type, category, scope FROM permits`)).rows;
  for (const r of rows) {
    await d.query('UPDATE permits SET trades=$1::jsonb WHERE id=$2',
      [JSON.stringify(tradesFor(r.permit_code, `${r.permit_type} ${r.category} ${r.scope}`)), r.id]);
  }
  const swap = `(SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb) FROM (
      SELECT jsonb_array_elements_text(CASE WHEN trades ? 'hvac_electrical' THEN (trades - 'hvac_electrical') || '["hvac","electrical"]'::jsonb ELSE trades END) AS x) t)`;
  await d.exec(`UPDATE alert_subscriptions SET trades = ${swap} WHERE trades ? 'hvac_electrical'`);
  for (const t of ['contractors', 'campaigns']) await d.exec(`UPDATE ${t} SET trade='hvac' WHERE trade='hvac_electrical'`);
  for (const m of (await d.query('SELECT id FROM municipalities')).rows) {
    for (const t of TRADES) await d.query(`INSERT INTO territory_slots (municipality_id, trade, total_slots, claimed) VALUES ($1,$2,2,0) ON CONFLICT (municipality_id, trade) DO NOTHING`, [m.id, t.key]);
  }
  await d.exec(`DELETE FROM territory_slots WHERE trade='hvac_electrical'`);
  await d.exec(`UPDATE territory_requests SET trade='hvac' WHERE trade='hvac_electrical'`);
  await d.query(`INSERT INTO app_settings (key, value) VALUES ('trades_v','4'::jsonb) ON CONFLICT (key) DO UPDATE SET value='4'::jsonb`);
}
