import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const events = await client.query("SELECT event_type, count(*) FROM sales_automation_events GROUP BY event_type");
  console.log("EVENTS IN DB:", events.rows);

  const runs = await client.query("SELECT * FROM sales_discovery_runs ORDER BY created_at DESC LIMIT 5");
  console.log("RUNS IN DB:", runs.rows);

  const recentEvents = await client.query("SELECT * FROM sales_automation_events ORDER BY created_at DESC LIMIT 5");
  console.log("RECENT EVENTS:", recentEvents.rows);

  await client.end();
}

main().catch(console.error);

