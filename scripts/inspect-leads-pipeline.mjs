import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const stages = await pool.query('SELECT stage, count(*) FROM sales_leads GROUP BY stage ORDER BY count DESC');
  console.log('Stages distribution:');
  for (const s of stages.rows) {
    console.log(` - ${s.stage}: ${s.count}`);
  }

  const awaiting = await pool.query(`
    SELECT id, business_name, phone, stage, last_contact_at, metadata->>'menu_url' as menu_url
    FROM sales_leads
    WHERE stage = 'awaiting_reply'
    ORDER BY last_contact_at DESC
  `);
  console.log(`\nLeads em 'awaiting_reply' (${awaiting.rowCount}):`);
  for (const l of awaiting.rows) {
    console.log(` - ${l.business_name} | Tel: ${l.phone} | Contatado: ${l.last_contact_at ? new Date(l.last_contact_at).toLocaleString('pt-BR') : 'N/A'}`);
  }

  const discovered = await pool.query(`
    SELECT id, business_name, phone, normalized_phone, city, state, segment, stage
    FROM sales_leads
    WHERE stage IN ('discovered', 'basic_validated', 'activity_validated', 'photos_ready')
    ORDER BY created_at DESC
    LIMIT 20
  `);
  console.log(`\nLeads candidatos prontos para qualificação/preparação (${discovered.rowCount}):`);
  for (const d of discovered.rows) {
    console.log(` - ${d.business_name} (${d.segment}) | ${d.city}/${d.state} | Tel: ${d.phone} | Stage: ${d.stage}`);
  }

  await pool.end();
}

main().catch(console.error);

