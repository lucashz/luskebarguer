import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';

for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const index = line.indexOf('=');
  if (index > 0 && !line.startsWith('#')) process.env[line.slice(0, index).trim()] ??= line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('begin');
  const source = '/var/www/public/assets/marketing-template-pedido-completo.png';
  const buffer = fs.readFileSync(source); const checksum = createHash('sha256').update(buffer).digest('hex');
  const metadata = await sharp(buffer).metadata();
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const variant = Number((await client.query('select coalesce(max(variant),0)::int value from marketing_autopilot_runs where run_date=$1', [date])).rows[0].value) + 1;
  const objectPath = `social/autopilot/${date}-canonical-${randomBytes(5).toString('hex')}.png`;
  const destination = path.join('/var/www/uploads', objectPath); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, buffer, { flag: 'wx' });
  const account = (await client.query(`select id from social_accounts where status='connected' order by mode='live' desc,created_at desc limit 1`)).rows[0];
  const asset = (await client.query(`insert into social_media_assets(provider,kind,file_name,storage_path,public_url,content_type,size_bytes,width,height,aspect_ratio,checksum_sha256,processing_status,validation_details) values('instagram','image',$1,$2,$3,'image/png',$4,$5,$6,'1:1',$7,'ready',$8) returning *`, ['post-pedido-completo-canonical.png', objectPath, `https://taprontomenu.com.br/uploads/${objectPath}`, buffer.length, metadata.width, metadata.height, checksum, { generated_by: 'canonical_template', approved_visual: true }])).rows[0];
  const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const caption = `O cliente pediu. Sua equipe recebeu tudo certo?\n\nNo TáPronto, produtos, adicionais, endereço e observações chegam organizados em um só lugar. Sua equipe acompanha cada pedido por status e trabalha com menos adivinhação.\n\n✅ Menos confusão no atendimento. Mais clareza para preparar e entregar.\n\n👉 Veja como funciona pelo link da bio.`;
  const content = (await client.query(`insert into marketing_content_items(title,channel,format,pillar,funnel_stage,niche,objective,hook,caption,cta,overlay_text,aspect_ratio,alt_text,timezone,social_account_id,status,scheduled_at,hashtags,assets,utm_url,updated_at) values($1,'instagram','post','pedido organizado','consideration','restaurantes','Mostrar como o TáPronto organiza pedidos',$2,$3,'Ver como funciona',$4,'1:1',$5,'America/Sao_Paulo',$6,'draft',$7,$8,$9::jsonb,$10,now()) returning *`, ['Pedido completo, sem adivinhação', 'O cliente pediu. Sua equipe recebeu tudo certo?', caption, 'Pedido completo. Sem adivinhação.', 'Notebook exibindo o painel do TáPronto com pedidos organizados por status.', account?.id || null, scheduledAt, ['#TáPronto','#CardápioDigital','#PedidosOnline','#Restaurante','#Delivery'], JSON.stringify(['marketing-template-pedido-completo.png']), 'https://taprontomenu.com.br/?utm_source=instagram&utm_medium=organic&utm_campaign=pedido-completo-canonical'])).rows[0];
  await client.query(`insert into social_content_assets(content_id,asset_id,sort_order,role) values($1,$2,0,'media')`, [content.id, asset.id]);
  const run = (await client.query(`insert into marketing_autopilot_runs(run_date,variant,status,provider,topic_key,prompt,content_id,asset_id) values($1,$2,'ready','local','pedido-organizado','Modelo visual canônico aprovado pelo usuário.',$3,$4) returning *`, [date, variant, content.id, asset.id])).rows[0];
  await client.query('commit'); console.log(JSON.stringify({ content_id: content.id, asset_id: asset.id, run_id: run.id, public_url: asset.public_url }));
} catch (error) { await client.query('rollback'); throw error; }
finally { client.release(); await pool.end(); }
