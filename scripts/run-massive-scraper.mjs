import { execSync } from 'node:child_process';
import { ingestScrapedLeads } from './ingest-scraper-leads.mjs';

async function main() {
  console.log('Iniciando scraper com batch_queries.txt...');
  
  // Limpar resultados antigos no VM
  execSync(`ssh root@192.168.1.108 "rm -f /root/scraper_data/batch_results.json"`);

  // Executar scraper no container Docker na VM
  console.log('Executando scraper no container Docker...');
  const runCmd = `docker run --rm -v /root/scraper_data:/data gosom/google-maps-scraper:latest -input /data/batch_queries.txt -results /data/batch_results.json -json -depth 2 -c 2`;
  execSync(`ssh root@192.168.1.108 "${runCmd}"`, { stdio: 'inherit' });

  // Copiar resultados de volta
  console.log('Copiando resultados para o ambiente local...');
  execSync(`scp root@192.168.1.108:/root/scraper_data/batch_results.json tools/batch_results.json`);

  // Ingestão com filtros de ouro do ICP
  console.log('Ingestão no PostgreSQL...');
  await ingestScrapedLeads('tools/batch_results.json', 'Interior SP', 'SP', 'marmitaria');

  console.log('Finalizado com sucesso!');
}

main().catch(console.error);
