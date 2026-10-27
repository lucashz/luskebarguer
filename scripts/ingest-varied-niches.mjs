import fs from 'node:fs';
import readline from 'node:readline';
import pg from 'pg';

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
  if (/^55\d{2}9\d{8}$/.test(phone)) return true;
  return false;
}

async function main() {
  console.log("================================================================");
  console.log("   INGESTÃO DE LEADS EM NICHOS VARIADOS (NÃO MARMITARIA)       ");
  console.log("================================================================\n");

  // Leads já contatados em qualquer momento
  const contactedRes = await pool.query("SELECT DISTINCT phone FROM sales_leads WHERE last_contact_at IS NOT NULL OR attempt_count > 0");
  const contactedPhones = new Set(contactedRes.rows.map(r => r.phone));

  // Leads existentes no banco
  const existingRes = await pool.query("SELECT phone FROM sales_leads");
  const existingPhones = new Set(existingRes.rows.map(r => r.phone));

  console.log(`[INIT] ${contactedPhones.size} contatados anteriormente, ${existingPhones.size} existentes no banco.`);

  const fileStream = fs.createReadStream('d:/lsk/TáProntomenu.com.br/.worktrees/release-production-outreach-20261014/tools/batch_results.json');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let insertedCount = 0;
  const insertedBySegment = {};
  const qualifiedLeads = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      const title = item.title;
      if (!title) continue;

      const rawPhone = item.phone || '';
      const phone = normalizePhone(rawPhone);

      // Deve ser celular com 9 dígitos
      if (!phone || !isMobilePhone(phone)) continue;

      // NUNCA contatar quem já foi contatado
      if (contactedPhones.has(phone)) continue;

      // Se já existe no banco, ignorar
      if (existingPhones.has(phone)) continue;

      // Filtrar site: aceita sem site ou makeshift (insta, zap, linktree, etc.)
      const website = (item.web_site || item.website || '').trim();
      const hasRealDomain = website && 
        !website.includes('instagram.com') && 
        !website.includes('facebook.com') && 
        !website.includes('wa.me') && 
        !website.includes('whatsapp.com') && 
        !website.includes('linktr.ee') && 
        !website.includes('canva.site') &&
        !website.includes('delmatch') &&
        !website.includes('pedizap') &&
        !website.includes('menudino');

      // Se tem site próprio de pedidos complexo (iFood próprio, etc.), focar em quem tem makeshift
      // Mas se o lead é bom e quer economizar taxas, aceitamos makeshift prioritariamente

      // Determinar segmento a partir da categoria do Google Maps
      const rawCat = (item.category || (item.categories || []).join(' ') || '').toLowerCase();
      let segment = null;

      if (rawCat.includes('hamburger') || rawCat.includes('hamburguer') || rawCat.includes('burger')) {
        segment = 'hamburgueria';
      } else if (rawCat.includes('pizza')) {
        segment = 'pizzaria';
      } else if (rawCat.includes('snack') || rawCat.includes('lanche') || rawCat.includes('hot dog') || rawCat.includes('pastel')) {
        segment = 'lanchonete';
      } else if (rawCat.includes('açai') || rawCat.includes('acai') || rawCat.includes('sorvete')) {
        segment = 'açaiteria';
      } else if (rawCat.includes('sushi') || rawCat.includes('japones') || rawCat.includes('japanese')) {
        segment = 'japones';
      } else if (rawCat.includes('bar') || rawCat.includes('pub') || rawCat.includes('cervej')) {
        segment = 'bar';
      } else if (rawCat.includes('bakery') || rawCat.includes('padaria') || rawCat.includes('confeit')) {
        segment = 'padaria';
      } else if (rawCat.includes('restaurant') || rawCat.includes('barbecue') || rawCat.includes('grill') || rawCat.includes('churrasc')) {
        // Ignora marmitaria deliberadamente!
        const titleLower = title.toLowerCase();
        if (!titleLower.includes('marmit') && !titleLower.includes('marmita')) {
          segment = 'restaurante';
        }
      }

      // Se for marmitaria ou não mapeado, pula!
      if (!segment || segment === 'marmitaria') continue;

      const city = item.complete_address?.city || 'Bauru';
      const state = item.complete_address?.state || 'São Paulo';
      const reviews = Number(item.review_count ?? item.reviews_count ?? 0);

      // Inserir no banco
      const res = await pool.query(`
        INSERT INTO sales_leads (
          business_name, phone, normalized_phone, city, state, segment, source,
          stage, automation_status, attempt_count, followup_count, score, metadata, created_at, updated_at
        ) VALUES (
          $1, $2, $2, $3, $4, $5, 'gosom_scraper_varied',
          'discovered', 'active', 0, 0, 30,
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
        RETURNING id
      `, [
        title,
        phone,
        city,
        state,
        segment,
        reviews,
        String(item.review_rating || ''),
        item.address || '',
        website,
        item.category || ''
      ]);

      existingPhones.add(phone);
      insertedCount++;
      insertedBySegment[segment] = (insertedBySegment[segment] || 0) + 1;
      qualifiedLeads.push({ id: res.rows[0].id, title, phone, city, segment, reviews });

      if (insertedCount >= 30) break; // meta de 25-30 leads frescos
    } catch (e) {
      console.error('Error on line:', e.message);
    }
  }

  console.log(`\n🎉 Inseridos com sucesso ${insertedCount} leads em NICHOS VARIADOS:`);
  console.table(insertedBySegment);

  console.log("\nAmostra dos novos leads cadastrados e prontos:");
  for (let i = 0; i < qualifiedLeads.length; i++) {
    const q = qualifiedLeads[i];
    console.log(`${(i+1).toString().padStart(2, ' ')}. [${q.segment.toUpperCase()}] ${q.title} (${q.city}) - Tel: ${q.phone} (${q.reviews} reviews)`);
  }

  await pool.end();
}

main().catch(console.error);
