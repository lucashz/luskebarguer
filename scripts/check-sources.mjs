import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const sources = await client.query(`
    SELECT source, count(*) 
    FROM sales_leads 
    GROUP BY source
  `);
  console.log("SOURCES IN DB:", sources.rows);

  const stages = await client.query(`
    SELECT stage, count(*) 
    FROM sales_leads 
    GROUP BY stage
  `);
  console.log("STAGES IN DB:", stages.rows);

  await client.end();
}

main().catch(console.error);

