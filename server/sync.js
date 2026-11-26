import { getDb } from './db.js';
import { adaptersFor } from './adapters/index.js';

const UPSERT = `
INSERT INTO permits (municipality_id, source_key, source_id, permit_number, permit_code, permit_type, category, status,
  filed_at, issued_at, status_changed_at, street_number, street_name, unit, address, neighbourhood, postal_fsa,
  est_value, scope, trades, is_demo, lat, lng, details)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21,$22,$23,$24::jsonb)
ON CONFLICT (municipality_id, source_key, source_id) DO UPDATE SET
  status = EXCLUDED.status, filed_at = EXCLUDED.filed_at, issued_at = EXCLUDED.issued_at,
  status_changed_at = EXCLUDED.status_changed_at, postal_fsa = EXCLUDED.postal_fsa, est_value = EXCLUDED.est_value, scope = EXCLUDED.scope,
  trades = EXCLUDED.trades, is_demo = EXCLUDED.is_demo, lat = EXCLUDED.lat, lng = EXCLUDED.lng, details = EXCLUDED.details, updated_at = now()`;

export async function runSync({ citySlug = 'markham', sourceKey = null } = {}) {
  const db = await getDb();
  const city = (await db.query('SELECT id FROM municipalities WHERE city_slug=$1', [citySlug])).rows[0];
  if (!city) throw new Error(`Unknown city ${citySlug}`);
  const results = [];
  for (const a of adaptersFor(citySlug)) {
    if (sourceKey && a.key !== sourceKey) continue;
    await db.query(`INSERT INTO data_sources (municipality_id, source_key, name, kind, description) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (municipality_id, source_key) DO NOTHING`, [city.id, a.key, a.name, a.kind, a.description]);
    const run = (await db.query(
      `INSERT INTO sync_runs (municipality_id, source_key) VALUES ($1,$2) RETURNING id`, [city.id, a.key])).rows[0];
    let mode, message, records;
    const now = new Date();
    if (a.isConfigured()) {
      try {
        records = await a.fetchLive();
        mode = 'live';
        message = `Fetched ${records.length} record(s) from the live endpoint.${records.info ? ' ' + records.info : ''}`;
      } catch (e) {
        records = a.fixture(now);
        mode = 'fallback';
        message = `Live fetch failed (${e.message}). Loaded fixture data instead.`;
      }
    } else {
      records = a.fixture(now);
      mode = 'fixture';
      message = a.unconfiguredMessage || (a.key === 'seed'
        ? 'Loaded seed dataset.'
        : 'Live endpoint not configured. Loaded fixture data (set the env vars in the README to go live).');
    }
    let upserted = 0;
    for (const p of records) {
      await db.query(UPSERT, [city.id, a.key, p.source_id, p.permit_number, p.permit_code, p.permit_type, p.category,
        p.status, p.filed_at, p.issued_at, p.status_changed_at, p.street_number, p.street_name, p.unit, p.address,
        p.neighbourhood, p.postal_fsa, p.est_value, p.scope, JSON.stringify(p.trades), mode !== 'live', p.lat ?? null, p.lng ?? null, JSON.stringify(p.details || {})]);
      upserted++;
    }
    const count = (await db.query('SELECT count(*)::int AS n FROM permits WHERE municipality_id=$1 AND source_key=$2', [city.id, a.key])).rows[0].n;
    await db.query(`UPDATE sync_runs SET finished_at=now(), mode=$2, status='ok', fetched=$3, upserted=$4, message=$5 WHERE id=$1`,
      [run.id, mode, records.length, upserted, message]);
    await db.query(`UPDATE data_sources SET last_sync_at=now(), last_mode=$3, last_status='ok', last_message=$4, record_count=$5
      WHERE municipality_id=$1 AND source_key=$2`, [city.id, a.key, mode, message, count]);
    // Real records arrived: from now on show only real data, unless the user switches demo records back on.
    if (mode === 'live' && upserted > 0 && !(await db.query(`SELECT 1 FROM app_settings WHERE key='show_demo'`)).rows.length) {
      await db.query(`INSERT INTO app_settings (key, value) VALUES ('show_demo','false'::jsonb) ON CONFLICT (key) DO NOTHING`);
    }
    results.push({ source: a.key, mode, fetched: records.length, upserted, message });
  }
  const borrowed = await borrowRelatedValues(city.id);
  if (borrowed) results.push({ source: 'related-values', mode: 'derived', fetched: 0, upserted: borrowed, message: `${borrowed} permit(s) got a value from a related permit with the same number.` });
  return results;
}

/**
 * Toronto (and some other cities) leave the construction value blank on plumbing, mechanical and drain permits,
 * which are filed alongside a main building permit sharing the same "YY NNNNNN" number. Borrow that value and
 * record where it came from. Re-applied after every sync because the upsert resets est_value from the source.
 */
export async function borrowRelatedValues(municipalityId) {
  const db = await getDb();
  const res = await db.query(
    `UPDATE permits p SET est_value = s.est_value,
       details = p.details || jsonb_build_object('Value source', 'Related permit ' || s.permit_number)
     FROM (SELECT DISTINCT ON (substring(permit_number from '^\\d{2} \\d{6}')) substring(permit_number from '^\\d{2} \\d{6}') AS base, est_value, permit_number
           FROM permits WHERE municipality_id = $1 AND est_value IS NOT NULL AND permit_number ~ '^\\d{2} \\d{6}'
           ORDER BY substring(permit_number from '^\\d{2} \\d{6}'), est_value DESC) s
     WHERE p.municipality_id = $1 AND p.est_value IS NULL AND substring(p.permit_number from '^\\d{2} \\d{6}') = s.base
     RETURNING p.id`, [municipalityId]);
  return res.rows.length;
}
