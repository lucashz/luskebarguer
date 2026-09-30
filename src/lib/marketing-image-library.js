import { fail, normalizeUpload } from './marketing-studio.js';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const privateAddress = address => {
  if (!isIP(address)) return true;
  if (address.includes(':')) return address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:');
  const [a, b] = address.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};
async function safeRemoteUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw fail(422, 'Informe um link HTTPS válido para uma imagem.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw fail(422, 'Use um link HTTPS público e direto para a imagem.');
  const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some(item => privateAddress(item.address))) throw fail(422, 'Este endereço de imagem não é permitido.');
  return url;
}
export async function importImageUrl(value) {
  let url = await safeRemoteUrl(value);
  for (let redirects = 0; redirects < 4; redirects++) {
    const response = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'TaProntoMarketing/1.0', Accept: 'image/png,image/jpeg,image/webp' }, signal: AbortSignal.timeout(15000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location'); if (!location) throw fail(422, 'O link da imagem redirecionou para um endereço inválido.');
      url = await safeRemoteUrl(new URL(location, url).href); continue;
    }
    if (!response.ok) throw fail(422, 'Não foi possível baixar a imagem desse link.');
    const type = String(response.headers.get('content-type') || '').split(';')[0];
    const declared = Number(response.headers.get('content-length') || 0);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(type) || declared > 5 * 1024 * 1024) throw fail(422, 'O link deve apontar diretamente para uma imagem PNG, JPEG ou WebP de até 5 MB.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 5 * 1024 * 1024) throw fail(413, 'Imagem maior que 5 MB.');
    return { name: decodeURIComponent(url.pathname.split('/').pop() || 'Referência por link').slice(0, 100), bytes: await normalizeUpload(bytes.toString('base64')) };
  }
  throw fail(422, 'O link da imagem possui redirecionamentos demais.');
}
