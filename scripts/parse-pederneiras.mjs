import { readFile } from 'fs/promises';

async function main() {
  const content = await readFile('d:/lsk/TáProntomenu.com.br/.worktrees/release-production-outreach-20261014/tools/pederneiras-marmitex.json', 'utf8');
  const lines = content.trim().split('\n').filter(Boolean);
  console.log(`Total de linhas/lugares: ${lines.length}`);
  for (const line of lines) {
    try {
      const p = JSON.parse(line);
      console.log(`- ${p.title} | Reviews: ${p.review_count} | Rating: ${p.review_rating} | Web: ${p.web_site || 'NENHUM'} | Phone: ${p.phone}`);
    } catch (e) {
      console.error('Erro na linha:', e.message);
    }
  }
}

main().catch(console.error);
