import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractAssistedMenu, mergeAssistedMenuDraft, validateMenuDraft } from '../src/lib/assisted-menu-import.js';
import { publicImportRun } from '../src/lib/assisted-menu-import-run.js';
import { storeAssistedFile, validateAssistedFile } from '../src/lib/assisted-registration-files.js';
import { applyMenuDraftPatch, assertMenuDraftPublishable, reviewMenuDraft } from '../src/lib/assisted-menu-review.js';

const { default: ExcelJS } = await import('exceljs');

const workspace = await mkdtemp(path.join(tmpdir(), 'tapronto-assisted-menu-'));
try {
  const text = await readFile(new URL('./fixtures/assisted-menu/menu.txt', import.meta.url));
  const textDraft = await extractAssistedMenu({ files: [{ mime_type: 'text/plain', buffer: text }] });
  assert.equal(textDraft.categories[0].items[0].price_cents, 2990);
  assert.equal(textDraft.categories[0].items[1].needs_review, true, 'Preço ausente nunca pode ser inventado.');

  const csv = await readFile(new URL('./fixtures/assisted-menu/menu.csv', import.meta.url));
  const csvDraft = await extractAssistedMenu({ files: [{ mime_type: 'text/csv', buffer: csv }] });
  assert.equal(csvDraft.categories[0].items[0].price_cents, 3250, 'CSV precisa aceitar vírgula decimal.');
  const ambiguousDraft = await extractAssistedMenu({ files: [{ mime_type: 'text/csv', buffer: Buffer.from('Categoria;Produto;Preço\nLanches;Especial;Consultar') }] });
  assert.equal(ambiguousDraft.categories[0].items[0].price_cents, null, 'Preço não numérico não pode virar zero.');
  assert.equal(ambiguousDraft.categories[0].items[0].needs_review, true, 'Preço ambíguo exige revisão.');

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Cardapio');
  sheet.addRows([['Categoria', 'Produto', 'Preço'], ['Pizzas', 'Calabresa', 42.9], ['', '', ''], ['Bebidas', 'Refrigerante', 8]]);
  const xlsxDraft = await extractAssistedMenu({ files: [{ mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await workbook.xlsx.writeBuffer()) }] });
  assert.equal(xlsxDraft.categories.length, 2, 'Linhas vazias da planilha devem ser ignoradas.');

  const pdfDraft = await extractAssistedMenu({ files: [{ mime_type: 'application/pdf', buffer: simplePdf(['Lanches', 'Xis - R$ 27,90']) }] });
  assert.equal(pdfDraft.categories[0].items[0].price_cents, 2790, 'PDF digital precisa preservar o preço extraído.');

  const visual = await extractAssistedMenu({ files: [{ mime_type: 'image/jpeg', buffer: Buffer.from('fake-image') }], aiRequest: async ({ normalized }) => {
    assert.equal(normalized, true, 'Imagem deve chegar normalizada ao adaptador visual.');
    return { schema_version: 1, categories: [{ name: 'Lanches', items: [{ name: 'Xis', price_cents: null, needs_review: true }] }] };
  }, normalizeImage: async () => Buffer.from('normalized') });
  assert.equal(visual.categories[0].items[0].needs_review, true);

  assert.throws(() => validateMenuDraft({ categories: [{ name: 'X', items: [{ name: 'Y', price_cents: 'grátis' }] }] }), /inválid/i);
  assert.throws(() => validateAssistedFile({ name: '../menu.exe', mime_type: 'application/octet-stream', buffer: Buffer.from('MZ') }), /formato/i);

  const stored = await storeAssistedFile({ directory: workspace, name: '../../menu.txt', mime_type: 'text/plain', purpose: 'menu_source', buffer: text });
  assert.equal(stored.purpose, 'menu_source');
  await assert.rejects(() => storeAssistedFile({ directory: workspace, name: 'menu.txt', mime_type: 'text/plain', purpose: 'unknown', buffer: text }), /finalidade/i);
  assert.ok(stored.storage_key && !stored.storage_key.includes('menu.txt'));
  assert.equal((await readFile(stored.absolute_path)).length, text.length);
  assert.ok(!stored.absolute_path.includes('public'), 'Arquivo assistido precisa ficar fora do diretório público.');

  const categoryId = '11111111-1111-4111-8111-111111111111';
  const itemId = '22222222-2222-4222-8222-222222222222';
  const baseDraft = { version: 1, schema_version: 1, categories: [{ id: categoryId, name: 'Lanches', items: [{ id: itemId, name: 'Xis', description: '', price_cents: 2500, needs_review: false, option_groups: [] }] }] };
  const edited = applyMenuDraftPatch(baseDraft, { expected_version: 1, operations: [{ type: 'update_item', item_id: itemId, changes: { price_cents: 2690 } }, { type: 'duplicate_item', item_id: itemId }] });
  assert.equal(edited.version, 2);
  assert.equal(edited.categories[0].items[0].price_cents, 2690);
  assert.equal(edited.categories[0].items.length, 2);
  assert.notEqual(edited.categories[0].items[1].id, itemId);
  assert.throws(() => applyMenuDraftPatch(edited, { expected_version: 1, operations: [] }), /outra tela|versão/i);
  assert.throws(() => assertMenuDraftPublishable({ ...baseDraft, categories: [{ ...baseDraft.categories[0], items: [{ ...baseDraft.categories[0].items[0], price_cents: null, needs_review: true }] }] }), /categories\[0\]\.items\[0\]/);
  assert.throws(() => assertMenuDraftPublishable({ ...baseDraft, categories: [{ ...baseDraft.categories[0], items: [{ ...baseDraft.categories[0].items[0], option_groups: [{ id: categoryId, name: 'Tamanho', min_choices: 2, max_choices: 1, options: [{ id: itemId, name: '', price_cents: -150 }] }] }] }] }), /option_groups/, 'Adicional inválido não pode ser aprovado.');
  const reviewed = reviewMenuDraft(edited, { id: '33333333-3333-4333-8333-333333333333' });
  assert.ok(reviewed.reviewed_at && reviewed.reviewed_hash && reviewed.reviewed_by);

  const appended = mergeAssistedMenuDraft(baseDraft, { categories: [{ name: 'Lanches', items: [{ name: 'Xis', price_cents: 3000 }, { name: 'Batata', price_cents: 1200 }] }] }, 'append');
  assert.equal(appended.categories[0].items[0].price_cents, 2500, 'Acrescentar não pode sobrescrever correção existente.');
  assert.equal(appended.categories[0].items.length, 3);
  assert.equal(appended.categories[0].items[1].needs_review, true, 'Conflito importado deve exigir revisão.');
  const runDto = publicImportRun({ id: 'run', status: 'failed', error_code: 'provider_timeout', error_message: 'Tente novamente.', source_text: 'segredo' });
  assert.equal(runDto.error_code, 'provider_timeout');
  assert.equal(runDto.source_text, undefined);

  console.log('Assisted menu import: OK');
} finally {
  await rm(workspace, { recursive: true, force: true });
}

function simplePdf(lines) {
  const escaped = lines.map((line) => String(line).replace(/[()\\]/g, '\\$&'));
  const stream = `BT /F1 12 Tf 72 720 Td ${escaped.map((line, index) => `${index ? '0 -18 Td ' : ''}(${line}) Tj`).join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
