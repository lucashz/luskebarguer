import { renderGoogleMapsWithChrome, parseGoogleMapsSearchPage } from '/app/src/lib/google-browser-outreach-client.js';

async function main() {
  console.log('Testando busca no Google Maps com timeout de 35s...');
  const start = Date.now();
  const html = await renderGoogleMapsWithChrome('hamburgueria em Horizontina RS', {
    chromePath: '/usr/bin/chromium',
    timeoutMs: 35000
  });
  const elapsed = Date.now() - start;
  console.log(`HTML obtido em ${elapsed}ms (${html.length} bytes)`);
  const parsed = parseGoogleMapsSearchPage(html);
  console.log(`Resultados encontrados: ${parsed.results.length}`);
  for (const r of parsed.results) {
    console.log(`- ${r.title} (${r.url.slice(0, 60)}...)`);
  }
}

main().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});

