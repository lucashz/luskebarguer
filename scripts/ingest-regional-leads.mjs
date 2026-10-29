import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  evolutionV2SalesConfig,
  checkEvolutionV2WhatsappNumber
} from '../src/lib/evolution-v2-sales.js';
import { provisionOutreachStore } from '../src/lib/outreach-store-provisioning.js';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, '');
  if (digits.length === 10 || digits.length === 11) {
    return '55' + digits;
  }
  if (digits.length === 12 || digits.length === 13) {
    if (digits.startsWith('55')) return digits;
  }
  return null;
}

function isMobilePhone(phone) {
  if (!phone) return false;
  // Formato móvel brasileiro: 55 + DDD (2 dígitos) + 9 + 8 dígitos = 13 dígitos
  return /^55\d{2}9\d{8}$/.test(phone);
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

function detectStateAndCity(address = '', queryCity = '', queryState = '') {
  const addr = String(address || '').trim();
  
  let state = queryState;
  let city = queryCity;

  if (/\bBA\b|Bahia/i.test(addr)) state = 'BA';
  else if (/\bRS\b|Rio Grande do Sul/i.test(addr)) state = 'RS';
  else if (/\bSC\b|Santa Catarina/i.test(addr)) state = 'SC';
  else if (/\bPR\b|Paran[aá]/i.test(addr)) state = 'PR';

  // Identificação de cidades polo
  if (/Salvador/i.test(addr)) { city = 'Salvador'; state = 'BA'; }
  else if (/Feira de Santana/i.test(addr)) { city = 'Feira de Santana'; state = 'BA'; }
  else if (/Vit[oó]ria da Conquista/i.test(addr)) { city = 'Vitória da Conquista'; state = 'BA'; }
  else if (/Porto Alegre/i.test(addr)) { city = 'Porto Alegre'; state = 'RS'; }
  else if (/Caxias do Sul/i.test(addr)) { city = 'Caxias do Sul'; state = 'RS'; }
  else if (/Canoas/i.test(addr)) { city = 'Canoas'; state = 'RS'; }
  else if (/Passo Fundo/i.test(addr)) { city = 'Passo Fundo'; state = 'RS'; }
  else if (/Florian[oó]polis/i.test(addr)) { city = 'Florianópolis'; state = 'SC'; }
  else if (/Joinville/i.test(addr)) { city = 'Joinville'; state = 'SC'; }
  else if (/Blumenau/i.test(addr)) { city = 'Blumenau'; state = 'SC'; }
  else if (/Balne[aá]rio Cambori[uú]/i.test(addr)) { city = 'Balneário Camboriú'; state = 'SC'; }
  else if (/Chapec[oó]/i.test(addr)) { city = 'Chapecó'; state = 'SC'; }
  else if (/Curitiba/i.test(addr)) { city = 'Curitiba'; state = 'PR'; }
  else if (/Londrina/i.test(addr)) { city = 'Londrina'; state = 'PR'; }
  else if (/Maring[aá]/i.test(addr)) { city = 'Maringá'; state = 'PR'; }
  else if (/Cascavel/i.test(addr)) { city = 'Cascavel'; state = 'PR'; }

  return { city, state };
}

export async function ingestRegionalResults(jsonPath) {
  if (!existsSync(jsonPath)) {
    throw new Error(`Arquivo não encontrado: ${jsonPath}`);
  }

  const raw = await readFile(jsonPath, 'utf8');
  let items = [];
  try {
    items = JSON.parse(raw);
  } catch {
    items = raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  }

  console.log(`\n======================================================`);
  console.log(`[Ingestão Regional] Analisando ${items.length} estabelecimentos...`);
  console.log(`======================================================\n`);

  let insertedCount = 0;
  let skippedNoPhone = 0;
  let skippedNotMobile = 0;
  let skippedExisting = 0;
  let skippedContacted = 0;
  let skippedHasCompetitorPlatform = 0;

  const validNewLeads = [];

  for (const item of items) {
    const title = String(item.title || item.name || '').trim();
    if (!title) continue;

    const rawPhone = item.phone || '';
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      skippedNoPhone++;
      continue;
    }

    if (!isMobilePhone(phone)) {
      skippedNotMobile++;
      continue;
    }

    const website = String(item.web_site || item.website || '').trim().toLowerCase();
    
    // BLACKLIST INEGOCIÁVEL DE PLATAFORMAS CONCORRENTES:
    const COMPETITOR_PLATFORMS = [
      'anota.ai', 'vocepede', 'brendi', 'cardapioweb', 'bitbar', 'goomer',
      'instadelivery', 'saipos', 'cardapio.digital', 'ola.click', 'hubt', 'menudino',
      'deliverydireto', 'deliverymuch', 'wabiz', 'yooga', 'delmatch', 'kyte',
      'ccardapio', 'pedir.delivery', 'pedidos.mobi', 'cardapius', 'expresso.delivery',
      'meucardapio', 'ifood.com.br', 'rappi.com.br', 'ubereats'
    ];
    if (COMPETITOR_PLATFORMS.some(k => website.includes(k))) {
      skippedHasCompetitorPlatform++;
      continue;
    }

    const reviews = Number(item.review_count ?? item.reviews_count ?? 0);
    // TETO DE QUALIFICAÇÃO: Estabelecimentos com mais de 250 avaliações quase sempre já possuem sistemas próprios
    if (reviews > 250) {
      skippedExisting++;
      continue;
    }

    // Se tiver site próprio institucional com e-commerce e muitas avaliações, pular
    if (website.startsWith('http') && !website.includes('instagram.com') && !website.includes('facebook.com') && !website.includes('wa.me') && !website.includes('linktr.ee') && reviews > 150) {
      skippedExisting++;
      continue;
    }

    // Trava de Segurança: verificar se o telefone já existe no banco
    const existingRes = await pool.query(
      `SELECT id, last_contact_at, attempt_count, stage FROM sales_leads WHERE phone = $1 OR normalized_phone = $1`,
      [phone]
    );

    if (existingRes.rows.length > 0) {
      const existing = existingRes.rows[0];
      if (existing.last_contact_at || existing.attempt_count > 0) {
        skippedContacted++;
        continue;
      }
      skippedExisting++;
      continue;
    }

    const reviews = Number(item.review_count ?? item.reviews_count ?? 0);
    const rawRating = item.review_rating ?? item.rating ?? '';
    const rating = rawRating ? String(rawRating).replace(',', '.') : null;
    const address = item.address || item.complete_address?.address || '';
    const { city, state } = detectStateAndCity(address);
    const segment = detectSegment(title, item.category || '');

    // Inserção no banco com status 'discovered'
    const insertRes = await pool.query(`
      INSERT INTO sales_leads (
        business_name, phone, normalized_phone, city, state, segment, source,
        stage, automation_status, attempt_count, followup_count, score, metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $2, $3, $4, $5, 'regional_expansion_gmaps',
        'discovered', 'active', 0, 0, 15,
        jsonb_build_object(
          'reviews_count', $6::int,
          'rating', $7::text,
          'address', $8::text,
          'website', $9::text,
          'scraped_category', $10::text,
          'regional_state', $4::text,
          'icp_tier', CASE WHEN $6 <= 40 THEN 'starter_low_flow' ELSE 'established_manual' END
        ),
        now(), now()
      )
      RETURNING id, business_name, phone, city, state, segment, metadata
    `, [
      title,
      phone,
      city,
      state,
      segment,
      reviews,
      rating,
      address,
      website,
      item.category || ''
    ]);

    insertedCount++;
    const newLead = insertRes.rows[0];
    validNewLeads.push(newLead);
    console.log(`  ⭐ [NOVO LEAD REGIONAL] ${title} (${city}/${state}) | ${segment} | Tel: ${phone} | Avaliações: ${reviews} (nota ${rating || 'N/A'})`);
  }

  console.log(`\n======================================================`);
  console.log(`[Resumo da Ingestão Regional]:`);
  console.log(`  ✓ Novos Leads Inseridos no Banco: ${insertedCount}`);
  console.log(`  - Ignorados (Sem celular válido / Telefone fixo): ${skippedNoPhone + skippedNotMobile}`);
  console.log(`  - Ignorados (Já cadastrados no sistema): ${skippedExisting}`);
  console.log(`  - Bloqueados por segurança (Já contatados antes): ${skippedContacted}`);
  console.log(`======================================================\n`);

  return validNewLeads;
}

