import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const slugs = [
    'boteco-do-bakana',
    'holy-sandwich',
    'blackbird-burger',
    'skin-lanches-da-preta',
    'big-lanches-rota-370',
    'marmitaria-bom-sabor',
    'restaurante-buiu-s',
    'la-bella-pizzaria-choperia',
    'restaurante-panela-de-barro',
    'marmitaria-menu',
    'lian-sorvetes-dois-corregos',
    'ponto-do-acai',
    'padaria-e-marmitaria-pao-quente',
    'armazem-da-gula',
    'bar-do-mineiro-pederneiras-sp'
  ];

  const res = await pool.query(`
    SELECT id, business_name, phone, normalized_phone, city, state, segment, 
           metadata->>'menu_slug' as menu_slug, metadata->>'menu_url' as menu_url,
           metadata->>'store_id' as store_id
    FROM sales_leads
    WHERE metadata->>'menu_slug' = ANY($1)
    ORDER BY array_position($1, (metadata->>'menu_slug')::text)
  `, [slugs]);

  console.log(`Leads encontrados: ${res.rowCount}`);
  console.table(res.rows);

  await pool.end();
}

main().catch(console.error);
