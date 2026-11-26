// Adapter registry, keyed by city_slug. Adding a city = add an entry here (and a municipalities row).
//
// Adapter interface:
//   key, name, kind, description
//   isConfigured(): boolean                 — is a live endpoint configured?
//   fetchLive(): Promise<NormalizedPermit[]> — real ingestion (throws on failure)
//   fixture(now): NormalizedPermit[]         — offline fallback
import { seedAdapter } from './seedAdapter.js';
import { arcgisAdapter } from './arcgisAdapter.js';
import { eplanAdapter } from './eplanAdapter.js';
import { builddataAdapter, makeBuilddataAdapter } from './builddataAdapter.js';

export const ADAPTERS = {
  markham: [builddataAdapter, arcgisAdapter, eplanAdapter, seedAdapter],
  toronto: [makeBuilddataAdapter('toronto', 'Toronto')],
  vaughan: [makeBuilddataAdapter('vaughan', 'Vaughan')],
};

export const adaptersFor = (slug) => ADAPTERS[slug] || [];
