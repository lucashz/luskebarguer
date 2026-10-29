import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import {
  evolutionV2SalesConfig,
  checkEvolutionV2WhatsappNumber
} from '../src/lib/evolution-v2-sales.js';
import { provisionOutreachStore } from '../src/lib/outreach-store-provisioning.js';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const scraperExe = path.resolve(rootDir, 'tools/google-maps-scraper.exe');

// Cidades estratégicas por Estado
const TARGET_REGIONS = [
  // 1. BAHIA (BA)
  { city: 'Salvador', state: 'BA', geo: '-12.9777,-38.5016', queries: ['marmitaria', 'hamburgueria artesanal', 'pizzaria delivery'] },
  { city: 'Feira de Santana', state: 'BA', geo: '-12.2664,-38.9663', queries: ['marmitaria', 'hamburgueria artesanal'] },
  { city: 'Vitória da Conquista', state: 'BA', geo: '-14.8661,-40.8394', queries: ['marmitaria', 'hamburgueria artesanal'] },

  // 2. RIO GRANDE DO SUL (RS)
  { city: 'Porto Alegre', state: 'RS', geo: '-30.0346,-51.2177', queries: ['marmitaria', 'hamburgueria artesanal', 'pizzaria delivery'] },
  { city: 'Caxias do Sul', state: 'RS', geo: '-29.1678,-51.1794', queries: ['marmitaria', 'hamburgueria artesanal'] },
  { city: 'Canoas', state: 'RS', geo: '-29.9179,-51.1837', queries: ['marmitaria', 'hamburgueria artesanal'] },

  // 3. SANTA CATARINA (SC)
  { city: 'Florianópolis', state: 'SC', geo: '-27.5954,-48.5480', queries: ['marmitaria', 'hamburgueria artesanal', 'pizzaria delivery'] },
  { city: 'Joinville', state: 'SC', geo: '-26.3044,-48.8464', queries: ['marmitaria', 'hamburgueria artesanal'] },
  { city: 'Blumenau', state: 'SC', geo: '-26.9194,-49.0661', queries: ['marmitaria', 'hamburgueria artesanal'] },
  { city: 'Balneário Camboriú', state: 'SC', geo: '-26.9926,-48.6352', queries: ['hamburgueria artesanal', 'pizzaria delivery'] },

  // 4. PARANÁ (PR)
  { city: 'Curitiba', state: 'PR', geo: '-25.4284,-49.2733', queries: ['marmitaria', 'hamburgueria artesanal', 'pizzaria delivery'] },
  { city: 'Londrina', state: 'PR', geo: '-23.3045,-51.1696', queries: ['marmitaria', 'hamburgueria artesanal'] },
  { city: 'Maringá', state: 'PR', geo: '-23.4205,-51.9331', queries: ['marmitaria', 'hamburgueria artesanal'] },
  { city: 'Cascavel', state: 'PR', geo: '-24.9578,-53.4595', queries: ['marmitaria', 'hamburgueria artesanal'] }
];

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, '');
  if (digits.length === 10 || digits.length === 11) return '55' + digits;
  if (digits.length === 12 || digits.length === 13) {
    if (digits.startsWith('55')) return digits;
  }
  return null;
}

function isMobilePhone(phone) {
  if (!phone) return false;
  return /^55\d{2}9\d{8}$/.test(phone);
}

function detectSegment(title = '', query = '', category = '') {
  const text = `${title} ${query} ${category}`.toLowerCase();
  if (text.includes('hamburguer') || text.includes('burger') || text.includes('smash')) return 'hamburgueria';
  if (text.includes('pizza') || text.includes('pizzaria')) return 'pizzaria';
  if (text.includes('marmit') || text.includes('quentinha') || text.includes('refeic')) return 'marmitaria';
  if (text.includes('bar') || text.includes('petisc') || text.includes('boteco') || text.includes('choperia')) return 'bar';
  if (text.includes('lanche') || text.includes('hot dog') || text.includes('pastel') || text.includes('salgad')) return 'lanchonete';
  return 'restaurante';
}

