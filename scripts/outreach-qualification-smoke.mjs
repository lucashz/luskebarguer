import assert from 'node:assert/strict';
import { resolveSearchTargetOverride, selectSearchTargets } from '../src/lib/outreach-city-selector.js';
import { qualifyOutreachCandidate } from '../src/lib/outreach-qualification.js';

const targets = selectSearchTargets({
  cities: [
    { city: 'Cidade Limite', state: 'RS', population: 55000 },
    { city: 'Cidade Grande', state: 'SC', population: 55001 },
    { city: 'Cidade Nova', state: 'PR', population: 18000 }
  ],
  segments: ['padaria', 'lanchonete'],
  history: [
    { city: 'Cidade Limite', state: 'RS', segment: 'padaria', search_count: 4, last_searched_at: '2026-10-12T10:00:00.000Z' },
    { city: 'Cidade Limite', state: 'RS', segment: 'lanchonete', search_count: 2, last_searched_at: '2026-10-11T10:00:00.000Z' }
  ],
  count: 3
});

assert.equal(targets.length, 3);
assert(targets.every((target) => target.population <= 55000));
assert(!targets.some((target) => target.city === 'Cidade Grande'));
assert.equal(targets[0].city, 'Cidade Nova');
assert.equal(targets[0].population, 18000);
assert.equal(targets[0].search_count, 0);
assert.equal(new Set(targets.slice(0, 2).map((target) => target.segment)).size, 2, 'A seleção não alternou segmentos.');

assert.deepEqual(resolveSearchTargetOverride({
  city: 'Cidade Nova', state: 'pr', segment: 'padaria',
  cities: [{ city: 'Cidade Nova', state: 'PR', population: 18000 }],
  segments: ['padaria', 'lanchonete']
}), { city: 'Cidade Nova', state: 'PR', population: 18000, segment: 'padaria' });
assert.throws(() => resolveSearchTargetOverride({ city: 'Cidade Grande', state: 'SC', segment: 'padaria', cities: [{ city: 'Cidade Grande', state: 'SC', population: 55001 }], segments: ['padaria'] }), /cidade pequena/i);

const now = new Date('2026-10-13T12:00:00.000Z');
const activeAtBoundary = new Date(now.getTime() - 30 * 86400000).toISOString();
const inactivePastBoundary = new Date(now.getTime() - 31 * 86400000).toISOString();

const baseCandidate = {
  id: 'place-1',
  displayName: { text: 'Padaria Central' },
  nationalPhoneNumber: '(55) 99999-0001',
  formattedAddress: 'Horizontina, RS',
  city: 'Horizontina',
  state: 'RS',
  segment: 'Padaria',
  reviews: [{ publishTime: activeAtBoundary }],
  photos: [{ name: 'photo-food-1' }, { name: 'photo-food-2' }, { name: 'photo-front' }]
};

const qualified = await qualifyOutreachCandidate(baseCandidate, dependencies());
assert.equal(qualified.qualified, true);
assert.equal(qualified.stage, 'photos_ready');
assert.equal(qualified.photos.length, 2);
assert.equal(qualified.leadPatch.google_place_id, 'place-1');
assert.equal(qualified.leadPatch.last_validated_at, now.toISOString());

const duplicateCalls = [];
const duplicate = await qualifyOutreachCandidate(baseCandidate, dependencies({
  calls: duplicateCalls,
  hasPriorContact: async () => { duplicateCalls.push('hasPriorContact'); return true; }
}));
assert.equal(duplicate.code, 'duplicate');
assert.deepEqual(duplicateCalls, ['hasPriorContact'], 'Um descarte barato executou verificações caras.');

const suppressed = await qualifyOutreachCandidate(baseCandidate, dependencies({ isSuppressed: async () => true }));
assert.equal(suppressed.code, 'suppressed');

const noWhatsapp = await qualifyOutreachCandidate(baseCandidate, dependencies({ checkWhatsApp: async () => false }));
assert.equal(noWhatsapp.code, 'no_whatsapp');

const inactive = await qualifyOutreachCandidate({ ...baseCandidate, reviews: [{ publishTime: inactivePastBoundary }] }, dependencies());
assert.equal(inactive.code, 'inactive');

const directMenu = await qualifyOutreachCandidate({ ...baseCandidate, websiteUri: 'https://padariacentral.example/cardapio' }, dependencies());
assert.equal(directMenu.code, 'online_menu');

const indirectMenu = await qualifyOutreachCandidate(baseCandidate, dependencies({
  searchMenu: async () => [{ title: 'Cardápio e pedidos', url: 'https://delivery.example/padaria-central/menu', snippet: 'Escolha seus produtos e peça online' }]
}));
assert.equal(indirectMenu.code, 'online_menu');

const menuPhoto = await qualifyOutreachCandidate({ ...baseCandidate, hasPublicMenuPhoto: true }, dependencies());
assert.equal(menuPhoto.code, 'online_menu');

const detectedMenuPhoto = await qualifyOutreachCandidate(baseCandidate, dependencies({
  validatePhoto: async () => ({ usable: false, kind: 'other', hasMenuText: true })
}));
assert.equal(detectedMenuPhoto.code, 'online_menu');
assert.equal(detectedMenuPhoto.evidence.menu_source, 'google_menu_photo');

const emptyAggregator = await qualifyOutreachCandidate(baseCandidate, dependencies({
  searchMenu: async () => [{ title: 'Padaria Central', url: 'https://restaurantguru.example/padaria-central', snippet: 'Avaliações, endereço e telefone' }]
}));
assert.equal(emptyAggregator.qualified, true, 'Página agregadora vazia foi tratada como cardápio.');

const insufficientPhotos = await qualifyOutreachCandidate(baseCandidate, dependencies({
  validatePhoto: async (photo) => ({ usable: photo.name === 'photo-food-1', kind: photo.name === 'photo-food-1' ? 'food' : 'exterior' })
}));
assert.equal(insufficientPhotos.code, 'insufficient_photos');

const inconclusive = await qualifyOutreachCandidate(baseCandidate, dependencies({
  searchMenu: async () => { throw new Error('Google indisponível'); }
}));
assert.equal(inconclusive.code, 'inconclusive');

console.log('Outreach qualification smoke: OK');

function dependencies(overrides = {}) {
  const calls = overrides.calls || [];
  return {
    now,
    hasPriorContact: async () => { calls.push('hasPriorContact'); return false; },
    isSuppressed: async () => { calls.push('isSuppressed'); return false; },
    checkWhatsApp: async () => { calls.push('checkWhatsApp'); return true; },
    searchMenu: async () => { calls.push('searchMenu'); return []; },
    validatePhoto: async (photo) => {
      calls.push(`validatePhoto:${photo.name}`);
      return { usable: photo.name.startsWith('photo-food'), kind: photo.name.startsWith('photo-food') ? 'food' : 'exterior' };
    },
    ...overrides
  };
}
