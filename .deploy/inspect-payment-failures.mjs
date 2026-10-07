import pg from 'pg';
import fs from 'node:fs';
for (const line of fs.readFileSync('/var/www/.env', 'utf8').split(/\r?\n/)) {
  const index = line.indexOf('=');
  if (index > 0 && !line.startsWith('#')) process.env[line.slice(0, index)] ||= line.slice(index + 1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const result = await client.query(`select pa.created_at, pa.status, pa.failure_code, pa.failure_message,
  pa.provider, pa.amount_cents, o.public_code
  from payment_attempts pa join orders o on o.id = pa.order_id
  order by pa.created_at desc limit 12`);
console.log(JSON.stringify(result.rows, null, 2));
await client.end();
