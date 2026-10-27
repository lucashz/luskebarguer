import { evolutionV2SalesConfig, getEvolutionV2ConnectionState } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const cfg = evolutionV2SalesConfig();
console.log("Evolution config:", {
  baseUrl: cfg.baseUrl,
  instance: cfg.instance,
  hasApiKey: Boolean(cfg.apiKey)
});

getEvolutionV2ConnectionState(cfg).then(state => {
  console.log("Connection state:", state);
}).catch(e => {
  console.error("Connection error:", e.message);
});
