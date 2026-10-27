import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  console.log('=== ANALISANDO EMPRESAS E LOJAS ===');

  const companiesRes = await pool.query(`
    SELECT
      c.id as company_id,
      c.name as company_name,
      c.document,
      to_char(c.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as created,
      s.id as store_id,
      s.name as store_name,
      s.slug as store_slug,
      (SELECT count(*)::int FROM orders o WHERE o.store_id = s.id) as orders_count,
      (SELECT count(*)::int FROM menu_items mi WHERE mi.store_id = s.id) as items_count,
      (SELECT count(*)::int FROM company_subscriptions cs WHERE cs.company_id = c.id AND cs.status IN ('active', 'past_due')) as active_subs,
      l.id as lead_id,
      l.business_name as lead_name,
      l.stage as lead_stage,
      l.metadata->>'menu_status' as menu_status,
      l.metadata->>'is_showcase' as is_showcase,
      l.metadata->>'continuity_confirmed' as continuity_confirmed,
      ar.id as reg_id,
      ar.status as reg_status
    FROM companies c
    LEFT JOIN stores s ON s.company_id = c.id
    LEFT JOIN sales_leads l ON (l.metadata->>'store_id')::uuid = s.id OR l.metadata->>'menu_slug' = s.slug
    LEFT JOIN assisted_registrations ar ON ar.company_id = c.id OR ar.store_id = s.id
    ORDER BY c.created_at DESC
  `);

  console.log(`Total de empresas retornadas: ${companiesRes.rowCount}`);

  const categories = {
    real_clients: [],        // Assinantes reais / lojas com pedidos
    showcase: [],            // Cardápios fixos / vitrine
    today_outreach: [],      // 15 leads disparados hoje
    deletable_orphans: []    // Testes antigos, sem lead ativo, sem pedidos, sem assinatura
  };

  for (const row of companiesRes.rows) {
    const isReal = row.orders_count > 0 || row.active_subs > 0 || ['Nápio Lanches', 'Luske Alimentacao', 'delucapasta'].includes(row.company_name);
    const isToday = [
      'boteco-do-bakana', 'holy-sandwich', 'blackbird-burger', 'skin-lanches-da-preta',
      'big-lanches-rota-370', 'marmitaria-bom-sabor', 'restaurante-buiu-s',
      'la-bella-pizzaria-choperia', 'restaurante-panela-de-barro', 'marmitaria-menu',
      'lian-sorvetes-dois-corregos', 'ponto-do-acai', 'padaria-e-marmitaria-pao-quente',
      'armazem-da-gula', 'bar-do-mineiro-pederneiras-sp'
    ].includes(row.store_slug);

    const isShowcase = row.is_showcase === 'true' || row.continuity_confirmed === 'true' || [
      'beer-point-horizontina', 'cardapio', 'refugio-gourmet', 'bares', 'villa-1052-pub-restaurantes-brac',
      'firma-burger-ltda-me-40672634000', 'neri-bar-e-lanchonete', 'da-casa-cozinha-marmitaria-em-b'
    ].includes(row.store_slug);

    if (isReal && !isToday && !isShowcase) {
      categories.real_clients.push(row);
    } else if (isToday) {
      categories.today_outreach.push(row);
    } else if (isShowcase) {
      categories.showcase.push(row);
    } else {
      categories.deletable_orphans.push(row);
    }
  }

  console.log('\n--- 1. CLIENTES REAIS / OFICIAIS ---');
  console.table(categories.real_clients.map(r => ({
    empresa: r.company_name,
    slug: r.store_slug,
    pedidos: r.orders_count,
    assinatura: r.active_subs > 0 ? 'SIM' : 'NAO',
    itens: r.items_count
  })));

  console.log('\n--- 2. VITRINES / SHOWCASES FIXOS ---');
  console.table(categories.showcase.map(r => ({
    empresa: r.company_name,
    slug: r.store_slug,
    pedidos: r.orders_count,
    itens: r.items_count,
    lead: r.lead_name
  })));

  console.log('\n--- 3. OUTREACH DE HOJE (20/10) ---');
  console.table(categories.today_outreach.map(r => ({
    empresa: r.company_name,
    slug: r.store_slug,
    lead: r.lead_name,
    fase: r.lead_stage
  })));

  console.log('\n--- 4. CANDIDATOS A EXCLUSÃO (ÓRFÃOS / TESTES ANTIGOS) ---');
  console.table(categories.deletable_orphans.map(r => ({
    empresa: r.company_name,
    slug: r.store_slug,
    criado: r.created,
    itens: r.items_count,
    pedidos: r.orders_count,
    lead: r.lead_name || 'SEM_LEAD',
    fase: r.lead_stage || 'NENHUMA'
  })));

  await pool.end();
}

main().catch(console.error);

