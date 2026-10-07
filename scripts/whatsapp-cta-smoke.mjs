import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('../public/home.html', import.meta.url), 'utf8');
const delivery = readFileSync(new URL('../public/delivery.html', import.meta.url), 'utf8');
const homeHero = home.match(/<section class="home-hero[\s\S]*?<\/section>/)?.[0] || '';
const homeActions = homeHero.match(/<div class="home-actions">([\s\S]*?)<\/div>/)?.[1] || '';

assert(/<a class="home-button" href="\/cadastro">Criar meu Cardápio/.test(homeActions), 'O CTA principal da home deve iniciar o cadastro normal.');
assert(!/href="https:\/\/wa\.me\//i.test(home), 'A home não deve enviar o visitante diretamente para o WhatsApp.');
assert(!home.includes('class="whatsapp-float"'), 'A home não deve exibir um CTA flutuante para o WhatsApp.');
assert(homeHero.includes('Seu cardápio sempre') && homeHero.includes('seus pedidos sempre'), 'A home deve manter a apresentação de autoatendimento.');

assert(/href="https:\/\/wa\.me\//i.test(delivery), 'A landing page /delivery deve continuar direcionando seus CTAs ao WhatsApp.');
assert(delivery.includes('class="delivery-whatsapp-float"'), 'A landing page /delivery deve manter seu CTA flutuante de WhatsApp.');

console.log('Home signup e landing WhatsApp validados com sucesso.');
