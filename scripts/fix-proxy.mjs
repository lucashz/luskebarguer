import { execSync } from 'child_process';
const sql = 'UPDATE "Proxy" SET enabled = true, host = \'192.168.1.103\', port = \'10800\', protocol = \'socks5\'; SELECT id, enabled, host, port, protocol FROM "Proxy";';
const out = execSync('ssh root@192.168.1.108 "docker exec -i evolution_postgres psql -U evolution -d evolution"', { input: sql, encoding: 'utf8' });
console.log(out);
