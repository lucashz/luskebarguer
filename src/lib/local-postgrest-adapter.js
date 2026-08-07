import pg from 'pg';

const { Pool } = pg;

let pool = null;

export function getLocalPool() {
  if (!process.env.DATABASE_URL) {
    const error = new Error('DATABASE_URL nao configurado.');
    error.status = 500;
    throw error;
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX || 10),
      idleTimeoutMillis: 30_000
    });
  }
  return pool;
}

export async function closeLocalPool() {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}

export async function localPostgrestRequest(method, table, query = {}, payload, extraHeaders = []) {
  if (method === 'GET') {
    return executeLocalRequest(getLocalPool(), method, table, query, payload, extraHeaders);
  }
  const client = await getLocalPool().connect();
  try {
    await client.query('begin');
    const result = await executeLocalRequest(client, method, table, query, payload, extraHeaders);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function withLocalTransaction(callback) {
  const client = await getLocalPool().connect();
  try {
    await client.query('begin');
    const db = (method, table, query = {}, payload, extraHeaders = []) =>
      executeLocalRequest(client, method, table, query, payload, extraHeaders);
    db.lockPromotion = async (promotionId) => {
      const result = await client.query('select * from promotions where id = $1 for update', [promotionId]);
      return result.rows[0] || null;
    };
    const result = await callback(db);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function executeLocalRequest(client, method, table, query, payload, extraHeaders) {
  const tableName = identifier(table);
  const prefer = extraHeaders.find((header) => String(header).toLowerCase().startsWith('prefer:')) || '';
  const wantsMinimal = prefer.toLowerCase().includes('return=minimal');
  const where = buildWhere(query);

  if (method === 'GET') {
    const select = buildSelect(query.select);
    const order = buildOrder(query.order);
    const limit = query.limit ? ` limit ${positiveInt(query.limit)}` : '';
    const offset = query.offset ? ` offset ${nonNegativeInt(query.offset)}` : '';
    const sql = `select ${select} from "${tableName}"${where.sql}${order}${limit}${offset}`;
    const result = await client.query(sql, where.values);
    return result.rows;
  }

  if (method === 'POST') {
    const rows = Array.isArray(payload) ? payload : [payload || {}];
    if (!rows.length) return [];
    const inserted = [];
    for (const row of rows) {
      const clean = cleanPayload(row);
      const columns = Object.keys(clean).map(identifier);
      if (!columns.length) continue;
      const values = Object.values(clean);
      const placeholders = values.map((_, index) => `$${index + 1}`);
      const sql = `insert into "${tableName}" (${columns.map((column) => `"${column}"`).join(', ')}) values (${placeholders.join(', ')}) returning *`;
      const result = await client.query(sql, values);
      inserted.push(...result.rows);
    }
    return wantsMinimal ? [] : inserted;
  }

  if (method === 'PATCH') {
    const clean = cleanPayload(payload || {});
    const columns = Object.keys(clean).map(identifier);
    if (!columns.length) return [];
    const values = Object.values(clean);
    const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`);
    const shiftedWhere = shiftWhere(where, values.length);
    const sql = `update "${tableName}" set ${assignments.join(', ')}${shiftedWhere.sql} returning *`;
    const result = await client.query(sql, [...values, ...where.values]);
    return wantsMinimal ? [] : result.rows;
  }

  if (method === 'DELETE') {
    const sql = `delete from "${tableName}"${where.sql} returning *`;
    const result = await client.query(sql, where.values);
    return wantsMinimal ? [] : result.rows;
  }

  const error = new Error(`Metodo de banco nao suportado: ${method}`);
  error.status = 405;
  throw error;
}

function buildWhere(query = {}) {
  const clauses = [];
  const values = [];
  for (const [key, rawValue] of Object.entries(query)) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
    if (key === 'and') {
      const nested = parseAndFilter(rawValue);
      for (const filter of nested) addFilter(clauses, values, filter.column, filter.value);
      continue;
    }
    addFilter(clauses, values, key, rawValue);
  }
  return {
    sql: clauses.length ? ` where ${clauses.join(' and ')}` : '',
    values
  };
}

function addFilter(clauses, values, column, rawValue) {
  const name = identifier(column);
  const value = String(rawValue ?? '');

  if (value === 'is.null') {
    clauses.push(`"${name}" is null`);
    return;
  }
  if (value === 'not.is.null') {
    clauses.push(`"${name}" is not null`);
    return;
  }

  const operatorMatch = value.match(/^([a-z]+)\.(.*)$/);
  if (!operatorMatch) {
    values.push(rawValue);
    clauses.push(`"${name}" = $${values.length}`);
    return;
  }

  const [, operator, operand] = operatorMatch;
  if (operator === 'eq') {
    values.push(parseOperand(operand));
    clauses.push(`"${name}" = $${values.length}`);
    return;
  }
  if (operator === 'neq') {
    values.push(parseOperand(operand));
    clauses.push(`"${name}" <> $${values.length}`);
    return;
  }
  if (operator === 'gte' || operator === 'lte' || operator === 'gt' || operator === 'lt') {
    values.push(parseOperand(operand));
    const sqlOperator = ({ gte: '>=', lte: '<=', gt: '>', lt: '<' })[operator];
    clauses.push(`"${name}" ${sqlOperator} $${values.length}`);
    return;
  }
  if (operator === 'in') {
    const items = parseInOperand(operand);
    if (!items.length) {
      clauses.push('false');
      return;
    }
    values.push(items);
    clauses.push(`"${name}"::text = any($${values.length}::text[])`);
    return;
  }
  if (operator === 'cs') {
    values.push(parseArrayOperand(operand));
    clauses.push(`"${name}" @> $${values.length}`);
    return;
  }

  const error = new Error(`Filtro nao suportado: ${operator}`);
  error.status = 400;
  throw error;
}

function parseAndFilter(value) {
  const text = String(value || '').trim().replace(/^\(/, '').replace(/\)$/, '');
  if (!text) return [];
  return text.split(',').map((part) => {
    const match = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.([a-z]+)\.(.*)$/);
    if (!match) return null;
    return { column: match[1], value: `${match[2]}.${match[3]}` };
  }).filter(Boolean);
}

function buildOrder(order) {
  if (!order) return '';
  const clauses = String(order).split(',').map((part) => {
    const [column, direction] = part.trim().split('.');
    const name = identifier(column);
    const dir = String(direction || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
    return `"${name}" ${dir}`;
  });
  return clauses.length ? ` order by ${clauses.join(', ')}` : '';
}

function buildSelect(select) {
  if (!select || String(select).trim() === '*') return '*';
  const columns = String(select).split(',').map((value) => identifier(value.trim()));
  if (!columns.length) return '*';
  return columns.map((column) => `"${column}"`).join(', ');
}

function shiftWhere(where, shift) {
  if (!where.sql || !shift) return where;
  return {
    sql: where.sql.replace(/\$(\d+)/g, (_, number) => `$${Number(number) + shift}`),
    values: where.values
  };
}

function cleanPayload(row) {
  return Object.fromEntries(Object.entries(row || {}).filter(([, value]) => value !== undefined));
}

function parseOperand(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  return value;
}

function parseInOperand(value) {
  return String(value || '').replace(/^\(/, '').replace(/\)$/, '').split(',').map(parseOperand).filter((item) => item !== '');
}

function parseArrayOperand(value) {
  const trimmed = String(value || '').trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed.slice(1, -1).split(',').filter(Boolean);
  }
  return parseInOperand(trimmed);
}

function positiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 10_000) : 100;
}

function nonNegativeInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 10_000_000) : 0;
}

function identifier(value) {
  const text = String(value || '');
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(text)) {
    const error = new Error(`Identificador invalido: ${text}`);
    error.status = 400;
    throw error;
  }
  return text;
}
