import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@172.17.0.1:6543/cardapio?schema=public';
const pool = new Pool({ connectionString });

async function main() {
  // 1. Leads que tiveram cardápio deletado
  const deletedRes = await pool.query(`
    SELECT id, business_name, city, state, stage, 
           to_char(last_contact_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as contact_time,
           metadata->>'menu_status' as menu_status,
           metadata->>'menu_deleted_at' as menu_deleted_at,
           stop_reason
    FROM sales_leads
    WHERE metadata->>'menu_status' = 'deleted' OR stop_reason LIKE '%Cardápio temporário excluído%'
    ORDER BY last_contact_at DESC
  `);

  console.log(`=== LEADS COM CARDÁPIO EXCLUÍDO AUTOMATICAMENTE (${deletedRes.rowCount}) ===`);
  console.table(deletedRes.rows);

  // 2. Leads com cardápio ainda ativo que foram contatados
  const contactedActiveRes = await pool.query(`
    SELECT id, business_name, city, state, stage,
           to_char(last_contact_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as contact_time,
           metadata->>'menu_slug' as slug,
           COALESCE((metadata->>'continuity_confirmed')::boolean, false) as continuity,
           COALESCE((metadata->>'is_showcase')::boolean, false) as is_showcase,
           metadata->>'menu_status' as menu_status
    FROM sales_leads
    WHERE last_contact_at IS NOT NULL
      AND COALESCE(metadata->>'menu_status', '') <> 'deleted'
    ORDER BY last_contact_at DESC
  `);

  console.log(`\n=== LEADS CONTATADOS COM CARDÁPIO AINDA ATIVO (${contactedActiveRes.rowCount}) ===`);
  console.table(contactedActiveRes.rows);

  // 3. Status dos disparos de hoje (20/10)
  const todayRes = await pool.query(`
    SELECT l.business_name,
           to_char(j.run_at at time zone 'America/Sao_Paulo', 'HH24:MI') as slot_brt,
           j.status as job_status,
           l.stage as lead_stage,
           l.metadata->>'menu_status' as menu_status,
           COALESCE(l.metadata->>'link_clicked', 'false') as link_clicked,
           COALESCE((l.metadata->>'continuity_confirmed')::boolean, false) as continuity
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE (j.run_at at time zone 'America/Sao_Paulo')::date = '2026-10-20'
    ORDER BY j.run_at ASC
  `);

  console.log(`\n=== STATUS DOS 15 LEADS DE HOJE (20/10) ===`);
  console.table(todayRes.rows);

  await pool.end();
}

main().catch(console.error);

