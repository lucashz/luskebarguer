import { evolutionV2SalesConfig, getEvolutionV2ConnectionState } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const config = evolutionV2SalesConfig();
console.log('Evolution baseUrl:', config.baseUrl, 'instance:', config.instance);
const conn = await getEvolutionV2ConnectionState(config);
console.log('Evolution status:', conn);

