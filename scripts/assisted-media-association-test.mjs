import assert from 'node:assert/strict';
import { suggestProductPhotoLinks } from '../src/lib/assisted-media-association.js';

const draft = { categories: [{ name: 'Lanches', items: [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Xis Bacon' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Xis Salada' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Batata grande' }
] }] };
const suggestions = suggestProductPhotoLinks({ files: [
  { id: 'a', purpose: 'product_photo', original_name: 'foto-xis-bacon.jpg' },
  { id: 'b', purpose: 'product_photo', original_name: 'xis.jpg' },
  { id: 'c', purpose: 'product_photo', original_name: 'sem-relacao.jpg' },
  { id: 'd', purpose: 'menu_source', original_name: 'xis-bacon.pdf' }
], draft });
assert.equal(suggestions.length, 3);
assert.equal(suggestions[0].draft_item_id, draft.categories[0].items[0].id);
assert.equal(suggestions[0].status, 'suggested');
assert.equal(suggestions[1].draft_item_id, null, 'Nome ambíguo não pode escolher produto sozinho.');
assert.equal(suggestions[1].status, 'pending');
assert.equal(suggestions[2].draft_item_id, null);
assert.ok(suggestions.every((item) => item.confirmed_at == null));

console.log('Assisted media association: OK');
