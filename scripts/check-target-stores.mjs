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
    SELECT s.id, s.slug, s.name, count(m.id) as items_count,
           count(m.image_url) as items_with_image
    FROM stores s
    LEFT JOIN menu_items m ON m.store_id = s.id
    WHERE s.slug = ANY($1)
    GROUP BY s.id, s.slug, s.name
  `, [slugs]);

  console.table(res.rows);
  await pool.end();
}

main().catch(console.error);
