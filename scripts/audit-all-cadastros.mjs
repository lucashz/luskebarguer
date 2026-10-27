import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  console.log('=== CONTAGEM GERAL DE TABELAS ===');
  const counts = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM assisted_registrations) as assisted_registrations,
      (SELECT count(*)::int FROM stores) as stores,
      (SELECT count(*)::int FROM companies) as companies,
      (SELECT count(*)::int FROM admin_users) as admin_users,
      (SELECT count(*)::int FROM sales_leads) as sales_leads
  `);
  console.table(counts.rows);

  console.log('\n=== LISTA DETALHADA DE ASSISTED_REGISTRATIONS ===');
  const regs = await pool.query(`
    SELECT ar.id, ar.establishment_name, ar.status, ar.store_id, ar.company_id,
           ar.attribution->>'source' as source,
           ar.attribution->>'lead_id' as lead_id,
           to_char(ar.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as created,
           s.name as store_name, s.slug as store_slug,
           (SELECT count(*)::int FROM orders o WHERE o.store_id = ar.store_id) as order_count,
           (SELECT count(*)::int FROM menu_items mi WHERE mi.store_id = ar.store_id) as item_count,
           l.stage as lead_stage,
           l.metadata->>'menu_status' as menu_status,
           l.metadata->>'is_showcase' as is_showcase,
           l.metadata->>'continuity_confirmed' as continuity_confirmed
    FROM assisted_registrations ar
    LEFT JOIN stores s ON s.id = ar.store_id
    LEFT JOIN sales_leads l ON l.id = (ar.attribution->>'lead_id')::uuid
    ORDER BY ar.created_at DESC
  `);
  console.table(regs.rows.map(r => ({
    id: r.id.slice(0, 8),
    nome: r.establishment_name,
    status: r.status,
    store_slug: r.store_slug || 'SEM_LOJA',
    pedidos: r.order_count,
    itens: r.item_count,
    lead_stage: r.lead_stage,
    menu_status: r.menu_status,
    showcase: r.is_showcase,
    continuidade: r.continuity_confirmed
  })));

  console.log('\n=== LISTA DETALHADA DE STORES ===');
  const stores = await pool.query(`
    SELECT s.id, s.name, s.slug, s.company_id,
           to_char(s.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as created,
           (SELECT count(*)::int FROM orders o WHERE o.store_id = s.id) as order_count,
           (SELECT count(*)::int FROM menu_items mi WHERE mi.store_id = s.id) as item_count,
           c.name as company_name,
           (SELECT count(*)::int FROM company_subscriptions cs WHERE cs.company_id = s.company_id AND cs.status IN ('active', 'past_due')) as active_subs,
           l.business_name as lead_name,
           l.stage as lead_stage,
           l.metadata->>'is_showcase' as is_showcase,
           l.metadata->>'continuity_confirmed' as continuity_confirmed
    FROM stores s
    LEFT JOIN companies c ON c.id = s.company_id
    LEFT JOIN sales_leads l ON (l.metadata->>'store_id')::uuid = s.id OR l.metadata->>'menu_slug' = s.slug
    ORDER BY s.created_at DESC
  `);
  console.table(stores.rows.map(r => ({
    id: r.id.slice(0, 8),
    nome: r.name,
    slug: r.slug,
    pedidos: r.order_count,
    itens: r.item_count,
    empresa: r.company_name,
    assinatura: r.active_subs > 0 ? 'SIM' : 'NAO',
    lead_stage: r.lead_stage || 'SEM_LEAD',
    showcase: r.is_showcase,
    continuidade: r.continuity_confirmed
  })));

  await pool.end();
}

main().catch(console.error);

