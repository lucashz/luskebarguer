import assert from 'node:assert/strict';
import { createGoogleBrowserOutreachClient, createGoogleChromeArguments, parseGoogleSearchPage } from '../src/lib/google-browser-outreach-client.js';
import { createOutreachDiscoveryClient, outreachDiscoveryMode } from '../src/lib/outreach-discovery-client.js';

const searchHtml = `<!doctype html><html><body>
  <div><a href="https://www.instagram.com/padariabompaohz/"><h3>Padaria Bom Pão | Horizontina RS</h3></a><span>Instagram · padariabompaohz</span></div>
  <div><a href="https://www.facebook.com/confeitariacentral/"><h3>Confeitaria Central | Horizontina RS</h3></a><span>Facebook · Confeitaria Central</span></div>
</body></html>`;

const detailsHtml = `<!doctype html><html><body>
  <a href="https://www.instagram.com/padariabompaohz/"><h3>Padaria Bom Pão</h3></a>
  <p>Publicação de há 2 dias. WhatsApp (55) 9 9123-4567. Pães, cucas, salgados e tortas.</p>
  <img src="https://lh3.googleusercontent.com/business-photo-one=w800-h600">
  <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:business-photo-two">
</body></html>`;

const menuHtml = `<!doctype html><html><body>
  <a href="https://www.ifood.com.br/delivery/horizontina-rs/padaria-bom-pao"><h3>Cardápio Padaria Bom Pão</h3></a>
  <p>Escolha seus produtos e faça seu pedido online.</p>
</body></html>`;

const parsed = parseGoogleSearchPage(detailsHtml, { now: new Date('2026-10-15T12:00:00.000Z') });
assert.equal(parsed.blocked, false);
assert.equal(parsed.results[0].title, 'Padaria Bom Pão');
assert.equal(parsed.phones[0], '5555991234567');
assert.equal(parsed.latestActivityAt, '2026-10-13T12:00:00.000Z');
assert.deepEqual(parsed.images, [
  'https://lh3.googleusercontent.com/business-photo-one=w800-h600',
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:business-photo-two'
]);

const gotoHtml = '<html><body><a href="/goto?url=opaque-google-token"><h3>Padaria do Bairro | Horizontina RS</h3></a></body></html>';
const parsedGoto = parseGoogleSearchPage(gotoHtml);
assert.equal(parsedGoto.results[0].url, 'https://www.google.com/goto?url=opaque-google-token');

const queries = [];
const client = createGoogleBrowserOutreachClient({
  now: () => new Date('2026-10-15T12:00:00.000Z'),
  minIntervalMs: 0,
  maxQueries: 10,
  renderSearch: async (query) => {
    queries.push(query);
    if (/cardápio/i.test(query)) return menuHtml;
    if (/telefone/i.test(query)) return detailsHtml;
    return searchHtml;
  },
  fetch: async () => ({
    ok: true,
    headers: { get: () => 'image/jpeg' },
    arrayBuffer: async () => Uint8Array.from([255, 216, 255, 224, 1, 2, 3, 4]).buffer
  })
});

const places = await client.searchPlaces({ query: 'padaria em Horizontina RS', runId: 'run-1' });
assert.equal(places.length, 2);
assert.match(places[0].id, /^browser_/);
assert.equal(places[0].displayName.text, 'Padaria Bom Pão');

const details = await client.getPlaceDetails({ placeId: places[0].id, runId: 'run-1' });
assert.equal(details.nationalPhoneNumber, '5555991234567');
assert.equal(details.formattedAddress, 'Horizontina, RS, Brasil');
assert.equal(details.recentPostAt, '2026-10-13T12:00:00.000Z');
assert.equal(details.photos.length, 2);

const downloaded = await client.getPhoto({ photoName: details.photos[0].name, runId: 'run-1' });
const classification = await client.classifyFoodPhoto({ bytes: downloaded.bytes, runId: 'run-1' });
assert.equal(classification.isFood, true);
assert.deepEqual(classification.labels, ['google_business_product_photo']);

const menu = await client.searchMenu({ businessName: 'Padaria Bom Pão', city: 'Horizontina', state: 'RS' });
assert.equal(menu[0].url, 'https://www.ifood.com.br/delivery/horizontina-rs/padaria-bom-pao');
assert(queries.some((query) => /telefone whatsapp/i.test(query)));
assert(queries.some((query) => /cardápio menu pedidos online/i.test(query)));

assert.equal(outreachDiscoveryMode({ GOOGLE_OUTREACH_API_KEY: 'paid-key' }), 'api');
assert.equal(outreachDiscoveryMode({ GOOGLE_OUTREACH_API_KEY: '', GOOGLE_OUTREACH_BROWSER_ENABLED: 'true' }), 'browser');
assert.throws(() => outreachDiscoveryMode({ GOOGLE_OUTREACH_BROWSER_ENABLED: 'false' }), /Configure uma fonte de busca/i);
const selected = createOutreachDiscoveryClient({
  env: { GOOGLE_OUTREACH_BROWSER_ENABLED: 'true' },
  apiFactory: () => ({ provider: 'api' }),
  browserFactory: () => ({ provider: 'browser' }),
  apiOptions: {},
  browserOptions: {}
});
assert.equal(selected.provider, 'browser');

const redirectClient = createGoogleBrowserOutreachClient({
  minIntervalMs: 0,
  renderSearch: async () => gotoHtml,
  fetch: async (url) => ({
    status: 302,
    ok: false,
    headers: { get: (name) => name === 'location' ? 'https://www.instagram.com/padariadobairro/' : null }
  })
});
const redirectedPlaces = await redirectClient.searchPlaces({ query: 'padaria em Horizontina RS' });
assert.equal(redirectedPlaces[0].websiteUri, 'https://www.instagram.com/padariadobairro/');

const blocked = parseGoogleSearchPage('<html><body>Nossos sistemas detectaram tráfego incomum. /sorry/index CAPTCHA</body></html>');
assert.equal(blocked.blocked, true);

const chromeArguments = createGoogleChromeArguments({
  profile: '/tmp/google-profile',
  url: 'https://www.google.com/search?q=padaria',
  virtualTimeBudgetMs: 8000
});
assert(chromeArguments.includes('--virtual-time-budget=8000'));

const limited = createGoogleBrowserOutreachClient({ maxQueries: 1, minIntervalMs: 0, renderSearch: async () => searchHtml });
await limited.searchPlaces({ query: 'padaria em Horizontina RS' });
await assert.rejects(() => limited.searchPlaces({ query: 'pizzaria em Horizontina RS' }), /limite de consultas gratuitas/i);

console.log('Outreach Google browser smoke: OK');
