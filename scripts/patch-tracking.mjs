import fs from 'node:fs';

const serverFile = '/var/www/server.js';
let content = fs.readFileSync(serverFile, 'utf8');

const target = "if (lid || searchParams.get('ref') === 'wa')";
const replacement = "if (lid || searchParams.get('ref') === 'wa' || storeSlug)";

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(serverFile, content, 'utf8');
  console.log('✅ server.js atualizado com rastreamento automático por slug!');
} else {
  console.log('ℹ️ target já estava atualizado ou não foi encontrado.');
}
