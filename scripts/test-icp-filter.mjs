import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

const COMPETITOR_KEYWORDS = [
  'anota.ai', 'vocepede', 'bitbar', 'goomer', 'instadelivery', 'cardapioweb',
  'cardapio.digital', 'ola.click', 'hubt', 'saipos', 'menudino', 'deliverydireto',
  'deliverymuch', 'wabiz', 'yooga', 'delmatch', 'kyte', 'ccardapio', 'pedir.delivery',
  'pedidos.mobi', 'cardapius', 'expresso.delivery', 'meucardapio', 'ifood', 'rappi',
  'ubereats', 'app.'
];

async function run() {
  const res = await pool.query(`
    SELECT 
      id,
      business_name,
      city,
      state,
      segment,
      phone,
      (metadata->>'reviews_count')::int as reviews,
      metadata->>'website' as website
    FROM sales_leads
    WHERE last_contact_at IS NULL
      AND stage IN ('discovered', 'preview_ready')
      AND (metadata->>'reviews_count')::int BETWEEN 5 AND 350
    ORDER BY (metadata->>'reviews_count')::int ASC
  `);

  const filtered = res.rows.filter(lead => {
    const ws = String(lead.website || '').toLowerCase().trim();
    if (!ws) return true; // Sem site = 100% atendimento WhatsApp manual (Sweet Spot)
    if (ws.includes('instagram.com') || ws.includes('facebook.com') || ws.includes('wa.me')) return true;
    if (COMPETITOR_KEYWORDS.some(k => ws.includes(k))) return false;
    // Se for domínio institucional com .com / .com.br próprio
    if (ws.startsWith('http') && !ws.includes('linktr.ee') && !ws.includes('instagram') && !ws.includes('facebook')) return false;
    return true;
  });

  console.log('Total analisado entre 5 e 350 reviews:', res.rows.length);
  console.log('Total aprovado no filtro estrito (SEM cardápio online concorrente):', filtered.length);
  console.log('\nPrimeiros 20 exemplos no Sweet Spot TáPronto:');
  console.table(filtered.slice(0, 20).map(l => ({
    nome: l.business_name,
    cidade: `${l.city}/${l.state}`,
    segmento: l.segment,
    reviews: l.reviews,
    site: l.website ? l.website.slice(0, 45) : '(Nenhum - Atendimento 100% WhatsApp)'
  })));

  await pool.end();
}

run().catch(console.error);

