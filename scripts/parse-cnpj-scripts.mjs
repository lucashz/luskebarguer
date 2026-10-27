import { readFileSync } from 'node:fs';

const html = readFileSync('C:/Users/Lucas/.gemini/antigravity/brain/ad61af50-53fb-45c7-918f-9bf38dac4b97/.system_generated/steps/4279/content.md', 'utf8');

// Find all script tags
const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let i = 0;
while ((match = scriptRe.exec(html)) !== null) {
  i++;
  const src = match[0].match(/src=["']([^"']+)["']/i)?.[1];
  if (src) {
    console.log(`Script ${i} (external):`, src);
  } else {
    console.log(`Script ${i} (inline, length ${match[1].length}):`, match[1].slice(0, 150));
    if (match[1].includes('decrypt') || match[1].includes('reveal') || match[1].includes('telefone') || match[1].includes('SubtleCrypto')) {
      console.log('--- FOUND IN SCRIPT ' + i + ' ---');
      console.log(match[1]);
    }
  }
}
