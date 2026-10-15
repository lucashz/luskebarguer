import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const TEMPLATE_URL = new URL('../templates/outreach-menu-preview.html', import.meta.url);

export async function buildOutreachPreview({ lead = {}, photos = [], outputDir, chromePath, capture = captureWithChrome } = {}) {
  const businessName = clean(lead.business_name || lead.businessName || lead.name);
  if (!businessName) throw new Error('Nome do estabelecimento é obrigatório para a prévia.');
  if (!outputDir) throw new Error('Diretório de saída é obrigatório para a prévia.');
  if (!Array.isArray(photos)) throw new Error('As fotos da prévia devem ser uma lista.');

  const directory = resolve(String(outputDir));
  await mkdir(directory, { recursive: true });
  const products = resolveOutreachProducts(lead, photos);
  const sourceBuffers = [];
  for (const [index, photo] of photos.slice(0, 2).entries()) {
    try {
      const bytes = await photoBytes(photo);
      const metadata = await sharp(bytes).metadata();
      if (!metadata.width || !metadata.height || !metadata.format) throw new Error('metadados ausentes');
      sourceBuffers.push(bytes);
    } catch (error) {
      throw new Error(`Foto ${index + 1} inválida para a prévia: ${clean(error.message)}`);
    }
  }

  const visualSource = sourceBuffers.length ? 'business_photos' : 'segment_inferred';
  const productImagePaths = [];
  for (let index = 0; index < 4; index += 1) {
    const destination = join(directory, `product-${index + 1}.jpg`);
    const source = sourceBuffers.length
      ? sharp(sourceBuffers[index % sourceBuffers.length])
      : sharp(Buffer.from(segmentIllustration(products[index], lead)));
    await source
      .rotate()
      .resize(800, 480, { fit: 'cover', position: index % 2 ? 'centre' : 'attention', withoutEnlargement: false })
      .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
      .toFile(destination);
    productImagePaths.push(destination);
  }

  const template = await readFile(TEMPLATE_URL, 'utf8');
  const categories = [...new Set(products.map((product) => product.category))];
  const html = template
    .replaceAll('{{BUSINESS_NAME}}', escapeHtml(businessName))
    .replaceAll('{{LOCATION}}', escapeHtml([clean(lead.city), clean(lead.state)].filter(Boolean).join('/') || 'Estabelecimento local'))
    .replaceAll('{{INITIAL}}', escapeHtml(businessName.slice(0, 1).toUpperCase()))
    .replace('{{CATEGORIES}}', categories.map((category, index) => `<button class="category${index === 0 ? ' active' : ''}" type="button">${escapeHtml(category)}</button>`).join(''))
    .replace('{{PRODUCT_CARDS}}', products.map((product, index) => `
      <article class="product-card">
        <img src="${escapeAttribute(basename(productImagePaths[index]))}" alt="${escapeAttribute(product.name)}">
        <div class="product-copy">
          <h3>${escapeHtml(product.name)}</h3>
          <p>${escapeHtml(product.description)}</p>
          <div><span>Consulte disponibilidade</span><b aria-hidden="true">+</b></div>
        </div>
      </article>
    `).join(''));

  const htmlPath = join(directory, 'menu-preview.html');
  const desktopPath = join(directory, 'menu-preview.png');
  const mobilePath = join(directory, 'menu-preview-mobile.png');
  await writeFile(htmlPath, html, 'utf8');
  await capture({ htmlPath, outputPath: desktopPath, view: 'desktop', chromePath });
  await capture({ htmlPath, outputPath: mobilePath, view: 'mobile', chromePath });
  await assertPreviewImage(desktopPath, 'computador');
  await assertPreviewImage(mobilePath, 'celular');

  return { desktopPath, mobilePath, htmlPath, productImagePaths, products, visualSource };
}

