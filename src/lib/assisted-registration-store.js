import { publicAssistedRegistration, sanitizeAssistedAnswers, validateDocument } from './assisted-registration.js';

export async function findAssistedDuplicates(pool, identity = {}) {
  const document = identity.document ? validateDocument(identity.document) : '';
  const phone = digits(identity.phone);
  const email = cleanEmail(identity.email);
  const result = await pool.query(`
    select id, status, responsible_name, phone, email, establishment_name, document_normalized,
           answers, attribution, version, company_id, store_id, admin_id, subscription_id,
           email_status, published_at, activated_at, created_at, updated_at
      from assisted_registrations
     where status <> 'cancelled'
       and (($1 <> '' and document_normalized = $1)
         or ($2 <> '' and phone = $2)
         or ($3 <> '' and lower(email) = $3))
     order by updated_at desc
     limit 20
  `, [document, phone, email]);
  return result.rows.map(publicAssistedRegistration);
}

export async function createAssistedRegistration(pool, data = {}, actor = {}) {
  const document = validateDocument(data.document || data.document_normalized);
  const phone = digits(data.phone);
  const email = cleanEmail(data.email);
  const duplicates = await findAssistedDuplicates(pool, { document, phone, email });
  if (duplicates.length) throw conflictError('Já existe um cadastro com estes dados.', duplicates);
  try {
    const result = await pool.query(`
      insert into assisted_registrations
        (responsible_name, phone, email, establishment_name, document_normalized, answers, attribution, operator_admin_id)
      values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)
      returning *
    `, [cleanText(data.responsible_name, 120), phone, email, cleanText(data.establishment_name, 160), document,
      JSON.stringify(sanitizeAssistedAnswers(data.answers)), JSON.stringify(sanitizeObject(data.attribution)), actor.id || null]);
    return publicAssistedRegistration(result.rows[0]);
  } catch (error) {
    if (error?.code === '23505') throw conflictError('Já existe um cadastro com estes dados.', await findAssistedDuplicates(pool, { document, phone, email }));
    throw error;
  }
}

export async function listAssistedRegistrations(pool, filters = {}) {
  const limit = clampInt(filters.limit, 1, 100, 30);
  const offset = clampInt(filters.offset, 0, 100000, 0);
  const query = cleanText(filters.q, 160);
  const queryDigits = digits(query);
  const clauses = [];
  const values = [];
  if (filters.status) {
    values.push(String(filters.status));
    clauses.push(`status::text = $${values.length}`);
  }
  if (query) {
    values.push(`%${escapeLike(query)}%`);
    const textParam = `$${values.length}`;
    values.push(queryDigits ? `%${escapeLike(queryDigits)}%` : '__no_digits__');
    const digitParam = `$${values.length}`;
    clauses.push(`(responsible_name ilike ${textParam} escape '\\' or establishment_name ilike ${textParam} escape '\\' or email ilike ${textParam} escape '\\' or phone like ${digitParam} escape '\\' or document_normalized like ${digitParam} escape '\\')`);
  }
  values.push(limit, offset);
  const result = await pool.query(`select * from assisted_registrations ${clauses.length ? `where ${clauses.join(' and ')}` : ''} order by updated_at desc limit $${values.length - 1} offset $${values.length}`, values);
  return result.rows.map(publicAssistedRegistration);
}

export async function getAssistedRegistration(pool, id) {
  const result = await pool.query('select * from assisted_registrations where id = $1 limit 1', [id]);
  return result.rows[0] ? publicAssistedRegistration(result.rows[0]) : null;
}

export async function updateAssistedRegistration(pool, id, patch = {}, actor = {}) {
  const expectedVersion = Number(patch.expected_version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw validationError('Informe a versão esperada do cadastro.');
  const current = await pool.query('select * from assisted_registrations where id = $1 limit 1', [id]);
  if (!current.rows[0]) return null;
  const row = current.rows[0];
  const values = {
    responsible_name: patch.responsible_name === undefined ? row.responsible_name : cleanText(patch.responsible_name, 120),
    phone: patch.phone === undefined ? row.phone : digits(patch.phone),
    email: patch.email === undefined ? row.email : cleanEmail(patch.email),
    establishment_name: patch.establishment_name === undefined ? row.establishment_name : cleanText(patch.establishment_name, 160),
    document_normalized: patch.document === undefined ? row.document_normalized : validateDocument(patch.document),
    answers: patch.answers === undefined ? row.answers : sanitizeAssistedAnswers(patch.answers),
    attribution: patch.attribution === undefined ? row.attribution : sanitizeObject(patch.attribution)
  };
  const result = await pool.query(`
    update assisted_registrations set responsible_name=$3, phone=$4, email=$5, establishment_name=$6,
      document_normalized=$7, answers=$8::jsonb, attribution=$9::jsonb, operator_admin_id=$10,
      version=version+1, updated_at=now()
    where id=$1 and version=$2 returning *
  `, [id, expectedVersion, values.responsible_name, values.phone, values.email, values.establishment_name,
    values.document_normalized, JSON.stringify(values.answers), JSON.stringify(values.attribution), actor.id || null]);
  if (!result.rows[0]) throw conflictError('Este cadastro foi alterado em outra tela. Atualize e tente novamente.');
  return publicAssistedRegistration(result.rows[0]);
}

function conflictError(message, duplicates = []) { const error = new Error(message); error.status = 409; error.duplicates = duplicates; return error; }
function validationError(message) { const error = new Error(message); error.status = 422; return error; }
function digits(value) { return String(value || '').replace(/\D/g, '').slice(0, 15); }
function cleanEmail(value) { const email = String(value || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 254) : ''; }
function cleanText(value, max) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max); }
function sanitizeObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function escapeLike(value) { return String(value).replace(/[\\%_]/g, '\\$&'); }
function clampInt(value, min, max, fallback) { const number = Number.parseInt(value, 10); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback; }
