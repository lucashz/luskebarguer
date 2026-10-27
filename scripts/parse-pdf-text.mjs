import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfPkg = require('pdf-parse');

async function main() {
  console.log('PDF Package:', pdfPkg);
  const fn = typeof pdfPkg === 'function' ? pdfPkg : pdfPkg.default || pdfPkg.PDFParser;
  console.log('Function type:', typeof fn);
  const dataBuffer = await readFile('tools/el_shaday_cardapio.pdf');
  const data = await fn(dataBuffer);
  console.log('Pages:', data.numpages);
  console.log('Text length:', data.text.length);
  await writeFile('tools/el_shaday_text.txt', data.text);
  console.log('Saved to tools/el_shaday_text.txt');
}

main().catch(console.error);
