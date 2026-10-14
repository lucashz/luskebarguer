import assert from 'node:assert/strict';
import pg from 'pg';
import { createGoogleOutreachClient, inspectBusinessWebsite } from '../src/lib/google-outreach-client.js';
import { OUTREACH_QUOTA_LIMITS, OutreachQuotaExceededError, reserveQuota } from '../src/lib/outreach-quotas.js';

assert.deepEqual(OUTREACH_QUOTA_LIMITS, {
  places_pro: 4000,
  places_advanced: 800,
  place_photos: 800,
  vision_label: 800
});

const quotaClient = memoryQuotaClient();
const january = await reserveQuota({ sku: 'places_pro', units: 3999, month: '2027-01', runId: 'run-january', client: quotaClient });
assert.equal(january.reserved, 3999);
await assert.rejects(
  reserveQuota({ sku: 'places_pro', units: 2, month: '2027-01', runId: 'run-blocked', client: quotaClient }),
  OutreachQuotaExceededError
);
const february = await reserveQuota({ sku: 'places_pro', units: 2, month: '2027-02', runId: 'run-february', client: quotaClient });
assert.equal(february.reserved, 2, 'A cota não reiniciou na virada mensal.');
await february.complete('success');
assert.equal(quotaClient.rows.get('places_pro:2027-02-01').consumed_units, 2);

const concurrencyClient = memoryQuotaClient();
const concurrent = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => reserveQuota({
  sku: 'places_advanced',
  units: 100,
  month: '2027-03',
  runId: `run-${index}`,
  client: concurrencyClient
})));
assert.equal(concurrent.filter((item) => item.status === 'fulfilled').length, 8);
assert.equal(concurrent.filter((item) => item.status === 'rejected').length, 4);
assert.equal(concurrencyClient.rows.get('places_advanced:2027-03-01').reserved_units, 800);

const order = [];
const requests = [];
const completions = [];
const client = createGoogleOutreachClient({
  apiKey: 'google-test-key',
  timeoutMs: 100,
  reserveQuota: async ({ sku, runId }) => {
    order.push(`reserve:${sku}:${runId}`);
    return { complete: async (result) => completions.push(`${sku}:${result}`) };
  },
  fetch: async (url, options = {}) => {
    order.push(`fetch:${String(url)}`);
    requests.push({ url: String(url), options });
    if (String(url).includes('searchText')) return jsonResponse({ places: [{ id: 'place-1', displayName: { text: 'Padaria Central' } }] });
    if (String(url).includes('/media')) return new Response(Uint8Array.from([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    if (String(url).includes('vision.googleapis.com')) return jsonResponse({ responses: [{ labelAnnotations: [{ description: 'Food', score: 0.98 }, { description: 'Bread', score: 0.91 }] }] });
    if (String(url).includes('/v1/places/place-1')) return jsonResponse({ id: 'place-1', nationalPhoneNumber: '(55) 99999-0001', photos: [{ name: 'places/place-1/photos/photo-1' }] });
    return new Response('not found', { status: 404 });
  }
});

const search = await client.searchPlaces({ query: 'padaria em Horizontina RS', runId: 'run-search' });
assert.equal(search[0].id, 'place-1');
assert.equal(order[0], 'reserve:places_pro:run-search', 'A chamada ocorreu antes da reserva de cota.');
assert.equal(requests[0].options.headers['X-Goog-FieldMask'], 'places.id,places.displayName,places.formattedAddress,places.primaryType,places.location');
assert(!requests[0].options.headers['X-Goog-FieldMask'].includes('reviews'));

const details = await client.getPlaceDetails({ placeId: 'place-1', runId: 'run-details' });
assert.equal(details.nationalPhoneNumber, '(55) 99999-0001');
assert.equal(requests[1].options.headers['X-Goog-FieldMask'], 'id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,regularOpeningHours,userRatingCount,reviews,photos,googleMapsUri,primaryType');

const photo = await client.getPhoto({ photoName: 'places/place-1/photos/photo-1', maxWidthPx: 1200, runId: 'run-photo' });
assert.deepEqual([...photo.bytes], [1, 2, 3]);
assert.equal(photo.contentType, 'image/jpeg');
assert(requests[2].url.includes('maxWidthPx=1200'));
const classification = await client.classifyFoodPhoto({ bytes: Uint8Array.from([1, 2, 3]), runId: 'run-vision' });
assert.equal(classification.isFood, true);
assert.deepEqual(classification.labels, ['Food', 'Bread']);
assert.equal(classification.hasMenuText, false);
assert.deepEqual(JSON.parse(requests.find((request) => request.url.includes('vision.googleapis.com')).options.body).requests[0].features.map((feature) => feature.type), ['LABEL_DETECTION', 'TEXT_DETECTION']);
assert.deepEqual(completions, ['places_pro:success', 'places_advanced:success', 'place_photos:success', 'vision_label:success']);

let blockedFetches = 0;
const blockedClient = createGoogleOutreachClient({
  apiKey: 'google-test-key',
  reserveQuota: async () => { throw new OutreachQuotaExceededError('places_pro', 4000, 1); },
  fetch: async () => { blockedFetches += 1; return jsonResponse({}); }
});
await assert.rejects(blockedClient.searchPlaces({ query: 'lanchonete', runId: 'run-blocked' }), OutreachQuotaExceededError);
assert.equal(blockedFetches, 0, 'A API foi chamada mesmo com a cota bloqueada.');

const failedResults = [];
const failedClient = createGoogleOutreachClient({
  apiKey: 'google-test-key',
  reserveQuota: async () => ({ complete: async (result) => failedResults.push(result) }),
  fetch: async () => jsonResponse({ error: { message: 'request denied' } }, 403)
});
await assert.rejects(failedClient.searchPlaces({ query: 'cafeteria', runId: 'run-failed' }), /Google Places.*403/i);
assert.deepEqual(failedResults, ['failure']);

const timeoutResults = [];
const timeoutClient = createGoogleOutreachClient({
  apiKey: 'google-test-key',
  timeoutMs: 10,
  reserveQuota: async () => ({ complete: async (result) => timeoutResults.push(result) }),
  fetch: async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason));
  })
});
await assert.rejects(timeoutClient.searchPlaces({ query: 'pizzaria', runId: 'run-timeout' }), /tempo limite/i);
assert.deepEqual(timeoutResults, ['failure']);

