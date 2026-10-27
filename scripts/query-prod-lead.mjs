import { execSync } from 'child_process';
const script = `
const pg = require('/opt/tapronto-outreach/node_modules/pg');
async function run() {
  const c = new pg.Client('postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@127.0.0.1:6543/cardapio?schema=public');
  await c.connect();
  const res = await c.query("SELECT id, business_name, phone, stage, metadata FROM sales_leads WHERE phone LIKE '%991541084%'");
  console.log('Lead found:', JSON.stringify(res.rows, null, 2));
  await c.end();
}
run().catch(console.error);
`;
const out = execSync('ssh root@192.168.1.108 "node -e \\"' + script.replace(/\n/g, ' ').replace(/"/g, '\\"') + '\\""', { encoding: 'utf8' });
console.log(out);
