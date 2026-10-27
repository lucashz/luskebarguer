import { readFileSync, writeFileSync } from 'node:fs';

const filePath = 'src/lib/outreach-delivery.js';
let content = readFileSync(filePath, 'utf8');

// Replace CAPTIONS
content = content.replace(
  /const CAPTIONS = Object\.freeze\(\{[\s\S]*?\}\);/,
  `const CAPTIONS = Object.freeze({\n  desktop: 'Assim ficaria o cardápio de vocês no computador.',\n  mobile: 'E esta é a visualização rápida no celular, direto para o cliente fazer pedidos pelo WhatsApp.'\n});`
);

// Replace sendPreview caption
content = content.replace(
  /const caption = kind === 'desktop'[\s\S]*?: `E esta é a visualização rápida no celular, direto para o cliente fazer pedidos pelo WhatsApp\. Cardápio completo: \$\{menuUrl\}`;/,
  `const caption = kind === 'desktop'\n    ? 'Assim ficaria o cardápio de vocês no computador.'\n    : 'E esta é a visualização rápida no celular, direto para o cliente fazer pedidos pelo WhatsApp.';`
);

writeFileSync(filePath, content, 'utf8');
console.log('src/lib/outreach-delivery.js updated successfully!');