export async function validateAndProvisionBatch(leads = [], targetLimit = 40) {
  const evoConfig = evolutionV2SalesConfig();

  console.log(`\n======================================================`);
  console.log(`[Provisionamento de Cardápios Modelo] Selecionando até ${targetLimit} leads com fotos 100% HD...`);
  console.log(`======================================================\n`);

  let provisionedCount = 0;

  for (const lead of leads) {
    if (provisionedCount >= targetLimit) break;

    // 1. Validar WhatsApp na Evolution API
    try {
      const waInfo = await checkEvolutionV2WhatsappNumber({ phone: lead.phone }, evoConfig);
      if (!waInfo.exists) {
        console.log(`  ❌ [Sem WhatsApp] ${lead.business_name} (${lead.phone})`);
        await pool.query(`UPDATE sales_leads SET stage = 'discarded', discard_code = 'no_whatsapp', updated_at = now() WHERE id = $1`, [lead.id]);
        continue;
      }
    } catch (e) {
      console.warn(`  ⚠️ Falha ao checar WhatsApp de ${lead.business_name}:`, e.message);
    }

    // 2. Provisionar Loja Demonstrativa (Regra de Ouro: 100% dos produtos com imagens)
    try {
      const prov = await provisionOutreachStore({
        lead: {
          id: lead.id,
          business_name: lead.business_name,
          city: lead.city,
          state: lead.state,
          phone: lead.phone,
          segment: lead.segment,
          metadata: lead.metadata
        },
        pool
      });

      const cleanMenuUrl = `https://taprontomenu.com.br/${prov.slug}`;

      // Determinar turno com base no segmento
      const isMorning = ['marmitaria', 'restaurante'].includes(lead.segment);
      const turno = isMorning ? 'manha' : 'noite';

      await pool.query(`
        UPDATE sales_leads
        SET stage = 'preview_ready',
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'target_turn', $1::text,
              'outreach_strategy', 'ready_for_trojan_step1',
              'store_id', $2::text,
              'menu_slug', $3::text,
              'menu_url', $4::text,
              'golden_rule_images_verified', true
            ),
            updated_at = now()
        WHERE id = $5
      `, [turno, prov.storeId, prov.slug, cleanMenuUrl, lead.id]);

      provisionedCount++;
      console.log(`  🚀 [${provisionedCount}/${targetLimit}] [${turno.toUpperCase()}] ${lead.business_name} (${lead.city}/${lead.state}) -> Loja: ${cleanMenuUrl}`);
    } catch (err) {
      console.error(`  ❌ Erro ao provisionar ${lead.business_name}:`, err.message);
    }
  }

  console.log(`\n🎉 ${provisionedCount} novos estabelecimentos regionais provisionados e prontos para o Passo 1!`);
}

const isDirect = process.argv[1] && /ingest-regional-leads\.mjs$/i.test(process.argv[1]);
if (isDirect) {
  const file = process.argv[2] || 'tools/regional_results.json';
  ingestRegionalResults(file)
    .then(async (newLeads) => {
      if (newLeads.length > 0) {
        await validateAndProvisionBatch(newLeads, 40);
      }
      await pool.end();
    })
    .catch((err) => {
      console.error(err);
      pool.end();
    });
}

