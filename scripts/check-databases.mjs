import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const dbs = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false;');
  console.log('Databases:', dbs.rows);

  const schemas = await client.query('SELECT schema_name FROM information_schema.schemata;');
  console.log('Schemas:', schemas.rows);

  await client.end();
}

main().catch(console.error);

