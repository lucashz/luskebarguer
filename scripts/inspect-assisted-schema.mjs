import { getLocalPool } from './src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();
const res = await pool.query(`
  SELECT enumlabel 
  FROM pg_enum 
  JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
  WHERE pg_type.typname = 'AssistedRegistrationStatus'
  ORDER BY enumsortorder
`);
console.log('AssistedRegistrationStatus:', res.rows.map(r => r.enumlabel));

const draftCols = await pool.query(`
  SELECT column_name, data_type, is_nullable, column_default 
  FROM information_schema.columns 
  WHERE table_name = 'assisted_menu_drafts' 
  ORDER BY ordinal_position
`);
console.log('assisted_menu_drafts columns:', draftCols.rows);

const currentDrafts = await pool.query('SELECT * FROM assisted_menu_drafts LIMIT 1');
console.log('draft sample:', JSON.stringify(currentDrafts.rows[0], null, 2));

const currentRegs = await pool.query('SELECT * FROM assisted_registrations LIMIT 2');
console.log('registration sample:', JSON.stringify(currentRegs.rows, null, 2));

await pool.end();
