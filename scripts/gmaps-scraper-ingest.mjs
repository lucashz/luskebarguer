import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import {
  evolutionV2SalesConfig,
  checkEvolutionV2WhatsappNumber
} from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@127.0.0.1:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const engineExe = path.resolve(rootDir, 'tools/engine/google_maps_scraper.exe');

const COMPETITOR_DOMAINS = [
  'anota.ai', 'anotaai', 'goomer.app', 'goomer', 'instadelivery', 'instadelivery.com.br',
  'cardapioweb.com', 'cardapioweb', 'ifood.com.br', 'ifood', 'ola.click', 'olaclick',
  'yooga.app', 'maispedido.app', 'pedizap.com.br', 'menudino.com', 'deliverydireto.com.br'
];

function hasCompetitor(url = '') {
  if (!url) return false;
  const lower = url.toLowerCase();
  return COMPETITOR_DOMAINS.some(domain => lower.includes(domain));
}

function cleanPhone(raw = '') {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export async function runScraperQuery({ query, geo, depth = 2 }) {
  const tmpDir = path.resolve(rootDir, 'tools/engine/tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const queryFile = path.resolve(tmpDir, `query_${Date.now()}.txt`);
  const resultsFile = path.resolve(tmpDir, `results_${Date.now()}.json`);

  fs.writeFileSync(queryFile, query, 'utf8');

  const args = [
    '-input', queryFile,
    '-results', resultsFile,
    '-json',
    '-lang', 'pt-BR',
    '-depth', String(depth),
    '-fast-mode'
  ];

  if (geo) {
    args.push('-geo', geo);
  }

  console.log(`\n🚀 Executando busca: "${query}" (geo: ${geo || 'auto'}, profundidade: ${depth})...`);

  return new Promise((resolve, reject) => {
    const proc = spawn(engineExe, args, { stdio: 'pipe' });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });

    proc.on('close', code => {
      try { if (fs.existsSync(queryFile)) fs.unlinkSync(queryFile); } catch {}

      if (code !== 0) {
        return reject(new Error(`Scraper falhou com código ${code}: ${stderr || stdout}`));
      }

      if (!fs.existsSync(resultsFile)) {
        return resolve([]);
      }

      try {
        const rawJson = fs.readFileSync(resultsFile, 'utf8');
        fs.unlinkSync(resultsFile);
        const parsed = JSON.parse(rawJson || '[]');
        resolve(Array.isArray(parsed) ? parsed : []);
      } catch (err) {
        reject(err);
      }
    });
  });
}

