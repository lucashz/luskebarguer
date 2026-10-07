import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { reconcileSalesOutreach } from '../src/lib/sales-outreach-reconciliation.js';

loadEnv(new URL('../.env', import.meta.url));
loadEnv(new URL('../../../.env', import.meta.url));

const campaignKey = 'approved-carousel-2026-10-07';
const common = {
  campaignKey,
  messageVersion: 'approved-demo-link-carousel-v1',
  partCount: 4,
  contactedAt: '2026-10-07T15:00:00.000Z',
  deliveryStatus: 'delivered'
};
const manifest = [
  ['Restaurante Sabor Caseiro', '5545999538585'],
  ['Cia das Pizzas Ijuí', '5555991350060'],
  ['Leve Sabor Marmitaria', '5514997916899'],
  ['Pizzaria Barriga Cheia', '5531986853708'],
  ['Bolos da Didi', '5551997946693'],
  ['Seu Gastão', '5567992518148'],
  ['Peixaria Natanael Pescados', '5524999884240'],
  ['Roppongi Sushi House', '556799503122', 'read'],
  ["Justtino's Pizzas & Esfihas", '5517997041628'],
  ['Tetê Gourmet', '5562998055754'],
  ['Pizzaria Santa Adellina', '5519999798874']
].map(([businessName, normalizedPhone, deliveryStatus]) => ({
  businessName,
  normalizedPhone,
  ...common,
  deliveryStatus: deliveryStatus || common.deliveryStatus
}));

const apply = process.argv.includes('--apply');
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL não configurado.');
const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  await client.query('begin');
  const result = await reconcileSalesOutreach(client, manifest, { apply });
  if (apply) await client.query('commit');
  else await client.query('rollback');
  console.log(JSON.stringify({ campaignKey, ...result }, null, 2));
} catch (error) {
  await client.query('rollback').catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}

function loadEnv(url) {
  if (!existsSync(url)) return;
  for (const line of readFileSync(url, 'utf8').split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith('#') || !value.includes('=')) continue;
    const index = value.indexOf('=');
    const key = value.slice(0, index).trim();
    process.env[key] ||= value.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}
