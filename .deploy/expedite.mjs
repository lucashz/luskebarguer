import fs from 'node:fs'; import pg from 'pg';
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) { const index = line.indexOf('='); if (index > 0 && !line.startsWith('#')) process.env[line.slice(0, index).trim()] ??= line.slice(index + 1).trim().replace(/^["']|["']$/g, ''); }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(`update social_publications set next_attempt_at=now() where id='c0cfb3b4-b78d-444d-a2da-9754ea389867' and status='retry'`); await pool.end();