export function resolveOutreachProducts(lead = {}, photos = []) {
  const segment = clean(lead.segment || 'Estabelecimento');
  const supplied = Array.isArray(lead.products) ? lead.products : [];
  const products = supplied.slice(0, 4).map((product, index) => ({
    name: clean(product.name) || `Opção ${index + 1}`,
    category: clean(product.category) || segment,
    description: clean(product.description) || 'Opção apresentada na prévia demonstrativa.',
    photoIndex: Number.isInteger(product.photoIndex) ? product.photoIndex : index % Math.max(1, photos.length)
  }));
  const genericNames = ['Destaque da casa', 'Opção da vitrine', `Especialidade da ${segment.toLocaleLowerCase('pt-BR')}`, 'Outra opção da casa'];
  while (products.length < 4) {
    const index = products.length;
    products.push({
      name: genericNames[index],
      category: segment,
      description: 'Sugestão visual compatível com o segmento, sem preço informado.',
      photoIndex: index % Math.max(1, photos.length)
    });
  }
  return products;
}

export async function captureWithChrome({ htmlPath, outputPath, view, chromePath }) {
  const executable = chromePath || findChrome();
  if (!executable) throw new Error('Chrome ou Edge não encontrado para gerar a prévia.');
  const url = `${pathToFileURL(htmlPath).href}?view=${encodeURIComponent(view)}`;
  const profile = join(resolve(outputPath, '..'), `.chrome-${view}`);
  await mkdir(profile, { recursive: true });
  await new Promise((resolvePromise, reject) => {
    const child = spawn(executable, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
      '--force-device-scale-factor=1',
      '--window-size=1080,1350',
      `--user-data-dir=${profile}`,
      `--screenshot=${outputPath}`,
      url
    ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let errors = '';
    child.stderr.on('data', (chunk) => { errors += chunk.toString(); });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`Chrome encerrou com código ${code}: ${errors.slice(-500)}`)));
  });
}

async function photoBytes(photo) {
  if (Buffer.isBuffer(photo?.bytes)) return photo.bytes;
  if (photo?.bytes instanceof Uint8Array) return Buffer.from(photo.bytes);
  if (photo?.path) return readFile(photo.path);
  throw new Error('arquivo ausente');
}

async function assertPreviewImage(path, label) {
  const metadata = await sharp(path).metadata();
  if (metadata.width !== 1080 || metadata.height !== 1350) {
    throw new Error(`Imagem de ${label} inválida: esperado 1080x1350.`);
  }
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  return candidates.find(existsSync) || '';
}

function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function segmentIllustration(product, lead) {
  const segment = clean(lead.segment || 'estabelecimento');
  const name = clean(product?.name || 'Opção demonstrativa');
  const accent = { padaria: '#c96f22', pizzaria: '#a92d2d', hamburgueria: '#7c482d', marmitaria: '#2f7d53', cafeteria: '#68452c', acaiteria: '#6f347c', bar: '#305f9b' }[segment.toLocaleLowerCase('pt-BR')] || '#d82832';
  return `<svg width="800" height="480" viewBox="0 0 800 480" xmlns="http://www.w3.org/2000/svg">
    <rect width="800" height="480" fill="#fff8f5"/>
    <rect x="32" y="32" width="736" height="416" rx="28" fill="${accent}"/>
    <circle cx="112" cy="112" r="48" fill="#ffffff" fill-opacity=".2"/>
    <path d="M94 112h36M112 94v36" stroke="#fff" stroke-width="8" stroke-linecap="round"/>
    <text x="80" y="210" fill="#fff" font-family="Arial, sans-serif" font-size="30" font-weight="700">PRÉVIA DEMONSTRATIVA</text>
    <text x="80" y="275" fill="#fff" font-family="Arial, sans-serif" font-size="42" font-weight="700">${escapeXml(name)}</text>
    <text x="80" y="334" fill="#fff" font-family="Arial, sans-serif" font-size="26">Imagem ilustrativa para ${escapeXml(segment)}</text>
  </svg>`;
}
function escapeXml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]); }
function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, '&#096;'); }
