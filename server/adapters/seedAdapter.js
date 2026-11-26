import { SEED_PERMITS } from './fixtures.js';
import { fromFixture } from './normalize.js';

/** Baseline demo dataset: always available, never touches the network. */
export const seedAdapter = {
  key: 'seed',
  name: 'Seed Dataset',
  kind: 'fixture',
  description: 'Fictional but realistic Markham residential permits so the demo works 100% offline.',
  isConfigured: () => false,
  async fetchLive() { throw new Error('Seed dataset has no live endpoint'); },
  fixture: (now) => SEED_PERMITS.map((r) => fromFixture(r, now)),
};
