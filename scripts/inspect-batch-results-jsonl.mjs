import fs from 'node:fs';
import readline from 'node:readline';

async function main() {
  const fileStream = fs.createReadStream('d:/lsk/TáProntomenu.com.br/.worktrees/release-production-outreach-20261014/tools/batch_results.json');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let count = 0;
  const categories = {};
  const cities = {};
  const sampleItems = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      count++;
      const cat = item.category || (item.categories || [])[0] || 'Desconhecido';
      categories[cat] = (categories[cat] || 0) + 1;
      const city = item.complete_address?.city || 'Desconhecida';
      cities[city] = (cities[city] || 0) + 1;
      if (sampleItems.length < 10) {
        sampleItems.push({
          title: item.title,
          category: cat,
          city: city,
          phone: item.phone,
          website: item.web_site || ''
        });
      }
    } catch {}
  }

  console.log(`Total de leads em batch_results.json: ${count}`);
  console.log("Top categorias:", Object.entries(categories).sort((a,b) => b[1]-a[1]).slice(0, 15));
  console.log("Cidades:", cities);
  console.log("Amostra:", sampleItems);
}

main().catch(console.error);
