import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

loadEnv(new URL('../.env', import.meta.url));

const port = 4300 + Math.floor(Math.random() * 400);
const baseUrl = String(process.env.DELIVERY_SMOKE_BASE_URL || `http://127.0.0.1:${port}`).replace(/\/$/, '');
const externalBaseUrl = Boolean(process.env.DELIVERY_SMOKE_BASE_URL);
let child;
let browser;
let browserProfile;

try {
  if (!externalBaseUrl) child = await startServer();

  const response = await fetch(`${baseUrl}/delivery?utm_source=instagram&utm_medium=paid_social&utm_campaign=noroeste_gaucho_delivery`, {
    headers: { Host: 'taprontomenu.com.br', 'X-Forwarded-Host': 'taprontomenu.com.br' }
  });
  const html = await response.text();

  assert(response.status === 200, 'A landing /delivery precisa responder 200.');
  assert(html.includes('Você responde. A gente deixa tudo pronto.'), 'O H1 precisa prometer que a equipe fará a montagem.');
  assert(html.includes('até 5 categorias') && html.includes('20 produtos'), 'A oferta precisa informar os limites do cadastro assistido.');
  assert(/<span class="offer-icon" aria-hidden="true"><\/span>/.test(html), 'O círculo verde da oferta precisa ficar vazio.');
  assert((html.match(/Quero ajuda para montar meu cardápio/g) || []).length >= 3, 'O novo CTA assistido precisa aparecer no hero, no fechamento e no celular.');
  assert(html.includes('Atendimento pelo WhatsApp · sem cartão · 7 dias grátis depois de criar sua senha'), 'A landing precisa explicar quando o teste começa.');
  assert(/class="mobile-signup-bar"[^>]*>[\s\S]*data-delivery-whatsapp/.test(html), 'A landing precisa ter CTA assistido fixo no celular.');
  assert(/class="delivery-whatsapp-float"[^>]*data-delivery-whatsapp/.test(html), 'A landing precisa ter botão flutuante do WhatsApp rastreável.');
  assert((html.match(/data-delivery-gallery-item/g) || []).length === 5, 'O carrossel precisa apresentar as cinco telas reais.');
  assert((html.match(/data-proof-carousel/g) || []).length === 1, 'A landing deve ter um único carrossel.');
  assert(/class="hero-visual"[\s\S]*data-proof-carousel[\s\S]*<\/section>/.test(html), 'O carrossel precisa ocupar o destaque visual do topo.');
  assert(!html.includes('class="phone-shell"'), 'O mockup inclinado antigo precisa ser removido do topo.');
  for (const label of ['Cardápio', 'Pedidos', 'Produtos', 'Operação', 'Configuração']) assert(html.includes(`data-carousel-label="${label}"`), `Controle ausente: ${label}`);
  assert(html.includes('data-delivery-image-modal') && html.includes('role="dialog"'), 'A landing precisa oferecer modal acessível para ampliar as capturas.');
  assert(html.includes('/delivery.css') && html.includes('/delivery.js'), 'A landing precisa carregar seus assets dedicados.');

  const scriptResponse = await fetch(`${baseUrl}/delivery.js`, { headers: { Host: 'taprontomenu.com.br' } });
  assert(scriptResponse.status === 200, 'O JavaScript da landing precisa estar disponível.');
  const script = await scriptResponse.text();
  assert(script.includes('trackWhatsappClick') && script.includes("'whatsapp_click'"), 'O clique no WhatsApp precisa ser rastreado antes da navegação.');
  assert(script.includes('keepalive: true'), 'O tracking precisa sobreviver à navegação para o WhatsApp.');
  assert(script.includes('setupProofCarousel') && script.includes('5000'), 'O carrossel precisa alternar automaticamente a cada 5 segundos.');
  const deliveryCss = await (await fetch(`${baseUrl}/delivery.css`, { headers: { Host: 'taprontomenu.com.br' } })).text();
  assert(/\.assisted-whatsapp-cta\s*\{[^}]*background:\s*#ef1823/s.test(deliveryCss), 'O CTA principal da landing precisa ser vermelho.');

  const layout = await layoutMetrics();
  for (const mobile of layout.mobile) {
    assert(mobile.scrollWidth <= mobile.innerWidth, `A landing mobile não pode ter rolagem horizontal em ${mobile.innerWidth}px (${mobile.scrollWidth}px).`);
    assert(mobile.stickyPosition === 'fixed' && mobile.stickyDisplay !== 'none', `O CTA mobile precisa permanecer fixo em ${mobile.innerWidth}px.`);
    assert(mobile.stickyHeight >= 52, `O CTA mobile precisa ter alvo de toque de pelo menos 52px em ${mobile.innerWidth}px (${mobile.stickyHeight}px).`);
    assert(mobile.galleryItemWidth >= mobile.innerWidth - 48, `As capturas precisam ocupar uma coluna legível em ${mobile.innerWidth}px (${mobile.galleryItemWidth}px).`);
    assert(mobile.whatsappPosition === 'fixed' && mobile.whatsappHeight >= 52, `O WhatsApp precisa ser um botão fixo tocável em ${mobile.innerWidth}px.`);
    assert(mobile.whatsappBottom <= mobile.stickyTop - 8, `O WhatsApp não pode cobrir o CTA de cadastro em ${mobile.innerWidth}px.`);
  }
  assert(layout.desktop.proofImageHeight <= 520, `As capturas do painel precisam de altura controlada (${JSON.stringify(layout.desktop)}).`);
  assert(layout.desktop.proofSectionHeight <= 800, `A seção de demonstração ficou alta demais (${layout.desktop.proofSectionHeight}px).`);
  assert(layout.desktop.objectFit === 'contain', `As capturas precisam aparecer inteiras nos cards (${layout.desktop.objectFit}).`);
  assert(layout.desktop.modalOpened === true, 'Clicar na captura precisa abrir o modal.');
  assert(layout.desktop.modalCounter === '1 de 5', `O modal precisa indicar a posição da captura (${layout.desktop.modalCounter}).`);
  assert(layout.desktop.whatsappPosition === 'fixed' && layout.desktop.whatsappRightGap <= 30 && layout.desktop.whatsappBottomGap <= 30, 'O WhatsApp precisa ficar no canto inferior direito no desktop.');

  console.log('Delivery landing smoke: OK');
} finally {
  if (browser && browser.exitCode === null) {
    browser.kill();
    await Promise.race([
      new Promise((resolve) => browser.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 1000))
    ]);
  }
  if (browserProfile) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try { rmSync(browserProfile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); } catch {}
  }
  if (child && child.exitCode === null) child.kill();
}

