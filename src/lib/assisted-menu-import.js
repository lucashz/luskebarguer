import ExcelJS from 'exceljs';
import { PDFParse } from 'pdf-parse';

export async function extractAssistedMenu({ files = [], text = '', aiRequest, normalizeImage } = {}) {
  const categories = [];
  if (text) parseText(text, categories);
  for (const file of files) {
    const mime = String(file.mime_type || '');
    if (mime === 'text/plain' || mime === 'text/csv') parseText(Buffer.from(file.buffer).toString('utf8'), categories, mime === 'text/csv');
    else if (mime.includes('spreadsheetml')) await parseWorkbook(file.buffer, categories);
    else if (mime === 'application/pdf') {
      const parser = new PDFParse({ data: Buffer.from(file.buffer) });
      try {
        const result = await parser.getText();
        if (!String(result.text || '').trim()) throw invalid('PDF sem texto legível; envie uma foto ou use a extração visual.');
        parseText(result.text, categories);
      } finally { await parser.destroy(); }
    }
    else if (mime.startsWith('image/')) {
      if (!aiRequest) throw invalid('Extração visual indisponível.');
      const buffer = normalizeImage ? await normalizeImage(file.buffer) : file.buffer;
      mergeDraft(categories, await aiRequest({ mime_type: mime, buffer, normalized: Boolean(normalizeImage), schema_version: 1 }));
    }
  }
  return validateMenuDraft({ schema_version: 1, categories });
}

export function validateMenuDraft(value = {}) {
  if (!Array.isArray(value.categories)) throw invalid('Cardápio inválido: categorias ausentes.');
  const categories = value.categories.map((category) => {
    if (!category || typeof category.name !== 'string' || !Array.isArray(category.items)) throw invalid('Categoria inválida.');
    return { name: clean(category.name), items: category.items.map((item) => {
      if (!item || typeof item.name !== 'string' || (item.price_cents !== null && !Number.isInteger(item.price_cents))) throw invalid('Produto ou preço inválido.');
      return { name: clean(item.name), description: clean(item.description || ''), price_cents: item.price_cents, needs_review: item.needs_review === true || item.price_cents === null };
    }).filter((item) => item.name) };
  }).filter((category) => category.name && category.items.length);
  return { schema_version: 1, categories };
}

function parseText(source, categories, csv = false) {
  let current = null;
  for (const raw of String(source).split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    if (csv && /categoria.*produto.*pre/i.test(line)) continue;
    if (csv) {
      const parts = line.split(';'); if (parts.length < 2) continue;
      current = category(categories, parts[0]); current.items.push(item(parts[1], parts.slice(2).join(','))); continue;
    }
    const match = line.match(/^(.*?)(?:\s+-\s+R?\$?\s*(\d+[.,]\d{2}))?$/);
    if (!match[2] && !/\b(xis|pizza|suco|refrigerante|burger|lanche)\b/i.test(line) && !current?.items.length) { current = category(categories, line); continue; }
    if (!match[2] && !current) { current = category(categories, 'Cardápio'); }
    if (!match[2] && current?.items.length === 0 && !/\b(xis|pizza|suco|refrigerante|burger|lanche)\b/i.test(line)) { current.name = clean(line); continue; }
    current ||= category(categories, 'Cardápio'); current.items.push(item(match[1], match[2]));
  }
}

async function parseWorkbook(buffer, categories) {
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(buffer));
  workbook.eachSheet((sheet) => sheet.eachRow((row, index) => { if (index === 1) return; const [cat, name, price] = [row.getCell(1).text, row.getCell(2).text, row.getCell(3).value]; if (!cat || !name) return; category(categories, cat).items.push(item(name, price)); }));
}
function category(categories, name) { const value = clean(name); let found = categories.find((entry) => entry.name === value); if (!found) { found = { name: value, items: [] }; categories.push(found); } return found; }
function item(name, price) { const cents = price === undefined || price === null || price === '' ? null : Math.round(Number(String(price).replace(/[^\d,.-]/g, '').replace(',', '.')) * 100); return { name: clean(name), description: '', price_cents: Number.isFinite(cents) ? cents : null, needs_review: !Number.isFinite(cents) }; }
function mergeDraft(categories, draft) { const valid = validateMenuDraft(draft); for (const group of valid.categories) { const target = category(categories, group.name); target.items.push(...group.items); } }
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 300); }
function invalid(message) { const error = new Error(message); error.status = 422; return error; }