const websiteResults = await inspectBusinessWebsite('https://padaria.example', {
  lookup: async () => [{ address: '203.0.113.10' }],
  fetch: async () => new Response('<html><body><a href="/cardapio">Veja nosso cardápio e preços</a><a href="https://www.ifood.com.br/delivery/padaria">Peça no iFood</a></body></html>', { status: 200, headers: { 'content-type': 'text/html' } })
});
assert(websiteResults.some((result) => result.url === 'https://padaria.example/cardapio'));
assert(websiteResults.some((result) => result.url.startsWith('https://www.ifood.com.br/')), 'Link externo de delivery foi ignorado.');
assert.deepEqual(await inspectBusinessWebsite('http://127.0.0.1/private', { fetch: async () => { throw new Error('SSRF'); } }), []);

if (process.env.DATABASE_URL) await databaseConcurrencySmoke();

console.log('Outreach Google smoke: OK');

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function memoryQuotaClient() {
  const rows = new Map();
  let lock = Promise.resolve();
  return {
    rows,
    query(sql, params) {
      const operation = lock.then(() => {
        if (/set\s+"?consumed_units"?/i.test(sql)) {
          const [sku, usageMonth, units, runId, result] = params;
          const key = `${sku}:${usageMonth}`;
          const current = rows.get(key);
          const next = {
            ...current,
            consumed_units: current.consumed_units + (result === 'success' ? units : 0),
            details: { last_run_id: runId, last_result: result }
          };
          rows.set(key, next);
          return { rows: [next] };
        }
        const [sku, usageMonth, units, limit, runId] = params;
        const key = `${sku}:${usageMonth}`;
        const current = rows.get(key) || { sku, usage_month: usageMonth, reserved_units: 0, consumed_units: 0, limit_units: limit, details: {} };
        if (current.reserved_units + units > current.limit_units) return { rows: [] };
        const next = { ...current, reserved_units: current.reserved_units + units, details: { last_run_id: runId } };
        rows.set(key, next);
        return { rows: [next] };
      });
      lock = operation.catch(() => {});
      return operation;
    }
  };
}

async function databaseConcurrencySmoke() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 12 });
  const month = '2099-12-01';
  try {
    await pool.query('delete from sales_quota_usage where sku=$1 and usage_month=$2::date', ['places_advanced', month]);
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => reserveQuota({
      sku: 'places_advanced',
      units: 100,
      month,
      runId: `database-concurrency-${index}`,
      client: pool
    })));
    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 8, 'A reserva PostgreSQL ultrapassou o limite atômico.');
    const stored = await pool.query('select reserved_units from sales_quota_usage where sku=$1 and usage_month=$2::date', ['places_advanced', month]);
    assert.equal(stored.rows[0].reserved_units, 800);
  } finally {
    await pool.query('delete from sales_quota_usage where sku=$1 and usage_month=$2::date', ['places_advanced', month]).catch(() => {});
    await pool.end();
  }
}
