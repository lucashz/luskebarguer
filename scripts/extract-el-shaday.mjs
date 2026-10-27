import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

async function main() {
  const buf = fs.readFileSync('tools/el_shaday_cardapio.pdf');
  const parser = new PDFParse({ data: buf });
  await parser.load();
  const res = await parser.getText();
  fs.writeFileSync('tools/el_shaday_extracted.json', JSON.stringify(res, null, 2));

  let txt = '';
  for (const page of res.pages) {
    txt += `\n================= PÁGINA ${page.num} =================\n`;
    txt += page.text + '\n';
  }
  fs.writeFileSync('tools/el_shaday_text.txt', txt, 'utf-8');
  console.log('Successfully saved to tools/el_shaday_text.txt and json!');
  console.log('Total pages:', res.pages.length);
  await parser.destroy();
}

main().catch(console.error);
