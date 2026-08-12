import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../public/admin.js', import.meta.url), 'utf8');
const required = [
  "MERCADOPAGO_API_BASE = 'https://api.mercadopago.com'",
  "provider: 'mercadopago'",
  '/v1/payments',
  '/checkout/preferences',
  'X-Idempotency-Key',
  'verifyMercadoPagoSignature',
  '/refunds'
];
for (const marker of required) {
  if (!server.includes(marker)) throw new Error(`Integração Mercado Pago incompleta: ${marker}`);
}
if (server.includes("provider: pix.enabled === false ? defaults.pix.provider : 'abacatepay'")) {
  throw new Error('Configuração ativa ainda força Abacate Pay.');
}
if (!admin.includes('provider: \'mercadopago\'')) throw new Error('Painel ainda não salva Mercado Pago.');
console.log('Fluxos essenciais do Mercado Pago validados.');
