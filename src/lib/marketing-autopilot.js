import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { auditMarketingContent } from './marketing-content-intelligence.js';

const TOPICS = [
  { key: 'pedido-organizado', title: 'Pedido completo, sem adivinhação', pillar: 'pedido organizado', niche: 'restaurantes', hook: 'O cliente pediu. Sua equipe recebeu tudo certo?', overlay: 'Pedido completo. Sem adivinhação.', caption: 'Pedido espalhado em conversa dá margem para erro. No TáPronto, produtos, adicionais, endereço e observações chegam organizados para sua equipe.\n\nQuer ver funcionando? Acesse o link do perfil.', cta: 'Ver demonstração', reference: 'sistema-admin-pedidos-original.png' },
  { key: 'cardapio-online', title: 'Cardápio atualizado pelo celular', pillar: 'cardápio online', niche: 'lanchonetes', hook: 'Seu cardápio ainda é uma imagem desatualizada?', overlay: 'Seu cardápio sempre atualizado.', caption: 'Preço mudou? Produto acabou? Atualize o cardápio pelo celular e seu cliente já encontra a informação correta. Sem reenviar PDF ou imagem.\n\nCrie seu cardápio no TáPronto.', cta: 'Criar Meu Cardápio', reference: 'sistema-cardapio-preview.png' },
  { key: 'adicionais-claros', title: 'Adicionais claros no pedido', pillar: 'pedido organizado', niche: 'hamburguerias', hook: 'O adicional foi pedido. Mas chegou na cozinha?', overlay: 'Adicional certo. Pedido certo.', caption: 'Bacon, molho, ponto da carne e retirada de ingredientes precisam chegar claros. O TáPronto organiza cada escolha junto do pedido.\n\nTeste com um pedido de demonstração.', cta: 'Testar o TáPronto', reference: 'sistema-admin-produtos-original.png' },
  { key: 'painel-status', title: 'Cada pedido no status certo', pillar: 'operação', niche: 'pizzarias', hook: 'Quantos pedidos estão esperando agora?', overlay: 'Do novo ao entregue. Tudo visível.', caption: 'Novo, em preparo, pronto e entregue. Sua equipe acompanha cada pedido no painel e reduz a confusão no horário de pico.\n\nVeja uma demonstração do TáPronto.', cta: 'Ver demonstração', reference: 'sistema-admin-operacao.jpg' },
  { key: 'qr-code', title: 'Cardápio pelo QR Code', pillar: 'QR Code', niche: 'bares e cafeterias', hook: 'O cliente pode abrir o cardápio sem esperar.', overlay: 'Escaneou. Abriu. Pediu.', caption: 'Com o QR Code na mesa, o cliente abre o cardápio pelo próprio celular. Sua equipe continua atendendo, agora com menos repetição.\n\nCrie sua loja online em minutos.', cta: 'Criar Meu Cardápio', reference: 'sistema-cardapio-preview.png' },
  { key: 'pix-online', title: 'Pix confirmado antes do preparo', pillar: 'pagamento', niche: 'delivery', hook: 'Pix enviado não é Pix confirmado.', overlay: 'Pagamento confirmado. Pedido liberado.', caption: 'No Pix online, o pedido só é avisado para a loja depois da confirmação do pagamento. Mais clareza para o cliente e para sua equipe.\n\nConheça o TáPronto.', cta: 'Testar o TáPronto', reference: 'sistema-admin-configuracao.jpg' },
  { key: 'whatsapp-organizado', title: 'WhatsApp com menos bagunça', pillar: 'dor real', niche: 'pequenos restaurantes', hook: 'Seu WhatsApp virou uma fila sem controle?', overlay: 'WhatsApp aberto. Pedidos organizados.', caption: 'Você não precisa abandonar o WhatsApp. Use o TáPronto para receber o pedido completo e mantenha a conversa para o que realmente precisa de atendimento.\n\nVeja como funciona.', cta: 'Ver demonstração', reference: 'sistema-admin-pedidos-original.png' }
];

