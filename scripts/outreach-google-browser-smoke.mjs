import assert from 'node:assert/strict';
import { createGoogleBrowserOutreachClient, createGoogleChromeArguments, parseGoogleMapsPlacePage, parseGoogleMapsSearchPage, parseGoogleSearchPage } from '../src/lib/google-browser-outreach-client.js';
import { createOutreachDiscoveryClient, outreachCandidateLimit, outreachDiscoveryMode } from '../src/lib/outreach-discovery-client.js';

const searchHtml = `<!doctype html><html><body>
  <div><a href="https://www.instagram.com/padariabompaohz/"><h3>Padaria Bom Pão | Horizontina RS</h3></a><span>Instagram · padariabompaohz</span></div>
  <div><a href="https://www.facebook.com/confeitariacentral/"><h3>Confeitaria Central | Horizontina RS</h3></a><span>Facebook · Confeitaria Central</span></div>
</body></html>`;

const detailsHtml = `<!doctype html><html><body>
  <a href="https://www.facebook.com/pizzariaestranha/"><h3>Pizzaria Estranha</h3></a>
  <p>Publicação de há 1 dia. WhatsApp (55) 9 9999-9999.</p>
  <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:unrelated-pizza">
  <a href="https://www.instagram.com/padariabompaohz/"><h3>Padaria Bom Pão</h3></a>
  <p>Publicação de há 2 dias. WhatsApp (55) 9 9123-4567. Pães, cucas, salgados e tortas.</p>
  <img src="https://encrypted-tbn1.gstatic.com/faviconV2?url=https://www.instagram.com&amp;type=FAVICON">
  <img src="https://lh3.googleusercontent.com/business-photo-one=w800-h600">
  <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:business-photo-two">
</body></html>`;

const menuHtml = `<!doctype html><html><body>
  <a href="https://www.ifood.com.br/delivery/horizontina-rs/padaria-bom-pao"><h3>Cardápio Padaria Bom Pão</h3></a>
  <p>Escolha seus produtos e faça seu pedido online.</p>
</body></html>`;

const mapsHtml = `<!doctype html><html><body>
  <h1 class="DUwDvf lfPIob">Padaria Bom Pão</h1>
  <button aria-label="Telefone: (55) 9 9123-4567" data-item-id="phone:tel:055991234567"></button>
  <span class="rsqaWe">há 2 dias</span>
  <button aria-label="Foto de Padaria Bom Pão"><img src="https://lh3.googleusercontent.com/grass-cs/business-map-photo-one=w408-h725-k-no"></button>
  <img src="https://lh3.googleusercontent.com/grass-cs/business-map-photo-two=w140-h186-k-no">
  <button aria-label="Foto de Avaliador"><img src="https://lh3.googleusercontent.com/a/reviewer-avatar=w36-h36"></button>
</body></html>`;

const mapsSearchHtml = `<!doctype html><html><body>
  <a class="hfpxzc" aria-label="Padaria Bom Pão" href="https://www.google.com/maps/place/Padaria+Bom+Pao/data=!4m7!3m6!1splace-one"></a>
  <a class="hfpxzc" aria-label="Confeitaria Central" href="https://www.google.com/maps/place/Confeitaria+Central/data=!4m7!3m6!1splace-two"></a>
</body></html>`;

assert.deepEqual(parseGoogleMapsSearchPage(mapsSearchHtml).results.map((result) => result.title), ['Padaria Bom Pão', 'Confeitaria Central']);

const parsedMaps = parseGoogleMapsPlacePage(mapsHtml, { now: new Date('2026-10-15T12:00:00.000Z') });
assert.equal(parsedMaps.name, 'Padaria Bom Pão');
assert.equal(parsedMaps.phone, '5555991234567');
assert.equal(parsedMaps.latestActivityAt, '2026-10-13T12:00:00.000Z');
assert.deepEqual(parsedMaps.images, [
  'https://lh3.googleusercontent.com/grass-cs/business-map-photo-one=w408-h725-k-no',
  'https://lh3.googleusercontent.com/grass-cs/business-map-photo-two=w140-h186-k-no'
]);

const parsed = parseGoogleSearchPage(detailsHtml, { now: new Date('2026-10-15T12:00:00.000Z') });
assert.equal(parsed.blocked, false);
assert.equal(parsed.results[1].title, 'Padaria Bom Pão');
assert.equal(parsed.results[1].phones[0], '5555991234567');
assert.equal(parsed.results[1].latestActivityAt, '2026-10-13T12:00:00.000Z');
assert.deepEqual(parsed.results[1].images, [
  'https://lh3.googleusercontent.com/business-photo-one=w800-h600',
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:business-photo-two'
]);
assert.deepEqual(parsed.images, [
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:unrelated-pizza',
  'https://lh3.googleusercontent.com/business-photo-one=w800-h600',
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:business-photo-two'
]);

const gotoHtml = '<html><body><a href="/goto?url=opaque-google-token"><h3>Padaria do Bairro | Horizontina RS</h3></a></body></html>';
const parsedGoto = parseGoogleSearchPage(gotoHtml);
assert.equal(parsedGoto.results[0].url, 'https://www.google.com/goto?url=opaque-google-token');

