import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const TOPICS = [
  { key: 'pedido-organizado', title: 'Pedido completo, sem adivinhação', pillar: 'pedido organizado', niche: 'restaurantes', hook: 'O cliente pediu. Sua equipe recebeu tudo certo?', overlay: 'Pedido completo. Sem adivinhação.', caption: 'Pedido espalhado em conversa dá margem para erro. No TáPronto, produtos, adicionais, endereço e observações chegam organizados para sua equipe.\n\nQuer ver funcionando? Acesse o link do perfil.', cta: 'Ver demonstração', reference: 'sistema-admin-pedidos-original.png' },
  { key: 'cardapio-online', title: 'Cardápio atualizado pelo celular', pillar: 'cardápio online', niche: 'lanchonetes', hook: 'Seu cardápio ainda é uma imagem desatualizada?', overlay: 'Seu cardápio sempre atualizado.', caption: 'Preço mudou? Produto acabou? Atualize o cardápio pelo celular e seu cliente já encontra a informação correta. Sem reenviar PDF ou imagem.\n\nCrie seu cardápio no TáPronto.', cta: 'Criar Meu Cardápio', reference: 'sistema-cardapio-preview.png' },
  { key: 'adicionais-claros', title: 'Adicionais claros no pedido', pillar: 'pedido organizado', niche: 'hamburguerias', hook: 'O adicional foi pedido. Mas chegou na cozinha?', overlay: 'Adicional certo. Pedido certo.', caption: 'Bacon, molho, ponto da carne e retirada de ingredientes precisam chegar claros. O TáPronto organiza cada escolha junto do pedido.\n\nTeste com um pedido de demonstração.', cta: 'Testar o TáPronto', reference: 'sistema-admin-produtos-original.png' },
  { key: 'painel-status', title: 'Cada pedido no status certo', pillar: 'operação', niche: 'pizzarias', hook: 'Quantos pedidos estão esperando agora?', overlay: 'Do novo ao entregue. Tudo visível.', caption: 'Novo, em preparo, pronto e entregue. Sua equipe acompanha cada pedido no painel e reduz a confusão no horário de pico.\n\nVeja uma demonstração do TáPronto.', cta: 'Ver demonstração', reference: 'sistema-admin-operacao.jpg' },
  { key: 'qr-code', title: 'Cardápio pelo QR Code', pillar: 'QR Code', niche: 'bares e cafeterias', hook: 'O cliente pode abrir o cardápio sem esperar.', overlay: 'Escaneou. Abriu. Pediu.', caption: 'Com o QR Code na mesa, o cliente abre o cardápio pelo próprio celular. Sua equipe continua atendendo, agora com menos repetição.\n\nCrie sua loja online em minutos.', cta: 'Criar Meu Cardápio', reference: 'sistema-cardapio-preview.png' },
  { key: 'pix-online', title: 'Pix confirmado antes do preparo', pillar: 'pagamento', niche: 'delivery', hook: 'Pix enviado não é Pix confirmado.', overlay: 'Pagamento confirmado. Pedido liberado.', caption: 'No Pix online, o pedido só é avisado para a loja depois da confirmação do pagamento. Mais clareza para o cliente e para sua equipe.\n\nConheça o TáPronto.', cta: 'Testar o TáPronto', reference: 'sistema-admin-configuracao.jpg' },
  { key: 'whatsapp-organizado', title: 'WhatsApp com menos bagunça', pillar: 'dor real', niche: 'pequenos restaurantes', hook: 'Seu WhatsApp virou uma fila sem controle?', overlay: 'WhatsApp aberto. Pedidos organizados.', caption: 'Você não precisa abandonar o WhatsApp. Use o TáPronto para receber o pedido completo e mantenha a conversa para o que realmente precisa de atendimento.\n\nVeja como funciona.', cta: 'Ver demonstração', reference: 'sistema-admin-pedidos-original.png' }
];

let pool;
function databasePool(env = process.env) {
  if (!pool) pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2, ssl: env.DB_SSL === 'true' || /sslmode=require/i.test(env.DATABASE_URL || '') ? { rejectUnauthorized: false } : false });
  return pool;
}

