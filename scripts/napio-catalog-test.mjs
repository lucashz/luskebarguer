import assert from 'node:assert/strict';
import { NAPIO_CATALOG } from './napio-catalog.mjs';

assert.equal(NAPIO_CATALOG.store.name, 'Nápio Lanches');
assert.equal(NAPIO_CATALOG.store.address, 'Rua Dahne de Abreu, 980 - Horizontina/RS');
assert.deepEqual(NAPIO_CATALOG.store.business_hours.wednesday, { open: '18:00', close: '22:00', closed: false });
assert.deepEqual(NAPIO_CATALOG.store.business_hours.saturday.intervals, [
  { open: '10:00', close: '14:00' },
  { open: '18:00', close: '22:00' }
]);
assert.equal(NAPIO_CATALOG.categories.length, 4);
assert.equal(NAPIO_CATALOG.categories.flatMap((category) => category.items).length, 26);
assert.deepEqual(
  NAPIO_CATALOG.categories.map((category) => [category.name, category.items.length]),
  [['Xis', 14], ['Porções', 5], ['Bifes', 4], ['Sanduíches', 3]]
);
assert.equal(NAPIO_CATALOG.categories[0].items.find((item) => item.name === 'X Filé').price, 40);
assert.equal(NAPIO_CATALOG.categories[1].items.find((item) => item.name === 'Filé de tilápia, batata e polenta').price, 60);
assert.ok(NAPIO_CATALOG.categories.flatMap((category) => category.items).every((item) => item.image_key));
assert.ok(Object.values(NAPIO_CATALOG.assets).every((asset) => asset.source.startsWith('NAPIO')));

console.log('Nápio catalog test: OK');
