import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const allLeads = await pool.query(`
    SELECT id, business_name, city, state, segment, phone, normalized_phone, stage, attempt_count, last_contact_at
    FROM sales_leads
    ORDER BY created_at DESC
  `);

  console.log(`Total geral de leads no DB: ${allLeads.rows.length}`);
  const uncontacted = allLeads.rows.filter(l => l.attempt_count === 0 && l.last_contact_at === null && !['discarded', 'lost', 'won'].includes(l.stage));
  console.log(`Leads não contatados: ${uncontacted.length}`);
  for (const l of uncontacted) {
    console.log(`- [${l.segment}] ${l.business_name} (${l.city}) - Tel: ${l.phone}`);
  }

  // Verificar leads descartados por no_whatsapp ou outros motivos
  const discarded = await pool.query(`
    SELECT discard_code, count(*) FROM sales_leads WHERE stage = 'discarded' GROUP BY discard_code
  `);
  console.log("\nDescartes:", discarded.rows);

  await pool.end();
}

main().catch(console.error);
