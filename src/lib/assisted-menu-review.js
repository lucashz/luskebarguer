import { createHash, randomUUID } from 'node:crypto';

export function applyMenuDraftPatch(draft = {}, patch = {}) {
  const currentVersion = Number(draft.version || 1);
  if (Number(patch.expected_version) !== currentVersion) throw conflict('Este cardápio foi alterado em outra tela. Atualize antes de continuar.');
  const next = structuredClone(draft);
  next.categories = normalizeIds(next.categories || []);
  for (const operation of Array.isArray(patch.operations) ? patch.operations : []) applyOperation(next, operation);
  next.version = currentVersion + 1;
  next.reviewed_at = null; next.reviewed_by = null; next.reviewed_hash = null;
  return next;
}

export function assertMenuDraftPublishable(draft = {}) {
  const errors = [];
  if (!Array.isArray(draft.categories) || !draft.categories.length) errors.push('categories');
  (draft.categories || []).forEach((category, categoryIndex) => {
    const categoryPath = `categories[${categoryIndex}]`;
    if (!isUuid(category.id) || !clean(category.name)) errors.push(categoryPath);
    if (!Array.isArray(category.items) || !category.items.length) errors.push(`${categoryPath}.items`);
    (category.items || []).forEach((item, itemIndex) => {
      const itemPath = `${categoryPath}.items[${itemIndex}]`;
      if (!isUuid(item.id) || !clean(item.name) || !Number.isInteger(item.price_cents) || item.price_cents < 0 || item.needs_review) errors.push(itemPath);
      (item.option_groups || []).forEach((group, groupIndex) => {
        if (!isUuid(group.id) || !clean(group.name) || !Array.isArray(group.options) || !group.options.length) errors.push(`${itemPath}.option_groups[${groupIndex}]`);
      });
    });
  });
  if (errors.length) throw validation(`Cardápio inválido em: ${[...new Set(errors)].join(', ')}`);
  return true;
}

export function reviewMenuDraft(draft, actor = {}) {
  assertMenuDraftPublishable(draft);
  if (!isUuid(actor.id)) throw validation('Revisor inválido.');
  const reviewed_at = new Date().toISOString();
  const reviewed_hash = createHash('sha256').update(JSON.stringify({ schema_version: draft.schema_version || 1, categories: draft.categories, version: draft.version || 1 })).digest('hex');
  return { ...structuredClone(draft), reviewed_at, reviewed_by: actor.id, reviewed_hash };
}

function applyOperation(draft, operation = {}) {
  const found = findItem(draft, operation.item_id);
  if (operation.type === 'update_item' && found) Object.assign(found.item, sanitizeChanges(operation.changes));
  else if (operation.type === 'delete_item' && found) found.category.items.splice(found.index, 1);
  else if (operation.type === 'duplicate_item' && found) found.category.items.splice(found.index + 1, 0, { ...structuredClone(found.item), id: randomUUID(), name: `${found.item.name} (cópia)` });
  else if (operation.type === 'move_item' && found) { const target = draft.categories.find((entry) => entry.id === operation.category_id); if (!target) throw validation('Categoria de destino inválida.'); found.category.items.splice(found.index, 1); target.items.push(found.item); }
  else if (operation.type === 'delete_category') { const index = draft.categories.findIndex((entry) => entry.id === operation.category_id); if (index < 0) throw validation('Categoria inválida.'); draft.categories.splice(index, 1); }
  else if (operation.type === 'update_category') { const target = draft.categories.find((entry) => entry.id === operation.category_id); if (!target) throw validation('Categoria inválida.'); if (operation.changes?.name !== undefined) target.name = clean(operation.changes.name); }
  else if (operation.type === 'add_option_group' && found) { found.item.option_groups ||= []; found.item.option_groups.push({ id: randomUUID(), name: clean(operation.name), options: Array.isArray(operation.options) ? operation.options.map((option) => ({ id: randomUUID(), name: clean(option.name), price_cents: Number(option.price_cents || 0) })) : [] }); }
  else throw validation('Operação de revisão inválida.');
}
function normalizeIds(categories) { return categories.map((category) => ({ ...category, id: isUuid(category.id) ? category.id : randomUUID(), items: (category.items || []).map((item) => ({ ...item, id: isUuid(item.id) ? item.id : randomUUID(), option_groups: (item.option_groups || []).map((group) => ({ ...group, id: isUuid(group.id) ? group.id : randomUUID(), options: (group.options || []).map((option) => ({ ...option, id: isUuid(option.id) ? option.id : randomUUID() })) })) })) })); }
function findItem(draft, id) { for (const category of draft.categories) { const index = category.items.findIndex((item) => item.id === id); if (index >= 0) return { category, item: category.items[index], index }; } return null; }
function sanitizeChanges(value = {}) { const changes = {}; if ('name' in value) changes.name = clean(value.name); if ('description' in value) changes.description = clean(value.description); if ('price_cents' in value) changes.price_cents = Number.isInteger(value.price_cents) ? value.price_cents : null; if ('needs_review' in value) changes.needs_review = Boolean(value.needs_review); return changes; }
function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')); }
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 300); }
function validation(message) { const error = new Error(message); error.status = 422; return error; }
function conflict(message) { const error = new Error(message); error.status = 409; return error; }
