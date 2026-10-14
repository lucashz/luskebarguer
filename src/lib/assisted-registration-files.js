import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TYPES = new Map([
  ['image/jpeg', ['jpg', (b) => b[0] === 0xff && b[1] === 0xd8]],
  ['image/png', ['png', (b) => b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))]],
  ['image/webp', ['webp', (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP']],
  ['application/pdf', ['pdf', (b) => b.subarray(0, 5).toString() === '%PDF-']],
  ['text/plain', ['txt', () => true]],
  ['text/csv', ['csv', () => true]],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['xlsx', (b) => b[0] === 0x50 && b[1] === 0x4b]]
]);

export function validateAssistedFile(input = {}) {
  const buffer = Buffer.isBuffer(input.buffer) ? input.buffer : Buffer.from(input.buffer || '');
  const type = TYPES.get(String(input.mime_type || '').toLowerCase());
  const maxBytes = Number(input.max_bytes || process.env.ASSISTED_UPLOAD_MAX_BYTES || 12 * 1024 * 1024);
  if (!type || !buffer.length || buffer.length > maxBytes || !type[1](buffer)) throw invalid('Formato de arquivo inválido ou não permitido.');
  return { buffer, extension: type[0], mime_type: String(input.mime_type).toLowerCase(), size_bytes: buffer.length, checksum_sha256: createHash('sha256').update(buffer).digest('hex') };
}

export async function storeAssistedFile(input = {}) {
  const validated = validateAssistedFile(input);
  const directory = path.resolve(input.directory || process.env.ASSISTED_UPLOAD_DIR || path.join(process.cwd(), 'private-uploads', 'assisted'));
  await mkdir(directory, { recursive: true });
  const storage_key = `${randomUUID()}.${validated.extension}`;
  const absolute_path = path.join(directory, storage_key);
  await writeFile(absolute_path, validated.buffer, { flag: 'wx' });
  return { ...validated, storage_key, absolute_path, original_name: path.basename(String(input.name || 'arquivo')).slice(0, 180), safe_name: storage_key };
}

function invalid(message) { const error = new Error(message); error.status = 422; return error; }
