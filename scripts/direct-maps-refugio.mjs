import { renderGoogleMapsWithChrome, parseGoogleMapsPlacePage, parseGoogleMapsSearchPage } from '../src/lib/google-browser-outreach-client.js';

async function main() {
  console.log('Buscando Refúgio Gourmet Horizontina no Google Maps via Chromium...');
  const html = await renderGoogleMapsWithChrome('Refúgio Gourmet Horizontina RS', {
    chromePath: '/usr/bin/chromium',
    timeoutMs: 30000
  });

  console.log('HTML recebido:', html.length, 'bytes');

  const place = parseGoogleMapsPlacePage(html);
  console.log('Place page:', {
    name: place.name,
    phone: place.phone,
    images: place.images.length,
    blocked: place.blocked
  });

  const search = parseGoogleMapsSearchPage(html);
  console.log('Search results:', search.results.length);
  for (const r of search.results) {
    console.log(r);
  }
}

main().catch(console.error);
