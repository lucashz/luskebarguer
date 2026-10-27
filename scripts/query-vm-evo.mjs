import { execSync } from 'node:child_process';

const sql = `SELECT id, "key"->>'fromMe' as fromMe, "messageTimestamp", to_timestamp("messageTimestamp") as dt, LEFT("message"::text, 150) as msg 
FROM "Message" 
WHERE "key"::text LIKE '%555433581112%'
ORDER BY "messageTimestamp" ASC;`;

try {
  const out = execSync(`ssh root@192.168.1.108 "docker exec -i evolution_postgres psql -U evolution -d evolution"`, {
    input: sql,
    encoding: 'utf8'
  });
  console.log(out);
} catch (err) {
  console.error(err);
}

