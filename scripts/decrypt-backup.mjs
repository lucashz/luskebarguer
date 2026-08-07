import { createDecipheriv, scryptSync } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const [input, output] = process.argv.slice(2);
const password = process.env.BACKUP_EMAIL_ENCRYPTION_KEY || '';
if (!input || !output || password.length < 24) throw new Error('Use BACKUP_EMAIL_ENCRYPTION_KEY=... node scripts/decrypt-backup.mjs entrada.enc saida.dump');
const data = await readFile(input);
const header = Buffer.from('TAPRONTO-BACKUP-V1\n', 'ascii');
if (!data.subarray(0, header.length).equals(header)) throw new Error('Formato de backup inválido.');
let offset = header.length;
const salt = data.subarray(offset, offset += 16);
const iv = data.subarray(offset, offset += 12);
const tag = data.subarray(offset, offset += 16);
const decipher = createDecipheriv('aes-256-gcm', scryptSync(password, salt, 32), iv);
decipher.setAuthTag(tag);
await writeFile(output, Buffer.concat([decipher.update(data.subarray(offset)), decipher.final()]), { flag: 'wx' });
console.log(`Backup descriptografado em ${output}`);