export async function ingestSweetSpotLeads({ city, state = 'SP', geo, queries = [] }) {
  const evoConfig = evolutionV2SalesConfig();
  console.log(`================================================================`);
  console.log(`🎯 INGESTÃO INTELIGENTE: LEADS RECÉM-ABERTOS COM TRAÇÃO`);
  console.log(`📍 Região: ${city}/${state} (geo: ${geo || 'N/A'})`);
  console.log(`================================================================`);

  let totalRaw = 0;
  let sweetSpotCount = 0;
  let discardedCompetitor = 0;
  let discardedNoWa = 0;
  let insertedCount = 0;

  for (const query of queries) {
    try {
      const results = await runScraperQuery({ query, geo, depth: 3 });
      totalRaw += results.length;
      console.log(`  ↳ Retornados ${results.length} estabelecimentos.`);

      for (const item of results) {
        const name = (item.title || '').trim();
        const phone = cleanPhone(item.phone);
        const website = (item.web_site || '').trim();
        const reviewsCount = Number(item.review_count || 0);
        const rating = Number(item.review_rating || 0);
        const address = (item.address || '').trim();

        // 1. Filtro do Sweet Spot (8 a 60 avaliações, nota >= 4.5)
        const isSweetSpot = reviewsCount >= 8 && reviewsCount <= 60 && rating >= 4.5;
        if (!isSweetSpot) {
          continue;
        }
        sweetSpotCount++;

        // 2. Descarte de Concorrente no Website
        if (hasCompetitor(website)) {
          discardedCompetitor++;
          console.log(`  🚫 Descartado: ${name} (Já usa plataforma concorrente: ${website})`);
          continue;
        }

        // 3. Telefone obrigatório
        if (!phone || phone.length < 10) {
          continue;
        }

        // 4. Verificação de existência no banco
        const existCheck = await pool.query(
          `SELECT id, stage FROM sales_leads WHERE normalized_phone = $1 OR phone = $2 LIMIT 1`,
          [phone, phone]
        );
        if (existCheck.rows.length > 0) {
          continue; // Já trabalhado ou já no pipeline
        }

        // 5. Validação Real do WhatsApp via Evolution API v2
        const waCheck = await checkEvolutionV2WhatsappNumber({ phone }, evoConfig);
        if (!waCheck.exists) {
          discardedNoWa++;
          console.log(`  ❌ Sem WhatsApp: ${name} (${phone})`);
          continue;
        }

        // 6. Inserção com Score Máximo no Sweet Spot (+40 pontos de bônus)
        const baseScore = 60;
        const sweetSpotBonus = 40;
        const totalScore = baseScore + sweetSpotBonus;

        const segment = query.toLowerCase().includes('marmit') ? 'marmitaria'
          : (query.toLowerCase().includes('hamburg') ? 'hamburgueria'
          : (query.toLowerCase().includes('pizza') ? 'pizzaria'
          : (query.toLowerCase().includes('bar') ? 'bar' : 'restaurante')));

        const metadata = {
          rating,
          reviews_count: reviewsCount,
          sweet_spot_traction: true,
          open_status: 'recently_opened_with_traction',
          evidence: {
            source_engine: 'google-maps-scraper-kit',
            address,
            website,
            checked_at: new Date().toISOString()
          },
          whatsapp_verified: true,
          whatsapp_jid: waCheck.jid
        };

        await pool.query(`
          INSERT INTO sales_leads (
            business_name, phone, normalized_phone, city, state, segment,
            source, stage, score, metadata, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            'google_outreach', 'discovered', $7, $8, now(), now()
          )
          ON CONFLICT (phone) DO UPDATE 
          SET score = EXCLUDED.score,
              metadata = EXCLUDED.metadata,
              updated_at = now()
        `, [name, phone, phone, city, state, segment, totalScore, metadata]);

        insertedCount++;
        console.log(`  ⭐ [SWEET SPOT CAPTURADO] ${name} | Nota: ${rating} (${reviewsCount} avaliações) | Tel: ${phone}`);
      }
    } catch (err) {
      console.error(`Erro na consulta "${query}":`, err.message);
    }
  }

  console.log(`\n================================================================`);
  console.log(`📊 RESUMO DA INGESTÃO:`);
  console.log(`Total analisados: ${totalRaw}`);
  console.log(`No Sweet Spot (8-60 reviews, nota >= 4.5): ${sweetSpotCount}`);
  console.log(`Descartados (Já possuem concorrente): ${discardedCompetitor}`);
  console.log(`Descartados (Sem WhatsApp ativo): ${discardedNoWa}`);
  console.log(`Novos Leads Salvos e Qualificados: ${insertedCount}`);
  console.log(`================================================================\n`);
  return { totalRaw, sweetSpotCount, insertedCount };
}

// Execução direta caso chamado via CLI
if (process.argv[1] && process.argv[1].endsWith('gmaps-scraper-ingest.mjs')) {
  ingestSweetSpotLeads({
    city: 'Pederneiras',
    state: 'SP',
    geo: '-22.3572,-48.7758',
    queries: [
      'marmitaria em Pederneiras SP',
      'hamburgueria em Pederneiras SP',
      'pizzaria em Pederneiras SP',
      'restaurante em Pederneiras SP'
    ]
  }).then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