const BASE_HASHTAGS = ['TáPronto', 'CardápioDigital', 'PedidosOnline'];
const NICHE_HASHTAGS = {
  restaurantes: ['Restaurante', 'GestãoDeRestaurante'],
  lanchonetes: ['Lanchonete', 'Delivery'],
  hamburguerias: ['Hamburgueria', 'Delivery'],
  pizzarias: ['Pizzaria', 'Delivery'],
  'bares e cafeterias': ['Cafeteria', 'Bar'],
  delivery: ['Delivery', 'PedidoOnline'],
  'pequenos restaurantes': ['PequenoRestaurante', 'Delivery']
};

let pool;
function databasePool(env = process.env) {
  if (!pool) pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2, ssl: env.DB_SSL === 'true' || /sslmode=require/i.test(env.DATABASE_URL || '') ? { rejectUnauthorized: false } : false });
  return pool;
}

export function autopilotConfig(env = process.env) {
  const requestedProvider = String(env.MARKETING_IMAGE_PROVIDER || 'local').toLowerCase();
  return {
    apiKey: env.OPENAI_API_KEY || '',
    imageProvider: requestedProvider === 'openai' ? 'openai' : 'local',
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
  const config = autopilotConfig(env);
  return { settings: settings.rows[0], today: todayRun, history: runs.rows, accounts: accounts.rows, image_generation_ready: true, mode: config.imageProvider, image_provider: config.imageProvider };
}

export async function updateAutopilotSettings(data = {}, adminId = null, env = process.env) {
  const enabled = data.enabled !== false;
  const generationTime = validTime(data.generation_time, '08:00');
  const publicationTime = validTime(data.publication_time, '10:00');
  const quality = ['low', 'medium', 'high', 'auto'].includes(data.image_quality) ? data.image_quality : 'medium';
  const days = arrayValues(data.days_of_week).map(Number).filter((value) => value >= 1 && value <= 7);
  const postsPerDay = Math.max(1, Math.min(3, Number(data.posts_per_day) || 1));
  const audience = cleanText(data.audience, 300, 'Donos de pequenos restaurantes, lanchonetes e delivery');
  const niches = arrayValues(data.priority_niches).map((value) => cleanText(value, 60)).filter(Boolean).slice(0, 12);
  const tone = cleanText(data.communication_tone, 160, 'simples, direto e útil');
  const ctas = arrayValues(data.preferred_ctas).map((value) => cleanText(value, 80)).filter(Boolean).slice(0, 8);
  const formats = arrayValues(data.enabled_formats).filter((value) => ['post','carrossel','story','reel'].includes(value));
  const avoided = cleanText(data.avoided_topics, 600, '');
  const imageStyle = ['product_device','real_screenshot','before_after','food','illustration','mixed'].includes(data.image_style) ? data.image_style : 'product_device';
  const aspect = ['1:1','4:5','9:16'].includes(data.image_aspect_ratio) ? data.image_aspect_ratio : '1:1';
  const logoPosition = ['top_left','top_right','bottom_left','bottom_right'].includes(data.logo_position) ? data.logo_position : 'bottom_right';
  const brandIntensity = ['subtle','balanced','strong'].includes(data.brand_intensity) ? data.brand_intensity : 'balanced';
  const pauseDates = arrayValues(data.pause_dates).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)).slice(0, 60);
  const contentMix = normalizeContentMix(data.content_mix);
  const db = databasePool(env);
  const result = await db.query(`update marketing_autopilot_settings set enabled=$1,generation_time=$2,publication_time=$3,image_quality=$4,approval_required=true,updated_by=$5,days_of_week=$6,posts_per_day=$7,audience=$8,priority_niches=$9,communication_tone=$10,preferred_ctas=$11,enabled_formats=$12,avoided_topics=$13,notify_ready=$14,notify_published=$15,notify_failed=$16,notify_disconnected=$17,image_generation_enabled=$18,image_style=$19,image_aspect_ratio=$20,image_options=$21,logo_enabled=$22,logo_position=$23,brand_intensity=$24,max_overlay_words=$25,monthly_image_limit=$26,topic_cooldown_days=$27,pause_dates=$28,seasonal_dates_enabled=$29,content_mix=$30,updated_at=now() where id=1 returning *`, [enabled, generationTime, publicationTime, quality, adminId, days.length ? days : [1,2,3,4,5,6,7], postsPerDay, audience, niches, tone, ctas, formats.length ? formats : ['post'], avoided, data.notify_ready !== false, data.notify_published !== false, data.notify_failed !== false, data.notify_disconnected !== false, data.image_generation_enabled !== false, imageStyle, aspect, clamp(data.image_options,1,4,1), data.logo_enabled !== false, logoPosition, brandIntensity, clamp(data.max_overlay_words,3,16,8), clamp(data.monthly_image_limit,1,500,60), clamp(data.topic_cooldown_days,1,30,7), pauseDates, data.seasonal_dates_enabled !== false, contentMix]);
  return result.rows[0];
}

