try { process.loadEnvFile?.('.env'); } catch {}

console.log({
  EVOLUTION_V2_BASE_URL: process.env.EVOLUTION_V2_BASE_URL,
  EVOLUTION_V2_INSTANCE: process.env.EVOLUTION_V2_INSTANCE,
  hasApiKey: Boolean(process.env.EVOLUTION_V2_API_KEY)
});
