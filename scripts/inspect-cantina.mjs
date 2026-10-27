import pg from 'pg';

const client = new pg.Client('postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public');
await client.connect();

const lead = (await client.query("select id, business_name, segment, city, state, metadata from sales_leads where id = 'e8b421c2-f61b-4903-b889-562171643a12'")).rows[0];
console.log('CANTINA ROMAN LEAD:', lead);

const store = (await client.query("select * from stores where slug = 'cantina-roman'")).rows[0];
console.log('STORE:', store);

await client.end();

