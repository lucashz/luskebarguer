import pg from 'pg';
import { provisionStudioAdministrator } from '../src/lib/marketing-studio-accounts.js';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL.replace(/\/[^/?]+(\?|$)/, '/clinica_estetica$1'), max: 1 });
try {
  const result = await provisionStudioAdministrator(pool, 'thaina', 'lucas', 'Lucas');
  console.log(JSON.stringify({ username: result.username, activationURL: `https://thaina.taprontomenu.com.br/marketing/#activate=${result.activationToken}`, expiresInHours: 48 }));
} finally { await pool.end(); }
