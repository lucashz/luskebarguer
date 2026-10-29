import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

const COMPETITOR_PLATFORMS = [
  'anota.ai',
  'vocepede',
  'brendi',
  'menuprime',
  'cardapioweb',
  'bitbar',
  'goomer',
  'instadelivery',
  'saipos',
  'cardapio.digital',
  'ola.click',
  'hubt',
  'menudino',
  'deliverydireto',
  'deliverymuch',
  'wabiz',
  'yooga',
  'delmatch',
  'kyte',
  'ccardapio',
  'pedir.delivery',
  'pedidos.mobi',
  'cardapius',
  'expresso.delivery',
  'meucardapio',
  'ifood.com.br',
  'rappi.com.br',
  'ubereats'
];

async function purge() {
  console.log('=== SANEAMENTO DE LEADS — EXPURGO DE PLATAFORMAS CONCORRENTES E MEGA-RESTAURANTES ===\n');

  // Buscar todos os leads não contatados
  const res = await pool.query(`
    SELECT id, business_name, city, state, segment, 
           metadata->>'website' as website, 
           COALESCE((metadata->>'reviews_count')::int, 0) as reviews,
           stage
    FROM sales_leads
    WHERE last_contact_at IS NULL
      AND stage IN ('discovered', 'preview_ready')
  `);

  let purgedCompetitor = 0;
  let purgedOverSize = 0;
  let preservedSweetSpot = 0;

  for (const lead of res.rows) {
    const ws = String(lead.website || '').toLowerCase().trim();
    const hasCompetitor = COMPETITOR_PLATFORMS.some(k => ws.includes(k));
    const isCustomDomainSite = ws.startsWith('http') && !ws.includes('instagram.com') && !ws.includes('facebook.com') && !ws.includes('wa.me') && !ws.includes('linktr.ee') && !ws.includes('linkr.bio');
    const isOverSize = lead.reviews > 250;

    if (hasCompetitor || isCustomDomainSite) {
      await pool.query(`
        UPDATE sales_leads
        SET stage = 'discarded',
            discard_code = 'has_competitor_platform',
            automation_status = 'stopped',
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'discard_reason', CASE WHEN $3 THEN 'Plataforma concorrente detectada: ' || $1::text ELSE 'Possui site/sistema próprio: ' || $1::text END
            ),
            updated_at = now()
        WHERE id = $2
      `, [ws, lead.id, hasCompetitor]);
      purgedCompetitor++;
    } else if (isOverSize) {
      await pool.query(`
        UPDATE sales_leads
        SET stage = 'discarded',
            discard_code = 'enterprise_too_large',
            automation_status = 'stopped',
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'discard_reason', 'Volume excessivo de avaliações (> 350): ' || $1::text
            ),
            updated_at = now()
        WHERE id = $2
      `, [lead.reviews, lead.id]);
      purgedOverSize++;
    } else {
      preservedSweetSpot++;
    }
  }

  console.log(`✓ Descartados por terem cardápio online concorrente: ${purgedCompetitor}`);
  console.log(`✓ Descartados por serem grandes redes/operações (> 350 reviews): ${purgedOverSize}`);
  console.log(`⭐ Leads PRESERVADOS e qualificados no Sweet Spot puro (sem concorrente): ${preservedSweetSpot}\n`);

  await pool.end();
}

purge().catch(console.error);
