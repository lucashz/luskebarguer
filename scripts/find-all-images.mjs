import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const count = await pool.query(`SELECT count(distinct image_url)::int as count FROM menu_items WHERE image_url IS NOT NULL`);
  console.log('Total de imagens distintas no banco:', count.rows[0]);

  const items = await pool.query(`SELECT DISTINCT name, image_url FROM menu_items WHERE image_url IS NOT NULL ORDER BY name`);
  console.log(`=== TODOS OS ITENS COM IMAGEM NO BANCO (${items.rowCount}) ===`);
  console.table(items.rows);

  await pool.end();
}

main().catch(console.error);
