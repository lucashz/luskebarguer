import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/home.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/home.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/home.js', import.meta.url), 'utf8');
const visibleText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

assert(html.includes('class="whatsapp-float"'), 'CTA flutuante do WhatsApp não existe.');
assert(html.includes('aria-label="Falar com o TáPronto pelo WhatsApp"'), 'CTA do WhatsApp precisa de nome acessível.');
assert(/\.whatsapp-float-icon\s*\{[^}]*background:\s*#25d366;[^}]*color:\s*#fff;/s.test(css), 'O ícone precisa usar o verde oficial do WhatsApp com símbolo branco.');
assert(!/\.whatsapp-float-icon\s*\{[^}]*background:\s*#fff;/s.test(css), 'O ícone oficial do WhatsApp não deve usar disco branco.');
assert(/\.whatsapp-float-icon svg\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/s.test(css), 'O símbolo do WhatsApp precisa usar 24px sem distorção.');
assert(/@media\s*\(max-width:\s*640px\)[\s\S]*?\.whatsapp-float\s*\{[^}]*width:\s*52px;[^}]*height:\s*52px;/s.test(css), 'No celular, o botão do WhatsApp precisa ter alvo de toque de 52px.');
assert(visibleText.includes('Você responde. A gente deixa tudo pronto.'), 'A página inicial precisa apresentar a promessa assistida.');
assert(html.includes('Quero ajuda para montar meu cardápio'), 'A página inicial precisa usar um convite acolhedor para a montagem assistida.');
assert(html.includes('Atendimento pelo WhatsApp · sem cartão · 7 dias grátis depois de criar sua senha'), 'A página inicial precisa explicar o atendimento e o teste.');
assert(html.includes('Ol%C3%A1%21%20Quero%20ajuda%20para%20montar%20meu%20card%C3%A1pio%20digital.%20Como%20podemos%20come%C3%A7ar%3F'), 'O WhatsApp precisa abrir com a nova mensagem assistida pronta.');
assert(js.includes('trackWhatsappClick') && js.includes("'whatsapp_click'") && js.includes('keepalive: true'), 'A home precisa rastrear o clique no WhatsApp com keepalive.');
assert(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*animation:\s*none/s.test(css), 'A animação do CTA precisa ser removida para movimento reduzido.');
assert(/\.assisted-whatsapp-cta\s*\{[^}]*animation:\s*whatsapp-invite/s.test(css), 'O CTA principal precisa chamar atenção com uma animação suave.');

console.log('CTA flutuante do WhatsApp validado com sucesso.');
