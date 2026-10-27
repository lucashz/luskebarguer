import pg from 'pg';

async function main() {
  const pool = new pg.Pool({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });

  const res = await pool.query(`
    SELECT 
      j.id,
      j.status,
      l.business_name,
      l.phone,
      l.city,
      j.payload->>'menuUrl' as menu_url,
      j.payload->>'message' as msg,
      j.payload->>'desktopCaption' as d_cap,
      j.payload->>'mobileCaption' as m_cap
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE j.idempotency_key LIKE 'monday-marmitarias-2026-10-26:%'
    ORDER BY j.run_at ASC
  `);

  console.log(`TOTAL LEADS: ${res.rows.length}`);
  for (let i = 0; i < res.rows.length; i++) {
    const r = res.rows[i];
    console.log(`\n================== [${i+1}] ${r.business_name} ==================`);
    console.log(`Status: ${r.status}`);
    console.log(`Phone: ${r.phone} | Cidade: ${r.city}`);
    console.log(`Menu: ${r.menu_url}`);
    console.log(`Mensagem:\n${r.msg}`);
    console.log(`Desktop Caption: ${r.d_cap}`);
    console.log(`Mobile Caption:  ${r.m_cap}`);
  }

  await pool.end();
}

main().catch(console.error);

