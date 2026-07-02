import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/x-icon']);
const extensionByMime = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/x-icon', '.ico']
]);

export class LocalStorageProvider {
  constructor(options = {}) {
    this.baseDir = path.resolve(options.baseDir || process.env.UPLOAD_DIR || 'uploads');
    this.publicPrefix = options.publicPrefix || '/uploads';
  }

  async upload({ buffer, mimeType, tenantId, folder = 'files' }) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error('Arquivo ausente.');
    }

    if (!allowedMimeTypes.has(mimeType)) {
      throw new Error('Tipo de arquivo nao permitido.');
    }

    if (buffer.length > 5 * 1024 * 1024) {
      throw new Error('Arquivo maior que 5 MB.');
    }

    const safeTenant = sanitizePathSegment(tenantId || 'public');
    const safeFolder = sanitizePathSegment(folder);
    const fileName = `${randomUUID()}${extensionByMime.get(mimeType) || '.bin'}`;
    const relativePath = path.join(safeTenant, safeFolder, fileName);
    const fullPath = path.join(this.baseDir, relativePath);

    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer, { flag: 'wx' });

    return {
      path: relativePath.replaceAll(path.sep, '/'),
      url: `${this.publicPrefix}/${relativePath.replaceAll(path.sep, '/')}`
    };
  }

  async delete(relativePath) {
    if (!relativePath) return;
    const fullPath = path.resolve(this.baseDir, relativePath);
    if (!fullPath.startsWith(this.baseDir)) return;
    await unlink(fullPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
}

function sanitizePathSegment(value) {
  return String(value || 'files').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'files';
}