const queries = [];
const mapsQueries = [];
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
  renderMaps: async (query) => { mapsQueries.push(query); return /\bem\b/i.test(query) ? mapsSearchHtml : mapsHtml; },
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
assert(!details.photos.some((photo) => /unrelated|favicon/i.test(photo.name)));

const downloaded = await client.getPhoto({ photoName: details.photos[0].name, runId: 'run-1' });
const classification = await client.classifyFoodPhoto({ bytes: downloaded.bytes, runId: 'run-1' });
assert.equal(classification.isFood, true);
assert.deepEqual(classification.labels, ['google_business_product_photo']);

const menu = await client.searchMenu({ businessName: 'Padaria Bom Pão', city: 'Horizontina', state: 'RS' });
assert.equal(menu[0].url, 'https://www.ifood.com.br/delivery/horizontina-rs/padaria-bom-pao');
assert(mapsQueries.some((query) => /Padaria Bom Pão Horizontina RS/i.test(query)));
assert(queries.some((query) => /cardápio menu pedidos online/i.test(query)));

assert.equal(outreachDiscoveryMode({ GOOGLE_OUTREACH_API_KEY: 'paid-key' }), 'api');
assert.equal(outreachDiscoveryMode({ GOOGLE_OUTREACH_API_KEY: '', GOOGLE_OUTREACH_BROWSER_ENABLED: 'true' }), 'browser');
assert.equal(outreachCandidateLimit({ mode: 'browser', requested: 50, env: {} }), 12);
assert.equal(outreachCandidateLimit({ mode: 'api', requested: 50, env: {} }), 50);
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
  renderMaps: async () => mapsSearchHtml,
  renderSearch: async () => gotoHtml,
  fetch: async (url) => ({
    status: 302,
    ok: false,
    headers: { get: (name) => name === 'location' ? 'https://www.instagram.com/padariadobairro/' : null }
  })
});
await redirectClient.searchPlaces({ query: 'padaria em Horizontina RS' });
const redirectedMenu = await redirectClient.searchMenu({ businessName: 'Padaria do Bairro', city: 'Horizontina', state: 'RS' });
assert.equal(redirectedMenu[0].url, 'https://www.instagram.com/padariadobairro/');

const staleMapsHtml = mapsHtml.replace('há 2 dias', '3 meses atrás');
const activityFallbackClient = createGoogleBrowserOutreachClient({
  now: () => new Date('2026-10-15T12:00:00.000Z'),
  minIntervalMs: 0,
  renderMaps: async (query) => /\bem\b/i.test(query) ? mapsSearchHtml : staleMapsHtml,
  renderSearch: async () => detailsHtml
});
const fallbackPlace = (await activityFallbackClient.searchPlaces({ query: 'padaria em Horizontina RS' }))[0];
const fallbackDetails = await activityFallbackClient.getPlaceDetails({ placeId: fallbackPlace.id });
assert.equal(fallbackDetails.recentPostAt, '2026-10-13T12:00:00.000Z');

const activityQueries = [];
const reviewActivityClient = createGoogleBrowserOutreachClient({
  now: () => new Date('2026-10-15T12:00:00.000Z'),
  minIntervalMs: 0,
  renderMaps: async (query) => /\bem\b/i.test(query) ? mapsSearchHtml : staleMapsHtml,
  renderSearch: async (query) => {
    activityQueries.push(query);
    return /avalia.*es/i.test(query) ? detailsHtml : searchHtml;
  }
});
const reviewActivityPlace = (await reviewActivityClient.searchPlaces({ query: 'padaria em Horizontina RS' }))[0];
const reviewActivityDetails = await reviewActivityClient.getPlaceDetails({ placeId: reviewActivityPlace.id });
assert.equal(reviewActivityDetails.recentPostAt, '2026-10-13T12:00:00.000Z');
assert(activityQueries.some((query) => /avalia.*es google/i.test(query)));

let transientAttempts = 0;
const transientClient = createGoogleBrowserOutreachClient({
  minIntervalMs: 0,
  renderMaps: async () => {
    transientAttempts += 1;
    if (transientAttempts === 1) throw new Error('Chromium não concluiu a busca Google (SIGKILL).');
    return mapsSearchHtml;
  }
});
assert.equal((await transientClient.searchPlaces({ query: 'padaria em Horizontina RS' })).length, 2);
assert.equal(transientAttempts, 2);

const blocked = parseGoogleSearchPage('<html><body>Nossos sistemas detectaram tráfego incomum. /sorry/index CAPTCHA</body></html>');
assert.equal(blocked.blocked, true);

const chromeArguments = createGoogleChromeArguments({
  profile: '/tmp/google-profile',
  url: 'https://www.google.com/search?q=padaria',
  virtualTimeBudgetMs: 8000
});
assert(chromeArguments.includes('--virtual-time-budget=8000'));
assert(!chromeArguments.some((argument) => argument.startsWith('--user-data-dir=')), 'Chromium não deve persistir perfil durante a busca descartável.');

const limited = createGoogleBrowserOutreachClient({ maxQueries: 1, minIntervalMs: 0, renderMaps: async () => mapsSearchHtml });
await limited.searchPlaces({ query: 'padaria em Horizontina RS' });
await assert.rejects(() => limited.searchPlaces({ query: 'pizzaria em Horizontina RS' }), /limite de consultas gratuitas/i);

console.log('Outreach Google browser smoke: OK');
