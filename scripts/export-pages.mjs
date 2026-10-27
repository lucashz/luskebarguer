import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

async function main() {
  const buf = fs.readFileSync('tools/el_shaday_cardapio.pdf');
  const parser = new PDFParse({ data: buf });
  await parser.load();
  const screenshot = await parser.getScreenshot();
  for (let i = 0; i < screenshot.pages.length; i++) {
    const p = screenshot.pages[i];
    fs.writeFileSync(`tools/page_${i + 1}.png`, Buffer.from(p.data));
    console.log(`Saved tools/page_${i + 1}.png (Page ${p.pageNumber})`);
  }
  await parser.destroy();
}

main().catch(console.error);
