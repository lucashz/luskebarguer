import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const query = '"Refugio Gourmet" Horizontina';
const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;

console.log('Buscando via Bing:', url);
const res = spawnSync(chrome, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  '--dump-dom',
  url
], { maxBuffer: 10 * 1024 * 1024 });

const html = res.stdout?.toString() || '';
console.log('HTML recebido:', html.length, 'bytes');

// Extrair telefones
const phones = [...html.matchAll(/(?:\+?55[\s.-]*)?(?:\(?\d{2}\)?[\s.-]*)?(?:9[\s.-]?\d{4}|\d{4})[\s.-]?\d{4}/g)]
  .map(m => m[0].replace(/\D/g, ''))
  .filter(p => p.length >= 10 && p.length <= 13);

console.log('Telefones encontrados:', [...new Set(phones)]);

// Snippets
const snippets = [...html.matchAll(/<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>(.*?)<\/p>/gi)].map(m => m[1].replace(/<[^>]+>/g, ' '));
console.log('Snippets:', snippets.slice(0, 10));
