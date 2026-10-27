import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState,
  sendEvolutionV2SalesText,
  sendEvolutionV2SalesMedia,
  evolutionV2Request
} from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function checkWhatsApp(phone, config) {
  try {
    const data = await evolutionV2Request(`/chat/whatsappNumbers/${encodeURIComponent(config.instance)}`, {
      method: 'POST',
      body: JSON.stringify({ numbers: [phone] })
    }, config);
    const row = Array.isArray(data) ? data[0] : data?.numbers?.[0] || data;
    return row;
  } catch (err) {
    console.warn(`[whatsapp-check] Erro ao verificar ${phone}:`, err.message);
    return null;
  }
}

async function main() {
  console.log('=== TESTE DE DISPARO VIP REFÚGIO GOURMET PARA O NÚMERO DO LUCAS ===\n');

  const config = {
    ...evolutionV2SalesConfig(),
    timeoutMs: 60000
  };

  console.log(`Verificando conexão com Evolution API (${config.baseUrl}, instância: ${config.instance})...`);
  const conn = await getEvolutionV2ConnectionState(config);
  console.log('Status da instância:', conn);
  if (!conn.connected) {
    throw new Error(`Evolution API desconectada (estado: ${conn.state})`);
  }

  // Lucas Bulow: DDD 55 + 93619-1201
  const targetPhone = '5555936191201';
  console.log(`\nVerificando se número ${targetPhone} existe no WhatsApp...`);
  const check = await checkWhatsApp(targetPhone, config);
  console.log('Resultado da verificação:', check);

  // 1. Mensagem de introdução
  const introText = [
    'Olá, falo com a Claudia do Refúgio Gourmet? Tudo bem?',
    'Aqui é o Lucas, da TáPronto. Estive acompanhando o trabalho de vocês — tanto o buffet no almoço e as pizzas artesanais, quanto o espaço do Refúgio do Café.',
    'Fizemos essa demonstração com muito carinho para mostrar como ficaria a experiência dos clientes pedindo direto pelo cardápio online:'
  ].join('\n\n');

  console.log(`\n1/4 Enviando mensagem introdutória para ${targetPhone}...`);
  const introResult = await sendEvolutionV2SalesText({ phone: targetPhone, text: introText }, config);
  console.log(`✅ Mensagem introdutória enviada! ID: ${introResult.id}`);

  console.log('Aguardando 2 segundos...');
  await new Promise(r => setTimeout(r, 2000));

  // 2. Imagem Desktop
  const localDesktop = resolve('artifacts/outreach/vip/refugio-gourmet/menu-preview.png');
  const prodDesktop = '/var/www/artifacts/outreach/vip/refugio-gourmet/menu-preview.png';
  const desktopPath = existsSync(localDesktop) ? localDesktop : prodDesktop;
  console.log(`\n2/4 Enviando prévia desktop (${desktopPath})...`);
  const desktopBuffer = await readFile(desktopPath);
  const desktopCaption = 'Visualização do cardápio digital no computador.';
  const desktopResult = await sendEvolutionV2SalesMedia({
    phone: targetPhone,
    mediaBase64: desktopBuffer.toString('base64'),
    mimeType: 'image/png',
    caption: desktopCaption
  }, config);
  console.log(`✅ Prévia desktop enviada! ID: ${desktopResult.id}`);

  console.log('Aguardando 2 segundos...');
  await new Promise(r => setTimeout(r, 2000));

  // 3. Imagem Mobile Mockup
  const localMobile = resolve('artifacts/outreach/vip/refugio-gourmet/menu-preview-mobile.png');
  const prodMobile = '/var/www/artifacts/outreach/vip/refugio-gourmet/menu-preview-mobile.png';
  const mobilePath = existsSync(localMobile) ? localMobile : prodMobile;
  console.log(`\n3/4 Enviando prévia mobile mockup (${mobilePath})...`);
  const mobileBuffer = await readFile(mobilePath);
  const mobileCaption = 'Visualização rápida no celular para pedidos online.';
  const mobileResult = await sendEvolutionV2SalesMedia({
    phone: targetPhone,
    mediaBase64: mobileBuffer.toString('base64'),
    mimeType: 'image/png',
    caption: mobileCaption
  }, config);
  console.log(`✅ Prévia mobile enviada! ID: ${mobileResult.id}`);

  console.log('Aguardando 2 segundos...');
  await new Promise(r => setTimeout(r, 2000));

  // 4. Mensagem com o link do cardápio digital e chamada
  const linkText = [
    'Você pode verificar você mesma como ficaria a experiência do seu cardápio digital:',
    '👉 https://taprontomenu.com.br/refugio-gourmet',
    'Se você gostar, nossa equipe pode cadastrar o cardápio oficial completo de vocês sem custo nenhum para fazerem um teste com os clientes.',
    'Fico à disposição por aqui se quiser dar uma olhada!'
  ].join('\n\n');

  console.log(`\n4/4 Enviando mensagem com o link para ${targetPhone}...`);
  const linkResult = await sendEvolutionV2SalesText({ phone: targetPhone, text: linkText }, config);
  console.log(`✅ Mensagem com link enviada! ID: ${linkResult.id}`);

  console.log('\n========================================');
  console.log('🎉 TESTE VIP ENVIADO COM SUCESSO PARA O SEU WHATSAPP!');
  console.log(`Número de destino: ${targetPhone}`);
  console.log(`IDs das mensagens:`);
  console.log(`- Intro:   ${introResult.id}`);
  console.log(`- Desktop: ${desktopResult.id}`);
  console.log(`- Mobile:  ${mobileResult.id}`);
  console.log(`- Link:    ${linkResult.id}`);
  console.log('========================================\n');

  await pool.end();
}

main().catch(err => {
  console.error('\n❌ ERRO NO TESTE DE DISPARO:', err);
  process.exit(1);
});
