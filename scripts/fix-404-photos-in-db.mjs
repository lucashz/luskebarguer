import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

const REPLACEMENTS = [
  {
    oldUrl: 'https://images.unsplash.com/photo-1608270197495-97e3a9c78d59?auto=format&fit=crop&w=1200&q=85',
    newUrl: 'https://images.unsplash.com/photo-1518176258769-f227c798150e?auto=format&fit=crop&w=1200&q=85',
    label: 'Cerveja/Beer'
  },
  {
    oldUrl: 'https://images.unsplash.com/photo-1535141192574-5d4897c13136?auto=format&fit=crop&w=1200&q=85',
    newUrl: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=85',
    label: 'Torta/Cake'
  },
  {
    oldUrl: 'https://images.unsplash.com/photo-1606755962773-d324e2dabd5f?auto=format&fit=crop&w=1200&q=85',
    newUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=85',
    label: 'Burger/Combo'
  }
];

async function run() {
  console.log('=== ATUALIZANDO FOTOS 404 NO BANCO DE DADOS ===\n');

  for (const { oldUrl, newUrl, label } of REPLACEMENTS) {
    const res = await pool.query(`
      UPDATE menu_items 
      SET image_url = $1, updated_at = NOW() 
      WHERE image_url = $2
      RETURNING id, name
    `, [newUrl, oldUrl]);

    console.log(`✅ [${label}] Atualizados ${res.rowCount} itens para URL verificada:`);
    for (const item of res.rows) {
      console.log(`   - ${item.name} (${item.id})`);
    }
  }

  // Also verify store covers
  for (const { oldUrl, newUrl, label } of REPLACEMENTS) {
    const res = await pool.query(`
      UPDATE store_settings 
      SET cover_url = $1, updated_at = NOW() 
      WHERE cover_url = $2
      RETURNING store_id
    `, [newUrl, oldUrl]);
    if (res.rowCount > 0) {
      console.log(`✅ [${label}] Atualizadas ${res.rowCount} capas de loja.`);
    }
  }

  console.log('\nTodas as fotos 404 foram substituídas com sucesso!');
  await pool.end();
}

run().catch(console.error);
