import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStudioServer } from '../src/lib/marketing-studio-server.js';
import { studioConfig } from '../src/lib/marketing-studio.js';

const root = fileURLToPath(new URL('..', import.meta.url));
// Explicitly opt in; never start this from server.js or a production worker.
const app = await createStudioServer({
  organizations: String(process.env.STUDIO_DEV_ORGS || 'clinica-demo').split(',').map((org) => org.trim()),
  root: path.join(root, '.studio-data'), config: studioConfig(),
  limits: { images: limit('STUDIO_MONTHLY_IMAGES', 30), captions: limit('STUDIO_MONTHLY_CAPTIONS', 60) },
});
function limit(key, fallback) { const value = Number(process.env[key] || fallback); if (!Number.isInteger(value) || value < 1 || value > 1000) throw new Error(`${key} deve ser um inteiro de 1 a 1000.`); return value; }
try {
  await app.listen(Number(process.env.STUDIO_DEV_PORT || 7071));
  console.log('Marketing Studio — desenvolvimento local. Links válidos por 10 minutos, uso único:');
  for (const org of String(process.env.STUDIO_DEV_ORGS || 'clinica-demo').split(',').map((org) => org.trim())) console.log(`${org}: ${app.developmentLink(org)}`);
  console.log('Para emitir novos links com o servidor aberto, pressione Enter. Ctrl+C encerra.');
  process.stdin.on('data', () => { for (const org of String(process.env.STUDIO_DEV_ORGS || 'clinica-demo').split(',').map((org) => org.trim())) console.log(`${org}: ${app.developmentLink(org)}`); });
  let closing = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { if (closing) return; closing = true; await app.close(); process.exit(0); });
} catch (error) { await app.close(); throw error; }
