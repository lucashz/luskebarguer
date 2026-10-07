import { readFileSync, writeFileSync } from 'node:fs';

const cssFile = 'public/home.css';
const htmlFile = 'public/home.html';
const sourceCss = readFileSync('/tmp/home-local.css', 'utf8');
const sourceStart = sourceCss.indexOf('.whatsapp-float {');
const sourceEnd = sourceCss.indexOf('\n* {', sourceStart);
if (sourceStart < 0 || sourceEnd < 0) throw new Error('Bloco local do WhatsApp não encontrado.');
const improvedBlock = sourceCss.slice(sourceStart, sourceEnd);

const currentCss = readFileSync(cssFile, 'utf8');
const currentStart = currentCss.indexOf('.whatsapp-float {');
const currentEnd = currentCss.indexOf('\n* {', currentStart);
if (currentStart < 0 || currentEnd < 0) throw new Error('Bloco de produção do WhatsApp não encontrado.');
writeFileSync(cssFile, `${currentCss.slice(0, currentStart)}${improvedBlock}${currentCss.slice(currentEnd)}`);

const html = readFileSync(htmlFile, 'utf8');
writeFileSync(htmlFile, html.replace(/\/home\.css\?v=[^"']+/, '/home.css?v=20260921-whatsapp-official'));

const deployedCss = readFileSync(cssFile, 'utf8');
if (!/\.whatsapp-float-icon\s*\{[^}]*background:\s*#25d366;[^}]*color:\s*#fff;/s.test(deployedCss)) throw new Error('Identidade oficial do ícone não foi aplicada.');
if (!/@media\s*\(max-width:\s*640px\)[\s\S]*?\.whatsapp-float\s*\{[^}]*width:\s*52px;[^}]*height:\s*52px;/s.test(deployedCss)) throw new Error('Alvo de toque móvel não foi aplicado.');
