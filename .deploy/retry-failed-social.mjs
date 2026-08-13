import fs from 'node:fs'; import pg from 'pg';
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) { const index = line.indexOf('='); if (index > 0 && !line.startsWith('#')) process.env[line.slice(0, index).trim()] ??= line.slice(index + 1).trim().replace(/^["']|["']$/g, ''); }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const result = await pool.query(`update social_publications set status='retry',next_attempt_at=now(),lock_expires_at=null,last_error='',updated_at=now() where id=any($1::uuid[]) and status='failed' returning id`, [['ac4212ff-89cb-42ab-9601-ec20f2323ea5','c0cfb3b4-b78d-444d-a2da-9754ea389867']]);
console.log(JSON.stringify({ retried: result.rows.map((row) => row.id) })); await pool.end();
