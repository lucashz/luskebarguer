import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { listAssistedRegistrations, getAssistedRegistration } from '../src/lib/assisted-registration-store.js';

const pool = getLocalPool();
const list = await listAssistedRegistrations(pool);
console.log('Total in listAssistedRegistrations:', list.length);
console.log('First 2:', list.slice(0, 2));

const full = await getAssistedRegistration(pool, 'def1ba95-4975-44de-abf9-2d53e251c0fd');
console.log('Full Refugio in assisted registration store:', full);

await pool.end();
