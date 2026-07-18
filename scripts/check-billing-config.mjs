import { existsSync, readFileSync } from 'node:fs';

loadEnv(new URL('../.env', import.meta.url));

const provider = String(process.env.PLATFORM_BILLING_PROVIDER || 'abacatepay').trim().toLowerCase();
const apiKey = process.env.PLATFORM_BILLING_API_KEY || process.env.ABACATEPAY_API_KEY || '';
const webhookSecret = process.env.PLATFORM_BILLING_WEBHOOK_SECRET || process.env.ABACATEPAY_WEBHOOK_SECRET || '';
const appUrl = process.env.PUBLIC_APP_URL || process.env.APP_URL || '';
const issues = [];

if (!['abacatepay', 'mock'].includes(provider)) {
  issues.push(`Provedor de billing não suportado: ${provider}`);
}

if (provider === 'abacatepay' && !apiKey) {
  issues.push('ABACATEPAY_API_KEY ou PLATFORM_BILLING_API_KEY não configurada.');
}

if (provider === 'abacatepay' && !webhookSecret) {
  issues.push('ABACATEPAY_WEBHOOK_SECRET ou PLATFORM_BILLING_WEBHOOK_SECRET não configurado. Recomendado para produção.');
}

if (!appUrl) {
  issues.push('APP_URL ou PUBLIC_APP_URL não configurada.');
} else if (provider === 'abacatepay' && !/^https:\/\//i.test(appUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(appUrl)) {
  issues.push('APP_URL/PUBLIC_APP_URL deve usar HTTPS em produção.');
}

console.log(`Provider: ${provider}`);
console.log(`API key: ${apiKey ? 'configurada' : 'ausente'}`);
console.log(`Webhook secret: ${webhookSecret ? 'configurado' : 'ausente'}`);
console.log(`URL pública: ${appUrl || 'ausente'}`);

if (issues.length) {
  console.log('\nPendências encontradas:');
  for (const issue of issues) console.log(`- ${issue}`);
  process.exit(1);
}

console.log('\nConfiguração de billing pronta para teste.');

function loadEnv(url) {
  if (!existsSync(url)) return;
  const content = readFileSync(url, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    process.env[key.trim()] ||= rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
}
