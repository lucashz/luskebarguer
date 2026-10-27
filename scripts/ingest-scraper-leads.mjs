import pg from 'pg';
import { readFile } from 'node:fs/promises';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

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
  // Brazilian mobile format with 55: 55 + 2-digit DDD + 9 + 8 digits (total 13 digits)
  // or legacy 12 digits: 55 + DDD + 8/9 digits
  if (/^55\d{2}9\d{8}$/.test(phone)) return true;
  return false;
}

export async function ingestScrapedLeads(jsonPath, city, state, defaultSegment = 'marmitaria') {
  console.log(`Lendo arquivo de resultados: ${jsonPath}`);
  const raw = await readFile(jsonPath, 'utf8');
  let items = [];
  try {
    items = JSON.parse(raw);
  } catch {
    // If json lines (JSONL)
    items = raw.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  }

  console.log(`Total de registros brutos extraídos: ${items.length}`);

  let inserted = 0;
  let skippedContacted = 0;
  let skippedExisting = 0;
  let skippedNoMobile = 0;
  let skippedHighReviews = 0;
  let skippedHasWebsite = 0;

  for (const item of items) {
    const title = item.title || item.name;
    if (!title) continue;

    const reviews = Number(item.review_count ?? item.reviews_count ?? 0);
    const website = (item.web_site || item.website || '').trim();
    const rawPhone = item.phone || '';
    const phone = normalizePhone(rawPhone);

    // 1. REGRA COMERCIAL: Não descartamos por quantidade de reviews. Salvamos para inteligência de vendas.

    // 2. FILTRO DE SISTEMA: Sem site ou usando links improvisados (Instagram, Canva, Linktree, WhatsApp, Facebook)
    const isMakeshiftSite = !website || 
      website.includes('instagram.com') || 
      website.includes('facebook.com') || 
      website.includes('wa.me') || 
      website.includes('whatsapp.com') || 
      website.includes('linktr.ee') || 
      website.includes('canva.site');

    if (!isMakeshiftSite) {
      skippedHasWebsite++;
      continue;
    }

    // 3. FILTRO DE OURO: Celular/WhatsApp válido obrigatório
    if (!phone || !isMobilePhone(phone)) {
      skippedNoMobile++;
      continue;
    }

    // 4. REGRA DE SEGURANÇA MÁXIMA: NUNCA contatar quem já foi contatado
    const existing = await pool.query(`SELECT id, last_contact_at, attempt_count FROM sales_leads WHERE phone = $1`, [phone]);
    if (existing.rows.length > 0) {
      if (existing.rows[0].last_contact_at || existing.rows[0].attempt_count > 0) {
        skippedContacted++;
        continue;
      }
      skippedExisting++;
      continue;
    }

    // Determinar cidade e estado
    const leadCity = item.complete_address?.city || city;
    const leadState = item.complete_address?.state || state;

    // Determinar categoria/segmento
    let segment = defaultSegment;
    const cat = (item.category || (item.categories || []).join(' ') || '').toLowerCase();
    if (cat.includes('hamburguer') || cat.includes('burger')) segment = 'hamburgueria';
    else if (cat.includes('pizza')) segment = 'pizzaria';
    else if (cat.includes('bar') || cat.includes('pub') || cat.includes('cervej')) segment = 'bar';
    else if (cat.includes('doce') || cat.includes('confeit') || cat.includes('padaria') || cat.includes('bakery')) segment = 'padaria';
    else if (cat.includes('pastel')) segment = 'pastelaria';
    else if (cat.includes('marmit') || cat.includes('restauran') || cat.includes('comida') || cat.includes('lunch')) segment = 'marmitaria';

    // Inserir como LEAD 100% NOVO
    await pool.query(`
      INSERT INTO sales_leads (
        business_name, phone, normalized_phone, city, state, segment, source,
        stage, automation_status, attempt_count, followup_count, score, metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $2, $3, $4, $5, 'gosom_scraper',
        'discovered', 'active', 0, 0, 10,
        jsonb_build_object(
          'reviews_count', $6::int,
          'rating', $7::text,
          'address', $8::text,
          'website', $9::text,
          'scraped_category', $10::text,
          'icp_tier', CASE WHEN $6 <= 35 THEN 'starter_low_flow' ELSE 'established_manual' END
        ),
        now(), now()
      )
    `, [
      title,
      phone,
      leadCity,
      leadState,
      segment,
      reviews,
      String(item.review_rating || ''),
      item.address || '',
      website,
      item.category || ''
    ]);

    inserted++;
    console.log(`  ⭐ [NOVO LEAD QUALIFICADO] ${title} | ${segment} | Tel: ${phone} | Reviews: ${reviews}`);
  }

  console.log('\n==============================================');
  console.log(`  RESULTADO DA INGESTÃO ICP:`);
  console.log(`  - Novos Leads Qualificados Inseridos: ${inserted}`);
  console.log(`  - Descartados (Mais de 25 reviews): ${skippedHighReviews}`);
  console.log(`  - Descartados (Já possuem website/sistema): ${skippedHasWebsite}`);
  console.log(`  - Descartados (Telefone fixo ou inválido): ${skippedNoMobile}`);
  console.log(`  - Bloqueados por segurança (Já contatados antes): ${skippedContacted}`);
  console.log(`  - Ignorados (Já cadastrados): ${skippedExisting}`);
  console.log('==============================================\n');

  await pool.end();
}

const targetFile = process.argv[2];
const targetCity = process.argv[3] || 'Bauru';
const targetState = process.argv[4] || 'SP';

if (targetFile) {
  ingestScrapedLeads(targetFile, targetCity, targetState).catch(console.error);
}