async function layoutMetrics() {
  const chrome = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
  ].find(existsSync);
  if (!chrome) throw new Error('Chrome ou Edge não encontrado para validar o layout mobile.');
  const debugPort = port + 1000;
  browserProfile = mkdtempSync(join(tmpdir(), 'tapronto-delivery-'));
  browser = spawn(chrome, [
    '--headless=new', '--disable-gpu', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${browserProfile}`, '--window-size=390,844',
    `${baseUrl}/delivery?utm_source=instagram&utm_medium=paid_social`
  ], { stdio: 'ignore' });

  let page;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      page = pages.find((entry) => entry.type === 'page' && entry.url.includes('/delivery'))
        || pages.find((entry) => entry.type === 'page');
      if (page?.webSocketDebuggerUrl) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!page?.webSocketDebuggerUrl) throw new Error('Chrome não abriu a landing para inspeção.');

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await cdpCall(socket, 100 + attempt, 'Runtime.evaluate', {
      expression: "document.readyState === 'complete' && Boolean(document.querySelector('.proof-images img'))",
      returnByValue: true
    });
    if (ready.result?.value === true) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (attempt === 39) throw new Error('A landing não terminou de carregar no navegador.');
  }
  const mobile = [];
  for (const [index, width] of [360, 390, 430].entries()) {
    await cdpCall(socket, 10 + index * 2, 'Emulation.setDeviceMetricsOverride', {
      width, height: 844, deviceScaleFactor: 1, mobile: true
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const result = await cdpCall(socket, 11 + index * 2, 'Runtime.evaluate', {
      expression: `(() => {
        const sticky = document.querySelector('.mobile-signup-bar');
        const item = document.querySelector('[data-delivery-gallery-item]');
        const style = sticky ? getComputedStyle(sticky) : null;
        const whatsapp = document.querySelector('.delivery-whatsapp-float');
        const whatsappStyle = whatsapp ? getComputedStyle(whatsapp) : null;
        const whatsappRect = whatsapp?.getBoundingClientRect();
        const stickyRect = sticky?.getBoundingClientRect();
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          stickyDisplay: style?.display || 'none',
          stickyPosition: style?.position || '',
          stickyHeight: sticky?.getBoundingClientRect().height || 0,
          galleryItemWidth: item?.getBoundingClientRect().width || 0,
          whatsappPosition: whatsappStyle?.position || '',
          whatsappHeight: whatsappRect?.height || 0,
          whatsappBottom: whatsappRect?.bottom || 0,
          stickyTop: stickyRect?.top || 0
        };
      })()`,
      returnByValue: true
    });
    mobile.push(result.result.value);
  }
  await cdpCall(socket, 3, 'Emulation.setDeviceMetricsOverride', {
    width: 1897, height: 910, deviceScaleFactor: 1, mobile: false
  });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const desktopResult = await cdpCall(socket, 4, 'Runtime.evaluate', {
    expression: `(() => {
      const images = [...document.querySelectorAll('.proof-images img')];
      const section = document.querySelector('.product-proof');
      const firstItem = document.querySelector('[data-delivery-gallery-item]');
      firstItem?.click();
      const modal = document.querySelector('[data-delivery-image-modal]');
      const whatsapp = document.querySelector('.delivery-whatsapp-float');
      const whatsappRect = whatsapp?.getBoundingClientRect();
      return {
        proofImageHeight: Math.max(...images.map((image) => image.getBoundingClientRect().height)),
        proofImageWidth: Math.max(...images.map((image) => image.getBoundingClientRect().width)),
        proofGridWidth: document.querySelector('.proof-images').getBoundingClientRect().width,
        computedWidth: getComputedStyle(images[0]).width,
        computedHeight: getComputedStyle(images[0]).height,
        proofSectionHeight: section.getBoundingClientRect().height,
        objectFit: getComputedStyle(images[0]).objectFit,
        modalOpened: modal ? !modal.hidden : false,
        modalCounter: modal?.querySelector('[data-delivery-image-counter]')?.textContent || '',
        whatsappPosition: whatsapp ? getComputedStyle(whatsapp).position : '',
        whatsappRightGap: whatsappRect ? window.innerWidth - whatsappRect.right : 999,
        whatsappBottomGap: whatsappRect ? window.innerHeight - whatsappRect.bottom : 999
      };
    })()`,
    returnByValue: true
  });
  await cdpCall(socket, 5, 'Browser.close');
  socket.close();
  return { mobile, desktop: desktopResult.result.value };
}

async function cdpCall(socket, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      clearTimeout(timeout);
      socket.removeEventListener('message', handler);
      resolve(message.result);
    };
    const timeout = setTimeout(() => {
      socket.removeEventListener('message', handler);
      reject(new Error('Chrome não respondeu à medição do layout.'));
    }, 5000);
    socket.addEventListener('message', handler);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function startServer() {
  const processChild = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      COOKIE_SECURE: 'false',
      ADMIN_2FA_REQUIRED: 'false',
      APP_URL: baseUrl,
      PUBLIC_APP_URL: 'https://taprontomenu.com.br',
      PANEL_APP_URL: 'https://app.taprontomenu.com.br',
      PANEL_HOSTS: 'app.taprontomenu.com.br',
      PLATFORM_HOSTS: 'central.taprontomenu.com.br'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  processChild.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  processChild.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (processChild.exitCode !== null) throw new Error(`Servidor encerrou durante o boot.\n${logs}`);
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return processChild;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  processChild.kill();
  throw new Error(`Servidor não respondeu.\n${logs}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadEnv(url) {
  if (!existsSync(url)) return;
  for (const line of readFileSync(url, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    process.env[key.trim()] ||= rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
}
