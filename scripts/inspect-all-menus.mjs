import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const res = await pool.query(`
    SELECT
      id,
      business_name,
      phone,
      stage,
      to_char(last_contact_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as contact_time_sp,
      ROUND((EXTRACT(EPOCH FROM (NOW() - last_contact_at))/3600)::numeric, 1) as hours_ago,
      COALESCE(metadata->>'menu_status', 'active') as menu_status,
      COALESCE((metadata->>'continuity_confirmed')::boolean, false) as continuity,
      metadata->>'menu_url' as menu_url
    FROM sales_leads
    WHERE metadata->>'store_id' IS NOT NULL OR metadata->>'menu_url' IS NOT NULL
    ORDER BY last_contact_at ASC NULLS LAST
  `);

  console.log(`\n=== LEADS COM CARDÁPIO (TOTAL: ${res.rowCount}) ===`);
  console.table(res.rows);

  const expiredCandidates = res.rows.filter(r => Number(r.hours_ago) >= 15 && !r.continuity && r.menu_status !== 'deleted');
  console.log(`\n=== CANDIDATOS A EXCLUSÃO (> 15 HORAS SEM CONTINUIDADE: ${expiredCandidates.length}) ===`);
  for (const c of expiredCandidates) {
    const msgRes = await pool.query(`SELECT direction, body, created_at FROM sales_messages WHERE lead_id = $1 ORDER BY created_at ASC`, [c.id]);
    const orderRes = await pool.query(`SELECT count(*)::int as count FROM orders WHERE store_id = (SELECT id FROM stores WHERE slug = replace($1, 'https://taprontomenu.com.br/', ''))`, [c.menu_url]);
    console.log(`\nLead: ${c.business_name} (${c.phone}) - Contatado há ${c.hours_ago}h | Stage: ${c.stage}`);
    console.log(`URL: ${c.menu_url} | Pedidos na loja: ${orderRes.rows[0]?.count || 0}`);
    const metaRes = await pool.query(`SELECT metadata FROM sales_leads WHERE id = $1`, [c.id]);
    console.log(`Metadata:`, JSON.stringify(metaRes.rows[0]?.metadata, null, 2));
    console.log(`Mensagens (${msgRes.rowCount}):`);
    for (const m of msgRes.rows) {
      console.log(`  [${m.direction}] ${m.body?.slice(0, 80)}...`);
    }
  }

  const checkStores = await pool.query(`SELECT id, slug, name FROM stores WHERE slug IN ('stopbeer', 'altissimo', 'frank', 'fomemania')`);
  console.log(`\nLojas no banco para os 4 leads expirados (deve ser 0): ${checkStores.rowCount}`);
  if (checkStores.rowCount > 0) console.table(checkStores.rows);

  await pool.end();
}

main().catch(console.error);
