import { mergeAssistedMenuDraft } from './assisted-menu-import.js';
import { assertAssistedSetupMutable } from './assisted-registration-workflow.js';

export async function createImportRun(pool, registrationId, { mode = 'replace', text = '', actorId = null } = {}) {
  if (!['replace', 'append'].includes(mode)) throw invalid('Modo de importação inválido.');
  const normalizedText = String(text || '').trim();
  if (normalizedText.length > 100000) throw Object.assign(invalid('A lista colada excede 100 mil caracteres.'), { status: 413 });
  const result = await pool.query(`insert into assisted_menu_import_runs
    (registration_id,mode,source_text,created_by,status)
    values ($1,$2,$3,$4,'queued') returning *`, [registrationId, mode, normalizedText, actorId]);
  return publicImportRun(result.rows[0]);
}

export async function executeImportRun(pool, runId, dependencies = {}) {
  const claimed = await pool.query(`update assisted_menu_import_runs set status='processing',started_at=now(),updated_at=now(),attempts=attempts+1,error_code=null,error_message=null where id=$1 and status in ('queued','failed') returning *`, [runId]);
  if (!claimed.rows[0]) {
    const current = (await pool.query('select * from assisted_menu_import_runs where id=$1 limit 1', [runId])).rows[0];
    if (!current) throw Object.assign(new Error('Importação não encontrada.'), { status: 404 });
    return { run: publicImportRun(current), menu_draft: null };
  }
  const run = claimed.rows[0];
  try {
    const filesResult = await pool.query(`select * from assisted_registration_files where registration_id=$1 and purpose='menu_source' and status='uploaded' order by created_at`, [run.registration_id]);
    if (!filesResult.rows.length && !String(run.source_text || '').trim()) throw coded('no_sources', 'Envie um cardápio ou cole uma lista antes de interpretar.');
    const files = await Promise.all(filesResult.rows.map(dependencies.loadFile));
    const incoming = await dependencies.extract({ files, text: run.source_text, aiRequest: dependencies.aiRequest, normalizeImage: dependencies.normalizeImage });
    return await commitSuccessfulImport(pool, run, incoming);
  } catch (error) {
    if (error?.code === 'assisted_setup_locked') {
      await pool.query("update assisted_menu_import_runs set status='failed',error_code='setup_locked',error_message='A prévia já foi criada.',completed_at=now(),updated_at=now() where id=$1", [runId]);
      throw error;
    }
    const code = safeErrorCode(error.code || classifyError(error));
    const message = safeErrorMessage(error, code);
    const failed = (await pool.query(`update assisted_menu_import_runs set status='failed',error_code=$2,error_message=$3,completed_at=now(),updated_at=now() where id=$1 returning *`, [runId, code, message])).rows[0];
    await pool.query("update assisted_registrations set status='awaiting_menu',last_import_error_code=$2,updated_at=now() where id=$1 and status in ('new','in_progress','awaiting_menu','interpreting_menu','reviewing_menu','ready_for_preview')", [run.registration_id, code]);
    return { run: publicImportRun(failed), menu_draft: null };
  }
}

async function commitSuccessfulImport(pool, run, incoming) {
  const client = typeof pool.connect === 'function' ? await pool.connect() : pool;
  const transactional = client !== pool;
  try {
    if (transactional) await client.query('begin');
    const registration = (await client.query('select status from assisted_registrations where id=$1 for update', [run.registration_id])).rows[0];
    if (!registration) throw Object.assign(new Error('Cadastro assistido não encontrado.'), { status: 404 });
    assertAssistedSetupMutable(registration.status);
    const existingRow = (await client.query('select * from assisted_menu_drafts where registration_id=$1 limit 1', [run.registration_id])).rows[0];
    const content = mergeAssistedMenuDraft(existingRow?.content, incoming, run.mode);
    const counts = countDraft(content);
    const saved = await client.query(`insert into assisted_menu_drafts (registration_id,content,validation) values ($1,$2::jsonb,$3::jsonb)
      on conflict (registration_id) do update set content=excluded.content,validation=excluded.validation,version=assisted_menu_drafts.version+1,reviewed_at=null,reviewed_by=null,reviewed_hash=null,updated_at=now()
      returning id,registration_id,content,validation,version,reviewed_at,updated_at`, [run.registration_id, JSON.stringify(content), JSON.stringify({ needs_review: content.categories.some((group) => group.items.some((item) => item.needs_review)) })]);
    const completed = (await client.query(`update assisted_menu_import_runs set status='completed',category_count=$2,product_count=$3,completed_at=now(),updated_at=now() where id=$1 returning *`, [run.id, counts.category_count, counts.product_count])).rows[0];
    await client.query("update assisted_registrations set status='reviewing_menu',last_import_error_code=null,updated_at=now(),version=version+1 where id=$1", [run.registration_id]);
    if (transactional) await client.query('commit');
    return { run: publicImportRun(completed), menu_draft: saved.rows[0] };
  } catch (error) {
    if (transactional) await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    if (transactional) client.release();
  }
}

export async function retryImportRun(pool, runId) {
  const result = await pool.query(`update assisted_menu_import_runs set status='queued',error_code=null,error_message=null,completed_at=null,updated_at=now() where id=$1 and status='failed' returning *`, [runId]);
  if (!result.rows[0]) throw Object.assign(new Error('Somente importações com falha podem ser repetidas.'), { status: 409 });
  return publicImportRun(result.rows[0]);
}

export function publicImportRun(row = {}) {
  return { id: row.id, registration_id: row.registration_id, mode: row.mode, status: row.status, attempts: Number(row.attempts || 0), category_count: Number(row.category_count || 0), product_count: Number(row.product_count || 0), error_code: safeErrorCode(row.error_code), error_message: row.error_message || null, created_at: row.created_at || null, started_at: row.started_at || null, completed_at: row.completed_at || null, updated_at: row.updated_at || null };
}

function countDraft(content) { return { category_count: content.categories.length, product_count: content.categories.reduce((sum, category) => sum + category.items.length, 0) }; }
function classifyError(error) { if (error?.status === 422) return 'invalid_menu'; return 'provider_error'; }
function safeErrorCode(value) { const code = String(value || '').toLowerCase(); return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(code) ? code : 'import_failed'; }
function safeErrorMessage(error, code) { if (code === 'no_sources') return error.message; if (code === 'invalid_menu') return 'Não foi possível interpretar o cardápio. Revise o arquivo e tente novamente.'; return 'O serviço de interpretação não respondeu. Tente novamente.'; }
function invalid(message) { const error = new Error(message); error.status = 422; return error; }
function coded(code, message) { const error = invalid(message); error.code = code; return error; }