async function mineAllRegions() {
  console.log('================================================================');
  console.log('   MINERAÇÃO REGIONAL GOOGLE MAPS — BA, RS, SC, PR             ');
  console.log('================================================================\n');

  const tmpQuery = path.resolve(rootDir, 'tools/tmp_geo_q.txt');
  const tmpRes = path.resolve(rootDir, 'tools/tmp_geo_res.json');

  let totalRawPlaces = 0;
  let totalNewInserted = 0;
  const newInsertedLeads = [];

  for (const reg of TARGET_REGIONS) {
    console.log(`\n📍 Estado: [${reg.state}] | Polo: ${reg.city} (geo: ${reg.geo})`);

    for (const q of reg.queries) {
      try {
        writeFileSync(tmpQuery, q, 'utf8');
        if (existsSync(tmpRes)) unlinkSync(tmpRes);

        // Disparo nativo em Fast Mode (< 1 segundo por query!)
        const cmd = `"${scraperExe}" -input "${tmpQuery}" -results "${tmpRes}" -json -depth 1 -fast-mode -geo "${reg.geo}" -lang pt-BR`;
        execSync(cmd, { stdio: 'pipe', timeout: 30000 });

        if (!existsSync(tmpRes)) continue;
        const rawJson = readFileSync(tmpRes, 'utf8');
        const places = JSON.parse(rawJson);
        totalRawPlaces += places.length;

        let queryNewCount = 0;

        for (const p of places) {
          const title = String(p.title || p.name || '').trim();
          if (!title) continue;

          const phone = normalizePhone(p.phone);
          if (!phone || !isMobilePhone(phone)) continue;

          // Trava de segurança: NUNCA contatar quem já existe no banco
          const existRes = await pool.query(
            `SELECT id, last_contact_at, attempt_count FROM sales_leads WHERE phone = $1 OR normalized_phone = $1`,
            [phone]
          );

          if (existRes.rows.length > 0) continue;

          const reviews = Number(p.review_count ?? p.reviews_count ?? 0);
          const rawRating = p.review_rating ?? p.rating ?? '';
          const rating = rawRating ? String(rawRating).replace(',', '.') : null;
          const address = p.address || `${reg.city} - ${reg.state}`;
          const website = String(p.web_site || p.website || '').trim();
          const segment = detectSegment(title, q, p.category || (p.categories || []).join(' '));

          const ins = await pool.query(`
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
            reg.city,
            reg.state,
            segment,
            reviews,
            rating,
            address,
            website,
            p.category || ''
          ]);

          queryNewCount++;
          totalNewInserted++;
          newInsertedLeads.push(ins.rows[0]);
        }

        console.log(`  ✓ Busca "${q}": ${places.length} encontrados -> ${queryNewCount} novos leads celulares salvos`);
      } catch (err) {
        console.warn(`  ⚠️ Falha em "${q}" (${reg.city}):`, err.message);
      }
    }
  }

  // Limpeza de arquivos temporários
  if (existsSync(tmpQuery)) unlinkSync(tmpQuery);
  if (existsSync(tmpRes)) unlinkSync(tmpRes);

  console.log('\n================================================================');
  console.log(`🎉 Mineração Regional Concluída!`);
  console.log(`- Total de estabelecimentos analisados: ${totalRawPlaces}`);
  console.log(`- Novos leads qualificados inseridos no banco: ${totalNewInserted}`);
  console.log('================================================================\n');

  return newInsertedLeads;
}

async function validateAndProvisionRegional(newLeads = [], targetToProvision = 40) {
  if (newLeads.length === 0) {
    console.log('Nenhum novo lead para provisionar.');
    return;
  }

  const evoConfig = evolutionV2SalesConfig();
  console.log(`\n--- Validando WhatsApp e Provisionando Cardápios Modelo (Meta: ${targetToProvision}) ---`);

  // Ordena por quantidade de avaliações (autoridade no Google)
  newLeads.sort((a, b) => {
    const revA = Number(a.metadata?.reviews_count || 0);
    const revB = Number(b.metadata?.reviews_count || 0);
    return revB - revA;
  });

  let provisioned = 0;

  for (const lead of newLeads) {
    if (provisioned >= targetToProvision) break;

    // 1. Checagem de WhatsApp ativo na Evolution API
    try {
      const wa = await checkEvolutionV2WhatsappNumber({ phone: lead.phone }, evoConfig);
      if (!wa.exists) {
        console.log(`  ❌ [Sem WhatsApp] ${lead.business_name} (${lead.phone})`);
        await pool.query(`UPDATE sales_leads SET stage = 'discarded', discard_code = 'no_whatsapp', updated_at = now() WHERE id = $1`, [lead.id]);
        continue;
      }
    } catch {
      // Se der timeout na checagem, segue com fallback seguro
    }

    // 2. Provisionamento de Cardápio com 100% de Fotos HD (Regra de Ouro)
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

      provisioned++;
      console.log(`  🚀 [${provisioned}/${targetToProvision}] [${lead.state} - ${turno.toUpperCase()}] ${lead.business_name} (${lead.city}) -> Loja: ${cleanMenuUrl}`);
    } catch (pErr) {
      console.warn(`  ⚠️ Erro ao provisionar ${lead.business_name}:`, pErr.message);
    }
  }

  console.log(`\n✅ ${provisioned} lojas modelo montadas com sucesso para BA, RS, SC e PR!`);
}

async function main() {
  const leads = await mineAllRegions();
  await validateAndProvisionRegional(leads, 40);
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
});

