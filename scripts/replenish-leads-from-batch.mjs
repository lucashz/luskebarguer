import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import {
  evolutionV2SalesConfig,
  checkEvolutionV2WhatsappNumber
} from '../src/lib/evolution-v2-sales.js';
import { provisionOutreachStore } from '../src/lib/outreach-store-provisioning.js';
import { normalizeSalesPhone, isValidSalesPhone } from '../src/lib/sales-automation.js';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const batchFile = path.resolve(rootDir, 'tools/batch_results.json');

const COMPETITOR_DOMAINS = [
  'anota.ai', 'anotaai', 'goomer.app', 'goomer', 'instadelivery', 'instadelivery.com.br',
  'cardapioweb.com', 'cardapioweb', 'ifood.com.br', 'ifood', 'ola.click', 'olaclick',
  'yooga.app', 'maispedido.app', 'pedizap.com.br', 'menudino.com', 'deliverydireto.com.br',
  'saipos', 'wabiz', 'delmatch'
];

const PROTECTED_PHONES = new Set([
  '5514997013801', // Marmitaria La Mineira
  '5514996668189', // DONA NITA MARMITARIA
  '5514998325915', // Bom Sabor marmitaria
  '5514997992631', // Café da Di
  '5514996237187', // Sabor Brasil
  '5514991011313'  // Smash League Burger
]);

function hasCompetitor(url = '') {
  if (!url) return false;
  const lower = url.toLowerCase();
  return COMPETITOR_DOMAINS.some(domain => lower.includes(domain));
}

function detectSegment(title = '', category = '') {
  const text = `${title} ${category}`.toLowerCase();
  if (text.includes('hamburguer') || text.includes('burger') || text.includes('smash')) return 'hamburgueria';
  if (text.includes('pizza') || text.includes('pizzaria')) return 'pizzaria';
  if (text.includes('marmit') || text.includes('quentinha') || text.includes('refeic')) return 'marmitaria';
  if (text.includes('bar') || text.includes('petisc') || text.includes('boteco') || text.includes('choperia')) return 'bar';
  if (text.includes('lanche') || text.includes('hot dog') || text.includes('pastel') || text.includes('salgad')) return 'lanchonete';
  if (text.includes('acai') || text.includes('açaí') || text.includes('sorvet')) return 'acaiteria';
  if (text.includes('doce') || text.includes('bolo') || text.includes('confeit') || text.includes('padaria')) return 'padaria';
  return 'restaurante';
}

export async function replenishPipeline(targetNewCount = 40) {
  console.log(`\n================================================================`);
  console.log(`📥 AUTO-ABASTECIMENTO DO PIPELINE (Meta: ${targetNewCount} novos leads)`);
  console.log(`================================================================\n`);

  if (!fs.existsSync(batchFile)) {
    console.log('⚠️ Arquivo batch_results.json não encontrado em tools/');
    return 0;
  }

  const evoConfig = evolutionV2SalesConfig();
  const fileStream = fs.createReadStream(batchFile, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let inserted = 0;
  let evaluated = 0;

  for await (const line of rl) {
    if (inserted >= targetNewCount) break;
    const trimmed = line.trim();
    if (!trimmed) continue;

    let item;
    try {
      item = JSON.parse(trimmed);
    } catch {
      continue;
    }

    evaluated++;
    const name = String(item.title || item.name || '').trim();
    const rawPhone = item.phone || '';
    const phone = normalizeSalesPhone(rawPhone);
    const website = String(item.web_site || item.website || '').trim();
    const reviewsCount = Number(item.review_count ?? item.reviews_count ?? 0);
    const rating = Number(item.review_rating ?? item.rating ?? 0);
    const address = String(item.address || '').trim();
    const city = item.complete_address?.city || 'Bauru';
    const state = item.complete_address?.state || 'São Paulo';
    const segment = detectSegment(name, item.category || '');

    // Filtros de qualidade
    if (!name || name.length < 3) continue;
    if (!phone || !isValidSalesPhone(phone)) continue;
    if (PROTECTED_PHONES.has(phone)) continue;
    if (hasCompetitor(website)) continue;
    if (rating > 0 && rating < 4.2) continue; // Exige reputação alta

    // Checar se já existe no banco
    const exists = await pool.query(
      `SELECT id FROM sales_leads WHERE normalized_phone = $1 OR phone = $2 LIMIT 1`,
      [phone, phone]
    );
    if (exists.rows.length > 0) continue;

    // Checar se está na suppression list
    const supp = await pool.query(
      `SELECT id FROM sales_suppressions WHERE normalized_phone = $1 LIMIT 1`,
      [phone]
    );
    if (supp.rows.length > 0) continue;

    // Validação Real na Evolution API v2
    console.log(`🔍 [${inserted + 1}/${targetNewCount}] Verificando WhatsApp: ${name} (${phone})...`);
    const waCheck = await checkEvolutionV2WhatsappNumber({ phone }, evoConfig);
    if (!waCheck.exists) {
      console.log(`  ❌ Sem WhatsApp ativo na Evolution.`);
      continue;
    }

    // Auto-provisionar loja demonstrativa antecipada
    const tempLead = {
      business_name: name,
      segment,
      city,
      state
    };

    let prov = null;
    try {
      prov = await provisionOutreachStore({ lead: tempLead, pool, baseUrl: 'https://taprontomenu.com.br' });
    } catch (provErr) {
      console.warn(`  ⚠️ Erro no auto-provisionamento: ${provErr.message}`);
    }

    const metadata = {
      rating: String(rating || '5.0'),
      reviews_count: reviewsCount || 20,
      address,
      website: website || null,
      whatsapp_verified: true,
      whatsapp_jid: waCheck.jid,
      menu_slug: prov?.slug || null,
      menu_url: prov?.menuUrl || null,
      store_id: prov?.storeId || null
    };

    const score = 70 + (rating >= 4.7 ? 15 : 0) + (reviewsCount <= 60 ? 15 : 0);

    await pool.query(`
      INSERT INTO sales_leads (
        business_name, phone, normalized_phone, city, state, segment,
        source, score, stage, automation_status, metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        'gosom_batch_auto', $7, 'discovered', 'active', $8::jsonb, now(), now()
      )
    `, [name, phone, phone, city, state, segment, score, JSON.stringify(metadata)]);

    inserted++;
    console.log(`  ✅ Inserido e provisionado: ${name} (${phone}) - Score: ${score} - Loja: ${prov?.menuUrl || 'N/A'}`);
  }

  console.log(`\n🏁 Concluído: ${inserted} novos leads qualificados inseridos no pipeline (avaliados: ${evaluated}).`);
  return inserted;
}

const isDirect = process.argv[1] && /replenish-leads-from-batch\.mjs$/i.test(process.argv[1]);
if (isDirect) {
  const target = Number(process.argv[2]) || 30;
  replenishPipeline(target)
    .then(() => pool.end())
    .catch(e => { console.error(e); pool.end(); });
}
