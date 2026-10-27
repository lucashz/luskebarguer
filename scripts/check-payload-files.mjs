import pg from 'pg';
import { access } from 'node:fs/promises';

async function main() {
  const pool = new pg.Pool({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });

  const res = await pool.query(`
    SELECT j.id, j.payload
    FROM sales_automation_jobs j
    WHERE j.idempotency_key LIKE 'monday-marmitarias-2026-10-26:%'
  `);

  console.log(`Checando arquivos para ${res.rows.length} jobs:`);
  for (const r of res.rows) {
    const p = r.payload;
    let deskOk = false;
    let mobOk = false;
    try { await access(p.desktopFile); deskOk = true; } catch {}
    try { await access(p.mobileFile); mobOk = true; } catch {}
    console.log(`- ${p.businessName}:`);
    console.log(`    Desktop: ${p.desktopFile} -> ${deskOk ? 'OK' : 'MISSING'}`);
    console.log(`    Mobile:  ${p.mobileFile} -> ${mobOk ? 'OK' : 'MISSING'}`);
  }

  await pool.end();
}

main().catch(console.error);

