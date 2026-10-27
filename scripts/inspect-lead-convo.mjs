import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

async function main() {
  const phonePart = '981921392';
  try {
    const leads = await pool.query(
      `SELECT * FROM sales_leads WHERE phone LIKE $1`,
      [`%${phonePart}%`]
    );
    console.log('Leads found in DB:', leads.rows.length);
    for (const l of leads.rows) {
      console.log(JSON.stringify(l, null, 2));
    }
  } catch (e) {
    console.error('DB error:', e.message);
  }

  // Query Evolution API for messages
  try {
    const evoUrl = 'http://192.168.1.108:8080/chat/findMessages/tapronto';
    const remoteJid = `5514981921392@s.whatsapp.net`;
    const res = await fetch(evoUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': 'b99ee681a32aafc2cc8376608494974676fd7d19363a60a0d4f6c7a650e9f062'
      },
      body: JSON.stringify({
        where: {
          key: {
            remoteJid: remoteJid
          }
        },
        limit: 50
      })
    });
    const msgs = await res.json();
    console.log('\n--- EVOLUTION API MESSAGES FOR ' + remoteJid + ' ---');
    console.log(JSON.stringify(msgs, null, 2));
  } catch (err) {
    console.error('Error fetching evo messages:', err.message);
  }

  await pool.end();
}

main().catch(console.error);

