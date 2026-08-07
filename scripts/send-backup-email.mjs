import { createCipheriv, createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));

const sourcePath = resolve(process.argv[2] || '');
const encryptionKey = String(process.env.BACKUP_EMAIL_ENCRYPTION_KEY || '');
const recipient = String(process.env.BACKUP_EMAIL_TO || 'sup.tapronto@gmail.com').trim();
if (!sourcePath || !existsSync(sourcePath)) throw new Error('Arquivo de backup não encontrado.');
if (encryptionKey.length < 24) throw new Error('BACKUP_EMAIL_ENCRYPTION_KEY deve ter ao menos 24 caracteres.');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error('BACKUP_EMAIL_TO inválido.');

const source = readFileSync(sourcePath);
if (source.length > 18 * 1024 * 1024) throw new Error('Backup excede 18 MB e não pode ser enviado por e-mail.');
const encrypted = encryptBackup(source, encryptionKey);
const checksum = createHash('sha256').update(encrypted).digest('hex');
const encryptedName = `${basename(sourcePath)}.tapronto.enc`;
const settings = await smtpSettings();
const message = buildMessage(settings, recipient, encryptedName, encrypted, checksum);
await smtpSend(settings, message, recipient);
console.log(`Cópia criptografada enviada para ${recipient} (${encryptedName}).`);

function encryptBackup(data, password) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(password, salt, 32);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const header = Buffer.from('TAPRONTO-BACKUP-V1\n', 'ascii');
  return Buffer.concat([header, salt, iv, cipher.getAuthTag(), ciphertext]);
}

async function smtpSettings() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(`select * from platform_smtp_settings where is_active = true order by created_at desc limit 1`);
    const row = result.rows[0] || {};
    const settings = {
      host: row.host || process.env.SMTP_HOST || '',
      port: Number(row.port || process.env.SMTP_PORT || 587),
      username: row.username || process.env.SMTP_USER || '',
      password: row.password_token || process.env.SMTP_PASS || process.env.SMTP_TOKEN || '',
      fromEmail: row.from_email || process.env.SMTP_FROM_EMAIL || '',
      fromName: row.from_name || process.env.SMTP_FROM_NAME || 'TáPronto Backup',
      useTls: row.use_tls !== false
    };
    if (!settings.host || !settings.fromEmail) throw new Error('SMTP ativo não configurado.');
    return settings;
  } finally {
    await client.end().catch(() => {});
  }
}

function buildMessage(settings, to, fileName, attachment, checksum) {
  const boundary = `tapronto_backup_${randomUUID().replaceAll('-', '')}`;
  const subject = `Backup diário TáPronto - ${new Date().toISOString().slice(0, 10)}`;
  const body = [
    'Backup externo diário do TáPronto.',
    '',
    `Arquivo: ${fileName}`,
    `SHA-256 criptografado: ${checksum}`,
    '',
    'O anexo usa AES-256-GCM. A chave de restauração não é enviada por e-mail.'
  ].join('\r\n');
  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@taprontomenu.com.br>`,
    `From: ${mime(settings.fromName)} <${settings.fromEmail}>`,
    `To: ${to}`,
    `Subject: ${mime(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    'X-Mailer: TaPronto Backup'
  ];
  return `${headers.join('\r\n')}\r\n\r\n` +
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrapBase64(Buffer.from(body).toString('base64'))}\r\n` +
    `--${boundary}\r\nContent-Type: application/octet-stream; name="${fileName}"\r\nContent-Disposition: attachment; filename="${fileName}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrapBase64(attachment.toString('base64'))}\r\n` +
    `--${boundary}--\r\n`;
}

function smtpSend(settings, message, to) {
  const directTls = settings.port === 465;
  return new Promise((resolve, reject) => {
    let socket = directTls ? tls.connect({ host: settings.host, port: settings.port, servername: settings.host }) : net.connect({ host: settings.host, port: settings.port });
    let buffer = '';
    const timeout = setTimeout(() => finish(new Error('Timeout SMTP.')), 30000);
    let done = false;
    const finish = (error) => { if (done) return; done = true; clearTimeout(timeout); socket.destroy(); error ? reject(error) : resolve(); };
    const read = (allowed) => new Promise((res, rej) => {
      const onData = (chunk) => {
        buffer += chunk.toString('utf8');
        const last = buffer.split(/\r?\n/).filter(Boolean).at(-1) || '';
        if (!/^\d{3} /.test(last)) return;
        socket.off('data', onData); buffer = '';
        const code = Number(last.slice(0, 3));
        allowed.includes(code) ? res(last) : rej(new Error(`SMTP respondeu ${code}.`));
      };
      socket.on('data', onData); socket.once('error', rej);
    });
    const write = (line) => socket.write(`${line}\r\n`);
    const upgrade = () => new Promise((res, rej) => {
      const secure = tls.connect({ socket, servername: settings.host });
      secure.once('secureConnect', () => { socket = secure; buffer = ''; res(); });
      secure.once('error', rej);
    });
    socket.once('error', finish);
    socket.once(directTls ? 'secureConnect' : 'connect', async () => {
      try {
        await read([220]); write('EHLO taprontomenu.com.br'); await read([250]);
        if (settings.useTls && !directTls) { write('STARTTLS'); await read([220]); await upgrade(); write('EHLO taprontomenu.com.br'); await read([250]); }
        if (settings.username && settings.password) {
          write('AUTH LOGIN'); await read([334]); write(Buffer.from(settings.username).toString('base64')); await read([334]); write(Buffer.from(settings.password).toString('base64')); await read([235]);
        }
        write(`MAIL FROM:<${settings.fromEmail}>`); await read([250]);
        write(`RCPT TO:<${to}>`); await read([250, 251]);
        write('DATA'); await read([354]);
        socket.write(`${message.replace(/\r?\n\./g, '\r\n..')}\r\n.\r\n`); await read([250]);
        write('QUIT'); finish();
      } catch (error) { finish(error); }
    });
  });
}

function mime(value) { return `=?UTF-8?B?${Buffer.from(String(value)).toString('base64')}?=`; }
function wrapBase64(value) { return value.match(/.{1,76}/g)?.join('\r\n') || ''; }
function loadEnv(url) {
  if (!existsSync(url)) return;
  for (const line of readFileSync(url, 'utf8').split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith('#') || !text.includes('=')) continue;
    const [key, ...rest] = text.split('=');
    process.env[key.trim()] ||= rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
}