export function autopilotConfig(env = process.env) {
  return {
    apiKey: env.OPENAI_API_KEY || '',
    model: env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
    quality: ['low', 'medium', 'high', 'auto'].includes(env.OPENAI_IMAGE_QUALITY) ? env.OPENAI_IMAGE_QUALITY : 'medium',
    baseUrl: String(env.PUBLIC_BASE_URL || env.APP_BASE_URL || 'https://taprontomenu.com.br').replace(/\/$/, ''),
    rootDir: env.APP_ROOT ? path.resolve(env.APP_ROOT) : path.resolve(process.cwd()),
    uploadDir: path.resolve(env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'))
  };
}

export async function autopilotDashboard(env = process.env) {
  const db = databasePool(env);
  const [settings, runs, accounts] = await Promise.all([
    db.query('select * from marketing_autopilot_settings where id=1'),
    db.query(`select r.*,row_to_json(c.*) content,row_to_json(a.*) asset from marketing_autopilot_runs r left join marketing_content_items c on c.id=r.content_id left join social_media_assets a on a.id=r.asset_id order by r.run_date desc,r.variant desc limit 40`),
    db.query(`select id,username,display_name,mode,status,publishing_paused from social_accounts where status='connected' order by mode='live' desc,created_at desc limit 5`)
  ]);
  const today = localDateKey(new Date());
  const todayRuns = runs.rows.filter((item) => databaseDateKey(item.run_date) === today && item.status !== 'discarded');
  const todayRun = todayRuns.find((item) => ['ready', 'approved'].includes(item.status)) || todayRuns.find((item) => item.status === 'generating') || todayRuns.find((item) => item.status === 'failed') || null;
  return { settings: settings.rows[0], today: todayRun, history: runs.rows, accounts: accounts.rows, image_generation_ready: Boolean(autopilotConfig(env).apiKey), mode: autopilotConfig(env).apiKey ? 'openai' : 'simulation' };
}

export async function updateAutopilotSettings(data = {}, adminId = null, env = process.env) {
  const enabled = data.enabled !== false;
  const generationTime = validTime(data.generation_time, '08:00');
  const publicationTime = validTime(data.publication_time, '10:00');
  const quality = ['low', 'medium', 'high', 'auto'].includes(data.image_quality) ? data.image_quality : 'medium';
  const db = databasePool(env);
  const result = await db.query(`update marketing_autopilot_settings set enabled=$1,generation_time=$2,publication_time=$3,image_quality=$4,approval_required=true,updated_by=$5,updated_at=now() where id=1 returning *`, [enabled, generationTime, publicationTime, quality, adminId]);
  return result.rows[0];
}

export async function generateDailyAutopilotPost({ force = false, createdBy = null, env = process.env } = {}) {
  const config = autopilotConfig(env);
  const db = databasePool(env);
  const client = await db.connect();
  let run;
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(hashtext('tapronto-marketing-autopilot'))`);
    const settingsResult = await client.query('select * from marketing_autopilot_settings where id=1 for update');
    const settings = settingsResult.rows[0];
    if (!settings?.enabled && !force) { await client.query('rollback'); return null; }
    if (!force && localTimeKey(new Date()) < String(settings?.generation_time || '08:00').slice(0, 5)) { await client.query('rollback'); return null; }
    const runDate = localDateKey(new Date());
    const previous = await client.query('select * from marketing_autopilot_runs where run_date=$1 order by variant desc', [runDate]);
    if (!force && previous.rows.find((item) => ['generating','ready','approved'].includes(item.status))) { await client.query('rollback'); return previous.rows.find((item) => ['generating','ready','approved'].includes(item.status)); }
    const variant = (previous.rows[0]?.variant || 0) + 1;
    if (variant > 20) throw new Error('Limite diário de novas opções atingido.');
    const topic = chooseTopic(runDate, variant);
    const prompt = imagePrompt(topic, variant);
    const inserted = await client.query(`insert into marketing_autopilot_runs(run_date,variant,status,provider,topic_key,prompt,created_by) values($1,$2,'generating',$3,$4,$5,$6) returning *`, [runDate, variant, config.apiKey ? 'openai' : 'simulation', topic.key, prompt, createdBy]);
    run = inserted.rows[0];
    await client.query('commit');

    const asset = await createAutopilotAsset(topic, run, config, settings?.image_quality || config.quality, createdBy, db);
    const account = (await db.query(`select id from social_accounts where status='connected' order by mode='live' desc,created_at desc limit 1`)).rows[0];
    const scheduledAt = futurePublicationTime(runDate, String(settings?.publication_time || '10:00'));
    const contentResult = await db.query(`insert into marketing_content_items(title,channel,format,pillar,funnel_stage,niche,objective,hook,caption,cta,overlay_text,aspect_ratio,alt_text,timezone,social_account_id,status,scheduled_at,hashtags,assets,utm_url,created_by,updated_at) values($1,'instagram','post',$2,'consideration',$3,'Gerar interesse qualificado',$4,$5,$6,$7,'1:1',$8,'America/Sao_Paulo',$9,'draft',$10,$11,$12::jsonb,$13,$14,now()) returning *`, [topic.title, topic.pillar, topic.niche, topic.hook, topic.caption, topic.cta, topic.overlay, topic.overlay, account?.id || null, scheduledAt, ['tapronto','cardapiodigital','pedidosonline','restaurante','delivery'], JSON.stringify([topic.reference]), `${config.baseUrl}/?utm_source=instagram&utm_medium=organic&utm_campaign=post-diario-${topic.key}`, createdBy]);
    const content = contentResult.rows[0];
    await db.query(`insert into social_content_assets(content_id,asset_id,sort_order,role) values($1,$2,0,'media')`, [content.id, asset.id]);
    await db.query(`update marketing_autopilot_runs set status='ready',content_id=$1,asset_id=$2,updated_at=now() where id=$3`, [content.id, asset.id, run.id]);
    if (force) await db.query(`update marketing_autopilot_runs set status='discarded',updated_at=now() where run_date=$1 and id<>$2 and status='ready'`, [runDate, run.id]);
    return { ...run, status: 'ready', content_id: content.id, asset_id: asset.id, content, asset };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    if (run?.id) await db.query(`update marketing_autopilot_runs set status='failed',error_message=$1,updated_at=now() where id=$2`, [String(error.message || error).slice(0, 1000), run.id]).catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function createAutopilotAsset(topic, run, config, quality, createdBy, db) {
  const referencePath = path.join(config.rootDir, 'public', 'assets', topic.reference);
  if (!existsSync(referencePath)) throw new Error(`Imagem de referência não encontrada: ${topic.reference}`);
  let buffer;
  let provider = 'simulation';
  if (config.apiKey) {
    buffer = await requestOpenAiImage(await readFile(referencePath), topic.reference, run.prompt, config, quality);
    provider = 'openai';
  } else buffer = await readFile(referencePath);
  const extension = buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? '.png' : '.jpg';
  const contentType = extension === '.png' ? 'image/png' : 'image/jpeg';
  const checksum = createHash('sha256').update(buffer).digest('hex');
  const duplicate = await db.query(`select * from social_media_assets where checksum_sha256=$1 and processing_status<>'deleted' limit 1`, [checksum]);
  if (duplicate.rows[0]) return duplicate.rows[0];
  const objectPath = `social/autopilot/${databaseDateKey(run.run_date)}-${run.variant}-${randomBytes(5).toString('hex')}${extension}`;
  const fullPath = path.join(config.uploadDir, objectPath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer, { flag: 'wx' });
  const publicUrl = `${config.baseUrl}/uploads/${objectPath.replaceAll(path.sep, '/')}`;
  const inserted = await db.query(`insert into social_media_assets(provider,kind,file_name,storage_path,public_url,content_type,size_bytes,width,height,aspect_ratio,checksum_sha256,processing_status,validation_details,created_by) values('instagram','image',$1,$2,$3,$4,$5,1024,1024,'1:1',$6,'ready',$7,$8) returning *`, [`post-${run.run_date}-v${run.variant}${extension}`, objectPath, publicUrl, contentType, buffer.length, checksum, { generated_by: provider, topic: topic.key }, createdBy]);
  return inserted.rows[0];
}

async function requestOpenAiImage(reference, fileName, prompt, config, quality) {
  const form = new FormData();
  form.append('model', config.model);
  form.append('prompt', prompt);
  form.append('size', '1024x1024');
  form.append('quality', quality);
  form.append('output_format', 'png');
  form.append('image[]', new Blob([reference], { type: fileName.endsWith('.png') ? 'image/png' : 'image/jpeg' }), fileName);
  const response = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}` }, body: form, signal: AbortSignal.timeout(180000) });
  const payload = await response.json();
  if (!response.ok || !payload.data?.[0]?.b64_json) throw new Error(`OpenAI Image: ${payload.error?.message || `HTTP ${response.status}`}`);
  const buffer = Buffer.from(payload.data[0].b64_json, 'base64');
  if (buffer.length < 10_000 || buffer.length > 12 * 1024 * 1024) throw new Error('A imagem gerada possui tamanho inválido.');
  return buffer;
}