export async function selectAutopilotVersion(runId, env = process.env) {
  const db = databasePool(env); const client = await db.connect();
  try {
    await client.query('begin');
    const selected = (await client.query(`select * from marketing_autopilot_runs where id=$1 and status in ('ready','discarded') for update`, [runId])).rows[0];
    if (!selected) throw new Error('Versão não encontrada ou já aprovada.');
    await client.query(`update marketing_autopilot_runs set status='discarded',updated_at=now() where run_date=$1 and status='ready'`, [selected.run_date]);
    await client.query(`update marketing_autopilot_runs set status='ready',updated_at=now() where id=$1`, [selected.id]);
    await client.query('commit'); return selected;
  } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
}

export async function generateDailyAutopilotPost({ force = false, createdBy = null, targetDate = '', planning = false, env = process.env } = {}) {
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
    const runDate = /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? targetDate : localDateKey(new Date());
    const targetDay = new Date(`${runDate}T12:00:00-03:00`); const weekday = targetDay.getDay() || 7;
    if (!force && Array.isArray(settings?.days_of_week) && !settings.days_of_week.includes(weekday)) { await client.query('rollback'); return null; }
    if (!force && !planning && localTimeKey(new Date()) < String(settings?.generation_time || '08:00').slice(0, 5)) { await client.query('rollback'); return null; }
    if (!force && (settings?.pause_dates || []).some((value) => databaseDateKey(value) === runDate)) { await client.query('rollback'); return null; }
    const monthUsage = Number((await client.query(`select count(*)::int total from marketing_autopilot_runs where provider='openai' and status not in ('failed') and run_date>=date_trunc('month',$1::date)`, [runDate])).rows[0]?.total || 0);
    if (config.imageProvider === 'openai' && config.apiKey && monthUsage >= Number(settings?.monthly_image_limit || 60)) throw new Error('Limite mensal de imagens atingido. Ajuste o limite nas Configurações.');
    const previous = await client.query('select * from marketing_autopilot_runs where run_date=$1 order by variant desc', [runDate]);
    if (!force && previous.rows.find((item) => ['generating','ready','approved'].includes(item.status))) { await client.query('rollback'); return previous.rows.find((item) => ['generating','ready','approved'].includes(item.status)); }
    const variant = (previous.rows[0]?.variant || 0) + 1;
    if (variant > 20) throw new Error('Limite diário de novas opções atingido.');
    const topic = chooseTopic(runDate, variant);
    const prompt = imagePrompt(topic, variant, settings);
    const inserted = await client.query(`insert into marketing_autopilot_runs(run_date,variant,status,provider,topic_key,prompt,created_by) values($1,$2,'generating',$3,$4,$5,$6) returning *`, [runDate, variant, config.imageProvider, topic.key, prompt, createdBy]);
    run = inserted.rows[0];
    await client.query('commit');

    const asset = await createAutopilotAsset(topic, run, config, settings, createdBy, db);
    const account = (await db.query(`select id from social_accounts where status='connected' order by mode='live' desc,created_at desc limit 1`)).rows[0];
    const scheduledAt = futurePublicationTime(runDate, String(settings?.publication_time || '10:00'));
    const contentFormat = settings?.image_aspect_ratio === '9:16' ? 'story' : 'post';
    const recentContent = (await db.query(`select id,title,hook,pillar,niche from marketing_content_items where channel='instagram' order by created_at desc limit 12`)).rows;
    const postPackage = buildPostPackage(topic, settings, config, recentContent);
    const contentResult = await db.query(`insert into marketing_content_items(title,channel,format,pillar,funnel_stage,niche,objective,hook,caption,cta,overlay_text,aspect_ratio,alt_text,timezone,social_account_id,status,scheduled_at,hashtags,assets,utm_url,created_by,updated_at) values($1,'instagram',$2,$3,'consideration',$4,'Gerar interesse qualificado',$5,$6,$7,$8,$9,$10,'America/Sao_Paulo',$11,'draft',$12,$13,$14::jsonb,$15,$16,now()) returning *`, [topic.title, contentFormat, topic.pillar, topic.niche, topic.hook, postPackage.caption, postPackage.cta, topic.overlay, settings?.image_aspect_ratio || '1:1', postPackage.altText, account?.id || null, scheduledAt, postPackage.hashtags, JSON.stringify([topic.reference]), postPackage.utmUrl, createdBy]);
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

export async function generateAutopilotSchedule({ days = 7, createdBy = null, env = process.env } = {}) {
  const total = Math.max(1, Math.min(30, Number(days) || 7)); const posts = [];
  for (let offset = 0; offset < total; offset += 1) {
    const date = new Date(); date.setDate(date.getDate() + offset);
    const result = await generateDailyAutopilotPost({ createdBy, targetDate: localDateKey(date), planning: true, env });
    if (result) posts.push(result);
  }
  return posts;
}

function buildPostPackage(topic, settings, config, recentContent = []) {
  const preferredCta = arrayValues(settings?.preferred_ctas).map((value) => cleanText(value, 80)).find(Boolean);
  const cta = preferredCta || topic.cta;
  const hashtags = [...new Set([...BASE_HASHTAGS, ...(NICHE_HASHTAGS[topic.niche] || ['Restaurante', 'Delivery'])])].slice(0, 7);
  const explanation = cleanText(String(topic.caption || '').split(/\n\n/)[0], 1200);
  const caption = `${topic.hook}\n\n${explanation}\n\n✅ Menos confusão para sua equipe e uma experiência mais clara para o cliente.\n\n👉 ${cta} pelo link da bio.`;
  const postPackage = {
    caption,
    cta,
    hashtags: hashtags.map((tag) => `#${tag}`),
    altText: `Tela do TáPronto mostrando ${topic.pillar}, com a mensagem: ${topic.overlay}`,
    utmUrl: `${config.baseUrl}/?utm_source=instagram&utm_medium=organic&utm_campaign=post-diario-${topic.key}`
  };
  const audit = auditMarketingContent({ title: topic.title, hook: topic.hook, caption: postPackage.caption, cta: postPackage.cta, overlay_text: topic.overlay, utm_url: postPackage.utmUrl, hashtags: postPackage.hashtags }, recentContent);
  if (audit.score < 80) throw new Error(`A copy não atingiu o padrão mínimo de qualidade (${audit.score}%).`);
  return postPackage;
}

async function createAutopilotAsset(topic, run, config, settings, createdBy, db) {
  const referencePath = path.join(config.rootDir, 'public', 'assets', topic.reference);
  if (!existsSync(referencePath)) throw new Error(`Imagem de referência não encontrada: ${topic.reference}`);
  let buffer;
  let provider = 'local';
  if (config.imageProvider === 'openai' && config.apiKey && settings?.image_generation_enabled !== false) {
    buffer = await requestOpenAiImage(await readFile(referencePath), topic.reference, run.prompt, config, settings?.image_quality || config.quality, settings?.image_aspect_ratio || '1:1');
    provider = 'openai';
  } else buffer = await renderLocalMarketingImage(topic, referencePath, config, settings, run.variant);
  const aspect = settings?.image_aspect_ratio || '1:1';
  const dimensions = aspect === '9:16' ? [1080, 1920] : aspect === '4:5' ? [1080, 1350] : [1080, 1080];
  buffer = await sharp(buffer).rotate().resize(dimensions[0], dimensions[1], { fit: 'contain', background: '#f5f6f8' }).png({ compressionLevel: 9 }).toBuffer();
  const extension = '.png';
  const contentType = extension === '.png' ? 'image/png' : 'image/jpeg';
  const checksum = createHash('sha256').update(buffer).digest('hex');
  const duplicate = await db.query(`select * from social_media_assets where checksum_sha256=$1 and processing_status<>'deleted' limit 1`, [checksum]);
  if (duplicate.rows[0]) return duplicate.rows[0];
  const objectPath = `social/autopilot/${databaseDateKey(run.run_date)}-${run.variant}-${randomBytes(5).toString('hex')}${extension}`;
  const fullPath = path.join(config.uploadDir, objectPath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer, { flag: 'wx' });
  const publicUrl = `${config.baseUrl}/uploads/${objectPath.replaceAll(path.sep, '/')}`;
  const inserted = await db.query(`insert into social_media_assets(provider,kind,file_name,storage_path,public_url,content_type,size_bytes,width,height,aspect_ratio,checksum_sha256,processing_status,validation_details,created_by) values('instagram','image',$1,$2,$3,$4,$5,$6,$7,$8,$9,'ready',$10,$11) returning *`, [`post-${run.run_date}-v${run.variant}${extension}`, objectPath, publicUrl, contentType, buffer.length, dimensions[0], dimensions[1], aspect, checksum, { generated_by: provider, topic: topic.key, style: settings?.image_style || 'product_device' }, createdBy]);
  return inserted.rows[0];
}

async function requestOpenAiImage(reference, fileName, prompt, config, quality, aspect = '1:1') {
  const form = new FormData();
  form.append('model', config.model);
  form.append('prompt', prompt);
  form.append('size', aspect === '9:16' || aspect === '4:5' ? '1024x1536' : '1024x1024');
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

async function renderLocalMarketingImage(topic, referencePath, config, settings = {}, variant = 1) {
  const aspect = settings?.image_aspect_ratio || '1:1';
  const canonicalTemplate = path.join(config.rootDir, 'public', 'assets', 'marketing-template-pedido-completo.png');
  if (topic.key === 'pedido-organizado' && aspect === '1:1' && existsSync(canonicalTemplate)) return readFile(canonicalTemplate);
  const [width, height] = aspect === '9:16' ? [1080, 1920] : aspect === '4:5' ? [1080, 1350] : [1080, 1080];
  const padding = Math.round(width * 0.065); const accent = '#ed1c24';
  const headerHeight = aspect === '9:16' ? 500 : Math.round(height * .31);
  const deviceTop = headerHeight; const deviceWidth = width - padding * 2; const deviceHeight = height - deviceTop - Math.round(padding * .8);
  const screenInset = Math.round(deviceWidth * .025); const baseHeight = Math.max(42, Math.round(deviceHeight * .07));
  const screenWidth = deviceWidth - screenInset * 2; const screenHeight = deviceHeight - screenInset * 2 - baseHeight;
  const sentences = String(topic.overlay || topic.title).match(/[^.!?]+[.!?]?/g) || [topic.title];
  const redLine = sentences.shift()?.trim() || topic.title; const navyLines = wrapOverlay(sentences.join(' ').trim() || topic.title, aspect === '9:16' ? 20 : 25);
  const fontSize = aspect === '9:16' ? 76 : 65;
  const lineHeight = Math.round(fontSize * 1.08);
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#f7f7f7"/></linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <path d="M0 ${height - 150} Q${width * .22} ${height - 300} ${width * .48} ${height - 100} T${width} ${height - 160} V${height} H0Z" fill="${accent}"/>
    <text x="${padding}" y="${Math.round(padding * 1.75)}" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="800" fill="${accent}">${escapeSvg(redLine)}</text>
    ${navyLines.map((line, index) => `<text x="${padding}" y="${Math.round(padding * 2.85) + index * lineHeight}" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="800" fill="#12213d">${escapeSvg(line)}</text>`).join('')}
    <rect x="${padding}" y="${deviceTop}" width="${deviceWidth}" height="${deviceHeight - baseHeight}" rx="30" fill="#101214" stroke="#313438" stroke-width="8"/>
    <circle cx="${width / 2}" cy="${deviceTop + 12}" r="4" fill="#050505"/>
    <rect x="${padding + screenInset}" y="${deviceTop + screenInset}" width="${screenWidth}" height="${screenHeight}" rx="12" fill="#ffffff"/>
    <path d="M${padding - 22} ${height - baseHeight - 8} H${width - padding + 22} L${width - padding + 2} ${height - 10} H${padding - 2}Z" fill="#222528" stroke="#0b0c0d" stroke-width="5"/>
    <rect x="${width / 2 - 68}" y="${height - baseHeight - 2}" width="136" height="12" rx="6" fill="#55595d"/>
  </svg>`;
  const screenshot = await sharp(referencePath).rotate().resize(screenWidth, screenHeight, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
  const mask = Buffer.from(`<svg width="${screenWidth}" height="${screenHeight}"><rect width="100%" height="100%" rx="10" fill="white"/></svg>`);
  const roundedScreenshot = await sharp(screenshot).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const composites = [{ input: roundedScreenshot, left: padding + screenInset, top: deviceTop + screenInset }];
  const logoPath = path.join(config.rootDir, 'public', 'assets', 'tapronto-logo.png');
  if (existsSync(logoPath) && settings?.logo_enabled !== false) {
    const logo = await sharp(logoPath).resize({ width: Math.round(width * .22) }).png().toBuffer();
    composites.push({ input: logo, left: width - padding - Math.round(width * .22), top: Math.round(padding * .75) });
  }
  return sharp(Buffer.from(svg)).composite(composites).png({ compressionLevel: 9 }).toBuffer();
}

function wrapOverlay(value, maxChars) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  for (const word of words) {
    const current = lines.at(-1) || '';
    if (!current || `${current} ${word}`.length > maxChars) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  return lines.slice(0, 3);
}

function escapeSvg(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function imagePrompt(topic, variant, settings = {}) {
  const styles = { product_device: 'captura do sistema em destaque dentro de um celular ou notebook realista', real_screenshot: 'captura real grande, nítida e sem mockup decorativo', before_after: 'comparação visual limpa entre pedido desorganizado e pedido organizado', food: 'fotografia brasileira de comida combinada com uma captura discreta do produto', illustration: 'ilustração editorial simples combinada com a interface real', mixed: 'escolha a composição mais clara entre produto, comparação e situação real' };
  return `Use case: ads-marketing\nAsset type: post do Instagram do TáPronto em formato ${settings.image_aspect_ratio || '1:1'}\nPrimary request: crie uma arte brasileira, simples e profissional sobre ${topic.title}. Use a captura fornecida como referência visual real do produto, mantendo a tela legível e sem deformá-la.\nComposition: ${styles[settings.image_style] || styles.product_device}; bastante respiro; hierarquia clara para celular.\nColor palette: vermelho #ed1c24, branco e azul-marinho #12213d; presença da marca ${settings.brand_intensity || 'balanced'}.\nText (verbatim): "${topic.overlay}"\nLogo: ${settings.logo_enabled === false ? 'não inserir logotipo' : `usar o logotipo TáPronto de forma discreta em ${settings.logo_position || 'bottom_right'}`}\nConstraints: escreva o texto exatamente em português; até ${Number(settings.max_overlay_words || 8)} palavras; preserve a aparência da interface; variação criativa ${variant}.\nAvoid: letras deformadas, telas retorcidas, texto minúsculo, excesso de elementos, promessas exageradas, marcas de terceiros, watermark.`;
}

function chooseTopic(date, variant) {
  const index = Math.abs(Number(String(date).replaceAll('-', '')) + variant - 1) % TOPICS.length;
  return TOPICS[index];
}
function validTime(value, fallback) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')) ? String(value) : fallback; }
function arrayValues(value) { return Array.isArray(value) ? value : String(value || '').split(',').map((item) => item.trim()).filter(Boolean); }
function cleanText(value, max, fallback = '') { const result = String(value ?? fallback).replace(/[\u0000-\u001f]/g, ' ').trim(); return (result || fallback).slice(0, max); }
function clamp(value, min, max, fallback) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback; }
function normalizeContentMix(value) { const source = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return {}; } })() : (value || {}); const result = {}; for (const key of ['product','education','pain','conversion']) result[key] = clamp(source[key], 0, 100, { product:35,education:25,pain:25,conversion:15 }[key]); return result; }
function localDateKey(date) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function databaseDateKey(value) { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10); }
function localTimeKey(date) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(date); }
function futurePublicationTime(date, time) {
  const candidate = new Date(`${date}T${validTime(time, '10:00')}:00-03:00`);
  if (candidate <= new Date()) candidate.setTime(Date.now() + 15 * 60 * 1000);
  return candidate.toISOString();
}
