import assert from 'node:assert/strict';
import { generateStoreSlug, resolveSegmentMenuData } from '../src/lib/outreach-store-provisioning.js';

function testSlugGeneration() {
  assert.equal(generateStoreSlug('Restaurante Fome Mania'), 'restaurante-fome-mania');
  assert.equal(generateStoreSlug('Padaria & Confeitaria São José!'), 'padaria-confeitaria-sao-jose');
  assert.equal(generateStoreSlug('Stop Beer - Delivery'), 'stop-beer-delivery');
  console.log('✓ Slug generation OK');
}

function testSegmentResolutions() {
  const segments = ['restaurante', 'padaria', 'pizzaria', 'hamburgueria', 'bar', 'acaiteria'];
  for (const seg of segments) {
    const data = resolveSegmentMenuData(seg, `Negócio ${seg}`, 'Horizontina', 'RS');
    assert.ok(data.categories.length >= 3, `Deveria ter ao menos 3 categorias para ${seg}`);
    assert.ok(data.categories.every(c => c.items.length >= 2), `Cada categoria deve ter itens para ${seg}`);
    assert.ok(data.theme?.primaryColor, `Tema deve ter primaryColor para ${seg}`);
  }
  console.log('✓ Segment menu data OK para todos os 6 segmentos principais');
}

testSlugGeneration();
testSegmentResolutions();
console.log('✅ TESTE DE PROVISIONAMENTO DE CARDÁPIO OK!');

