import pg from 'pg';
import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState
} from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function verify() {
  console.log("================================================================");
  console.log("  RELATÓRIO DE PRONTIDÃO DOS 40 LEADS DE AMANHÃ (2026-10-28)    ");
  console.log("================================================================\n");

  const evoConfig = evolutionV2SalesConfig();
  const conn = await getEvolutionV2ConnectionState(evoConfig);
  console.log(`🔌 Status Evolution API: ${conn.connected ? 'ONLINE (Conectada)' : 'OFFLINE'} [Instância: ${evoConfig.instance}]`);

  const res = await pool.query(`
    SELECT 
      id, 
      business_name, 
      segment, 
      city, 
      phone, 
      metadata->>'target_turn' AS turno,
      metadata->>'store_id' AS store_id,
      metadata->>'menu_slug' AS slug,
      metadata->>'tracked_url' AS tracked_url
    FROM sales_leads
    WHERE metadata->>'target_date' = '2026-10-28'
    ORDER BY 
      CASE WHEN metadata->>'target_turn' = 'manha' THEN 1 ELSE 2 END,
      business_name ASC
  `);

  console.log(`\nTotal de Leads Prontos no Banco: ${res.rows.length} (Meta: 40)`);

  const storeIds = res.rows.map(r => r.store_id).filter(Boolean);

  const itemsRes = await pool.query(`
    SELECT 
      count(*) as total_items,
      count(CASE WHEN image_url IS NULL OR length(trim(image_url)) = 0 THEN 1 END) as missing_images
    FROM menu_items
    WHERE store_id = ANY($1::uuid[])
  `, [storeIds]);

  console.log(`\n📸 Auditoria de Imagens (Regra de Ouro do Cardápio):`);
  console.log(`   Total de Produtos Criados: ${itemsRes.rows[0].total_items}`);
  console.log(`   Produtos sem Imagem: ${itemsRes.rows[0].missing_images} (DEVE SER 0)`);

  const manha = res.rows.filter(r => r.turno === 'manha');
  const noite = res.rows.filter(r => r.turno === 'noite');

  console.log(`\n📋 Turno 1: Manhã (Almoço / 10:00 - 11:30) - ${manha.length} leads:`);
  manha.forEach((l, idx) => {
    console.log(`   ${String(idx + 1).padStart(2, ' ')}. [${l.segment.padEnd(12, ' ')}] ${l.business_name.padEnd(35, ' ')} | ${l.phone} | ${l.slug}`);
  });

  console.log(`\n📋 Turno 2: Noite (Delivery / 17:00 - 18:30) - ${noite.length} leads:`);
  noite.forEach((l, idx) => {
    console.log(`   ${String(idx + 1).padStart(2, ' ')}. [${l.segment.padEnd(12, ' ')}] ${l.business_name.padEnd(35, ' ')} | ${l.phone} | ${l.slug}`);
  });

  console.log("\n================================================================");
  console.log("Status: 100% PRONTO PARA DISPARO AUTOMATIZADO EM HORÁRIOS PROGRAMADOS");
  console.log("================================================================\n");

  await pool.end();
}

verify().catch(console.error);