function imagePrompt(topic, variant) {
  return `Use case: ads-marketing\nAsset type: post quadrado do Instagram do TáPronto\nPrimary request: crie uma arte brasileira, simples e profissional sobre ${topic.title}. Use a captura fornecida como referência visual real do produto, mantendo a tela legível e sem deformá-la.\nComposition: captura do sistema em destaque dentro de um celular ou notebook realista; bastante respiro; hierarquia clara para celular.\nColor palette: vermelho #ed1c24, branco e azul-marinho #12213d.\nText (verbatim): "${topic.overlay}"\nConstraints: escreva o texto exatamente em português; no máximo uma frase; preserve a aparência da interface; formato 1:1; variação criativa ${variant}.\nAvoid: letras deformadas, telas retorcidas, texto minúsculo, excesso de elementos, promessas exageradas, marcas de terceiros, watermark.`;
}

function chooseTopic(date, variant) {
  const index = Math.abs(Number(String(date).replaceAll('-', '')) + variant - 1) % TOPICS.length;
  return TOPICS[index];
}
function validTime(value, fallback) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')) ? String(value) : fallback; }
function localDateKey(date) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function databaseDateKey(value) { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10); }
function localTimeKey(date) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(date); }
function futurePublicationTime(date, time) {
  const candidate = new Date(`${date}T${validTime(time, '10:00')}:00-03:00`);
  if (candidate <= new Date()) candidate.setTime(Date.now() + 15 * 60 * 1000);
  return candidate.toISOString();
}
