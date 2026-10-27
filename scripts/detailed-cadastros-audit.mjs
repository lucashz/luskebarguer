import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

const HOME_SLUGS = new Set([
  'cardapio',
  'bizzo-pizzaria',
  'brasano-burger',
  'brasano-hamburgueria',
  'inside-burger',
  'la-bella-pizzaria',
  'la-bella-pizzaria-choperia',
  'leve-sabor',
  'marmitaria-pao-quente',
  'padaria-e-marmitaria-pao-quente',
  'momentos-cafe',
  'momentos-cafe-resto',
  'no-cepo-lanches',
  'padaria-dois-irmaos',
  'restaurante-alianca',
  'roppongi-sushi',
  'skin-lanches',
  'skin-lanches-da-preta',
  'villa-1052',
  'villa-1052-pub-restaurantes-brac'
]);

const TODAY_SLUGS = new Set([
  'boteco-do-bakana',
  'holy-sandwich',
  'blackbird-burger',
  'skin-lanches-da-preta',
  'big-lanches-rota-370',
  'marmitaria-bom-sabor',
  'restaurante-buiu-s',
  'la-bella-pizzaria-choperia',
  'restaurante-panela-de-barro',
  'marmitaria-menu',
  'lian-sorvetes-dois-corregos',
  'ponto-do-acai',
  'padaria-e-marmitaria-pao-quente',
  'armazem-da-gula',
  'bar-do-mineiro-pederneiras-sp'
]);

const REAL_CLIENT_SLUGS = new Set([
  'napiolanches',
  'delucapasta',
  'luske-burguer',
  'beer-point-horizontina',
  'cardapio'
]);

async function main() {
  const storesRes = await pool.query(`
    SELECT
      s.id,
      s.name,
      s.slug,
      to_char(s.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as criado_em,
      c.name as empresa,
      c.id as company_id,
      (SELECT count(*)::int FROM orders o WHERE o.store_id = s.id) as orders_count,
      (SELECT count(*)::int FROM menu_items mi WHERE mi.store_id = s.id) as items_count,
      (SELECT count(*)::int FROM company_subscriptions cs WHERE cs.company_id = s.company_id AND cs.status IN ('active', 'past_due')) as active_subs,
      l.id as lead_id,
      l.stage as lead_stage,
      l.metadata->>'menu_status' as menu_status,
      l.metadata->>'is_showcase' as is_showcase,
      l.metadata->>'continuity_confirmed' as continuity_confirmed
    FROM stores s
    JOIN companies c ON c.id = s.company_id
    LEFT JOIN sales_leads l ON (l.metadata->>'store_id')::uuid = s.id OR l.metadata->>'menu_slug' = s.slug
    ORDER BY s.created_at DESC
  `);

  console.log(`TOTAL DE LOJAS ATIVAS NO BANCO: ${storesRes.rowCount}`);

  const groups = {
    group1_real: [],        // 1. Clientes Oficiais / Reais (NUNCA EXCLUIR)
    group2_today: [],       // 2. Disparos de Hoje (20/10) - Em acompanhamento comercial
    group3_home_showcase: [], // 3. Vitrines fixas usadas na Home Page
    group4_deletable: []    // 4. Cadastros de testes antigos / sem uso (PODEM SER EXCLUÍDOS)
  };

  for (const s of storesRes.rows) {
    if (REAL_CLIENT_SLUGS.has(s.slug) || s.orders_count > 0 || s.active_subs > 0) {
      groups.group1_real.push(s);
    } else if (TODAY_SLUGS.has(s.slug)) {
      groups.group2_today.push(s);
    } else if (HOME_SLUGS.has(s.slug)) {
      groups.group3_home_showcase.push(s);
    } else {
      groups.group4_deletable.push(s);
    }
  }

  // Verificar também se há companies sem store (órfãs)
  const orphanCompanies = await pool.query(`
    SELECT c.id, c.name, to_char(c.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as criado_em
    FROM companies c
    LEFT JOIN stores s ON s.company_id = c.id
    WHERE s.id IS NULL
  `);

  console.log('\n======================================================');
  console.log(`🟢 GRUPO 1: CLIENTES REAIS / OFICIAIS (${groups.group1_real.length} lojas) - [NÃO EXCLUIR]`);
  console.log('======================================================');
  console.table(groups.group1_real.map(r => ({
    Nome: r.name,
    Slug: r.slug,
    Pedidos: r.orders_count,
    Itens: r.items_count,
    Assinatura: r.active_subs > 0 ? 'SIM' : 'NÃO'
  })));

  console.log('\n======================================================');
  console.log(`🟡 GRUPO 2: PROSPECÇÃO DE HOJE 20/10 (${groups.group2_today.length} lojas) - [AGUARDANDO RESPOSTA / REGRA 15H]`);
  console.log('======================================================');
  console.table(groups.group2_today.map(r => ({
    Nome: r.name,
    Slug: r.slug,
    Fase: r.lead_stage,
    Itens: r.items_count
  })));

  console.log('\n======================================================');
  console.log(`🔵 GRUPO 3: VITRINES DA HOME (${groups.group3_home_showcase.length} lojas) - [PROVA SOCIAL NO SITE]`);
  console.log('======================================================');
  console.table(groups.group3_home_showcase.map(r => ({
    Nome: r.name,
    Slug: r.slug,
    Itens: r.items_count,
    CriadoEm: r.criado_em
  })));

  console.log('\n======================================================');
  console.log(`🔴 GRUPO 4: TESTES ANTIGOS / CARDÁPIOS ABANDONADOS (${groups.group4_deletable.length} lojas) - [PODEM SER EXCLUÍDOS]`);
  console.log('======================================================');
  console.table(groups.group4_deletable.map(r => ({
    ID: r.id.slice(0, 8),
    Nome: r.name,
    Slug: r.slug,
    CriadoEm: r.criado_em,
    Itens: r.items_count,
    LeadFase: r.lead_stage || 'SEM_LEAD'
  })));

  if (orphanCompanies.rowCount > 0) {
    console.log('\n======================================================');
    console.log(`🔴 EMPRESAS ÓRFÃS SEM LOJA (${orphanCompanies.rowCount} empresas) - [PODEM SER EXCLUÍDAS]`);
    console.log('======================================================');
    console.table(orphanCompanies.rows);
  }

  await pool.end();
}

main().catch(console.error);

