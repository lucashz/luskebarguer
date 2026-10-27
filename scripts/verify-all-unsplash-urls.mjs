import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

async function checkUrl(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    return res.status;
  } catch (err) {
    return `ERR: ${err.message}`;
  }
}

async function run() {
  console.log('Verificando URLs distintas de imagens no banco de dados...');
  const distinctUrls = await pool.query(`
    SELECT DISTINCT image_url FROM menu_items WHERE image_url IS NOT NULL
  `);

  console.log(`Total de URLs distintas encontradas: ${distinctUrls.rows.length}`);
  const badUrls = [];

  for (const row of distinctUrls.rows) {
    const status = await checkUrl(row.image_url);
    if (status !== 200) {
      console.log(`❌ [Status ${status}] ${row.image_url}`);
      badUrls.push({ url: row.image_url, status });
    } else {
      console.log(`✅ [200 OK] ${row.image_url.slice(0, 60)}...`);
    }
  }

  console.log(`\nResumo: ${badUrls.length} URLs quebradas de um total de ${distinctUrls.rows.length}`);
  await pool.end();
}

run().catch(console.error);
