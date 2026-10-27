import pg from 'pg';
import { provisionOutreachStore } from '../src/lib/outreach-store-provisioning.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

async function main() {
  const leadId = 'c3406089-f81a-40d9-963c-30988ffdf058'; // Cozinha da Elis
  const leadRes = await pool.query(`SELECT * FROM sales_leads WHERE id = $1`, [leadId]);
  const lead = leadRes.rows[0];
  console.log('Provisionando lead:', lead.business_name);

  const prov = await provisionOutreachStore({ lead, pool, baseUrl: 'https://taprontomenu.com.br' });
  console.log('Resultado do provisionamento:', prov);

  // Verificar itens do cardápio criados
  const items = await pool.query(`SELECT name, price, image_url FROM menu_items WHERE store_id = $1`, [prov.storeId]);
  console.log(`\nItens cadastrados (${items.rows.length}):`);
  let missing = 0;
  for (const it of items.rows) {
    const hasImg = Boolean(it.image_url && it.image_url.trim());
    if (!hasImg) missing++;
    console.log(`- ${it.name} | Img: ${hasImg ? '✅ ' + it.image_url.slice(0, 60) + '...' : '❌ SEM IMAGEM'}`);
  }
  console.log(`\nTotal sem imagem: ${missing} de ${items.rows.length}`);

  await pool.end();
}

main().catch(console.error);
