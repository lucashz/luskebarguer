import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

async function main() {
  const phone = '555433581112';
  const leadRes = await pool.query(`SELECT * FROM sales_leads WHERE phone LIKE $1`, [`%${phone}%`]);
  console.log('Lead Via Daros:', leadRes.rows.map(r => ({ id: r.id, name: r.business_name, stage: r.stage })));

  if (leadRes.rows.length) {
    const msgs = await pool.query(`SELECT id, direction, body, status, sent_at, created_at FROM sales_messages WHERE lead_id = $1 ORDER BY created_at ASC`, [leadRes.rows[0].id]);
    console.log('Messages for Via Daros in DB:', msgs.rows);
  }

  // Also query VM evolution postgres
  const { execSync } = await import('node:child_process');
  const sql = `SELECT id, "key"->>'remoteJid' as remoteJid, "key"->>'fromMe' as fromMe, "messageTimestamp", "message"::text as msg 
               FROM "Message" 
               WHERE "key"::text LIKE '%33581112%' OR "key"::text LIKE '%5433581112%'
               ORDER BY "messageTimestamp" ASC;`;
  const out = execSync(`ssh root@192.168.1.108 "docker exec -i evolution_postgres psql -U evolution -d evolution"`, {
    input: sql,
    encoding: 'utf8'
  });
  console.log('\nEvolution DB messages for Via Daros:\n', out);

  await pool.end();
}

main().catch(console.error);

