export function suggestProductPhotoLinks({ files = [], draft = {} } = {}) {
  const items = (draft.categories || []).flatMap((category) => category.items || []);
  return files.filter((file) => file.purpose === 'product_photo').map((file) => {
    const fileTokens = tokens(removeExtension(file.original_name));
    const ranked = items.map((item) => ({ item, score: similarity(fileTokens, tokens(item.name)) })).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const unique = best?.score >= 0.6 && (!ranked[1] || best.score > ranked[1].score);
    return {
      file_id: file.id,
      draft_item_id: unique ? best.item.id : null,
      confidence: unique ? Number(best.score.toFixed(4)) : null,
      status: unique ? 'suggested' : 'pending',
      confirmed_at: null
    };
  });
}

export async function confirmProductPhotoLink(pool, registrationId, fileId, draftItemId, actorId) {
  const file = (await pool.query(`select id from assisted_registration_files where id=$1 and registration_id=$2 and purpose='product_photo' limit 1`, [fileId, registrationId])).rows[0];
  if (!file) throw notFound('Foto de produto não encontrada.');
  if (draftItemId !== null) {
    const draft = (await pool.query('select content from assisted_menu_drafts where registration_id=$1 limit 1', [registrationId])).rows[0];
    const exists = (draft?.content?.categories || []).some((category) => (category.items || []).some((item) => item.id === draftItemId));
    if (!exists) throw invalid('Produto do rascunho não encontrado.');
    await pool.query(`update assisted_product_photo_links set status='rejected',confirmed_at=now(),confirmed_by=$3,updated_at=now() where registration_id=$1 and draft_item_id=$2 and file_id<>$4 and status='confirmed'`, [registrationId, draftItemId, actorId, fileId]);
  }
  const status = draftItemId === null ? 'rejected' : 'confirmed';
  const result = await pool.query(`insert into assisted_product_photo_links (registration_id,file_id,draft_item_id,status,confirmed_by,confirmed_at)
    values ($1,$2,$3,$4,$5,now()) on conflict (file_id) do update set draft_item_id=excluded.draft_item_id,status=excluded.status,confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at,updated_at=now()
    returning id,registration_id,file_id,draft_item_id,confidence,status,confirmed_at`, [registrationId, fileId, draftItemId, status, actorId]);
  return result.rows[0];
}

function tokens(value) { return [...new Set(normalize(value).split(/[^a-z0-9]+/).filter((part) => part.length > 2 && !['foto','img','image'].includes(part)))]; }
function similarity(left, right) { if (!left.length || !right.length) return 0; const common = left.filter((part) => right.includes(part)).length; return common / Math.max(left.length, right.length); }
function removeExtension(value) { return String(value || '').replace(/\.[a-z0-9]{2,5}$/i, ''); }
function normalize(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function invalid(message) { const error = new Error(message); error.status = 422; return error; }
function notFound(message) { const error = new Error(message); error.status = 404; return error; }
