import fs from 'node:fs';

const files = fs.readdirSync('scripts').filter(f => f.endsWith('.mjs'));
const map = new Set();

for (const f of files) {
  const content = fs.readFileSync('scripts/' + f, 'utf8');
  const matches = content.match(/https:\/\/images\.unsplash\.com\/[^\s'"`]+/g);
  if (matches) {
    for (const m of matches) {
      map.add(m.split('?')[0]);
    }
  }
}

const list = Array.from(map);
console.log('Unique Unsplash base URLs found in scripts:', list.length);
fs.writeFileSync('tools/known_unsplash.json', JSON.stringify(list, null, 2));
