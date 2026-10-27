import { createGoogleBrowserOutreachClient } from '../src/lib/google-browser-outreach-client.js';

async function main() {
  const browserClient = createGoogleBrowserOutreachClient({
    chromePath: '/usr/bin/chromium',
    timeoutMs: 30000
  });

  console.log('Buscando Refúgio Gourmet Horizontina no Google Maps...');
  const places = await browserClient.searchPlaces({
    query: 'Refúgio Gourmet Horizontina RS'
  });

  console.log('Lugares encontrados:', places.length);
  for (const p of places) {
    console.log('Place:', p.displayName.text, p.id);
    try {
      const details = await browserClient.getPlaceDetails({ placeId: p.id });
      console.log('Details:', JSON.stringify(details, null, 2));
    } catch (e) {
      console.error('Erro nos detalhes:', e.message);
    }
  }
}

main().catch(console.error);
