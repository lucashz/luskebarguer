import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');

// Slugs solicitados pelo usuário para exclusão:
const TARGET_SLUGS = [
  'beer-point-horizontina',
  'luske-burguer',
  'stopbeer',
  'gastrohaus-restaurante',
  'padaria-confeitaria-camargo',
  'padaria-e-confeitaria-sabor-e-ma',
  'inverno-d-italia-dois-corregos',
  'd-piombino-dese-paradouro-e-rest',
  'restaurante-e-pizzaria-napolitan',
  'marmitaria-cheiro-verde',
  'restaurante-e-lancheria-chapa-qu',
  'divino-sabor-lancheria',
  'macanudo-lancheria',
  'stop-acai',
  'rei-do-acai-d-c',
  'da-casa-cozinha-marmitaria-em-br',
  'neri-bar-e-lanchonete',
  'firma-burger-ltda-me-40672634000',
  'bares',
  'refugio-gourmet'
];

const ORPHAN_COMPANY_IDS = [
  '69c930f4-ce4f-43ed-8114-dcb3a1e2edb6', // Padaria Altíssimo
  '8f778db4-39b5-4303-b125-810115a39545'  // Padaria Alt?ssimo
];

// Slugs estritamente protegidos:
const PROTECTED_SLUGS = new Set([
  'napiolanches',
  'delucapasta',
  'cardapio',
  'padaria-dois-irmaos',
  'restaurante-alianca',
  'brasano-burger',
  'brasano-hamburgueria',
  'bizzo-pizzaria',
  'momentos-cafe',
  'momentos-cafe-resto',
  'villa-1052',
  'villa-1052-pub-restaurantes-brac',
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

async function main() {
  console.log(`=== PURGA DE CADASTROS SOLICITADA ===`);
  console.log(`Modo: ${apply ? '🚀 APLICAR EXCLUSÃO DEFINITIVA' : '🔍 SIMULAÇÃO (DRY-RUN)'}`);

  // 1. Localizar as lojas alvo
  const storesRes = await pool.query(`
    SELECT s.id, s.name, s.slug, s.company_id, c.name as company_name,
           (SELECT count(*)::int FROM orders o WHERE o.store_id = s.id) as orders_count,
           (SELECT count(*)::int FROM menu_items mi WHERE mi.store_id = s.id) as items_count,
           l.id as lead_id, l.stage as lead_stage
    FROM stores s
    JOIN companies c ON c.id = s.company_id
    LEFT JOIN sales_leads l ON (l.metadata->>'store_id')::uuid = s.id OR l.metadata->>'menu_slug' = s.slug
    WHERE s.slug = ANY($1::text[])
  `, [TARGET_SLUGS]);

  console.log(`\nLojas identificadas para exclusão (${storesRes.rowCount} de ${TARGET_SLUGS.length}):`);
  for (const s of storesRes.rows) {
    if (PROTECTED_SLUGS.has(s.slug)) {
      throw new Error(`TRAVA DE SEGURANÇA: ${s.slug} está na lista de protegidos!`);
    }
    if (s.orders_count > 0) {
      throw new Error(`TRAVA DE SEGURANÇA: Loja ${s.name} (${s.slug}) possui pedidos reais!`);
    }
    console.log(`- ${s.name} (${s.slug}) | Empresa: ${s.company_name} | Itens: ${s.items_count}`);
  }

  // 2. Verificar empresas órfãs
  const orphansRes = await pool.query(`
    SELECT id, name FROM companies WHERE id = ANY($1::uuid[])
  `, [ORPHAN_COMPANY_IDS]);
  console.log(`\nEmpresas órfãs para exclusão (${orphansRes.rowCount}):`);
  for (const c of orphansRes.rows) {
    console.log(`- ${c.name} (${c.id})`);
  }

  if (!apply) {
    console.log(`\n⚠️ Dry-run concluído. Nenhuma alteração feita.`);
    console.log(`Execute com a flag --apply para realizar a exclusão.`);
    await pool.end();
    return;
  }

  console.log(`\nIniciando exclusões com transação segura...`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let deletedStoresCount = 0;
    let deletedRegsCount = 0;
    let deletedCompaniesCount = 0;

    for (const store of storesRes.rows) {
      // a. Excluir assisted_registrations correspondente
      const regDel = await client.query(`
        DELETE FROM assisted_registrations
        WHERE (store_id = $1 OR attribution->>'lead_id' = $2::text)
          AND status NOT IN ('published', 'activated')
        RETURNING id
      `, [store.id, store.lead_id || null]);
      deletedRegsCount += regDel.rowCount;

      // b. Excluir a loja (cascateia para categorias, itens, configurações)
      await client.query('DELETE FROM stores WHERE id = $1', [store.id]);
      deletedStoresCount += 1;

      // c. Atualizar lead se existir
      if (store.lead_id) {
        await client.query(`
          UPDATE sales_leads
          SET stage = CASE WHEN stage IN ('engaged', 'showcase', 'preview_ready') THEN 'lost' ELSE stage END,
              metadata = jsonb_set(
                jsonb_set(metadata, '{menu_status}', '"deleted"'),
                '{menu_deleted_at}', to_jsonb(NOW()::text)
              ),
              updated_at = NOW()
          WHERE id = $1
        `, [store.lead_id]);
      }

      // d. Excluir a empresa se ela não tiver outras lojas e não for a TáPronto Demo
      if (store.company_name !== 'TáPronto Demo') {
        const otherStores = await client.query('SELECT count(*)::int as count FROM stores WHERE company_id = $1', [store.company_id]);
        const adminUsers = await client.query('SELECT count(*)::int as count FROM admin_users WHERE company_id = $1', [store.company_id]);
        if (otherStores.rows[0].count === 0 && adminUsers.rows[0].count === 0) {
          await client.query('DELETE FROM company_subscriptions WHERE company_id = $1', [store.company_id]).catch(() => {});
          await client.query('DELETE FROM companies WHERE id = $1', [store.company_id]);
          deletedCompaniesCount += 1;
        }
      }
    }

    // Excluir as empresas órfãs solicitadas
    for (const orphan of orphansRes.rows) {
      await client.query('DELETE FROM company_subscriptions WHERE company_id = $1', [orphan.id]).catch(() => {});
      await client.query('DELETE FROM companies WHERE id = $1', [orphan.id]);
      deletedCompaniesCount += 1;
    }

    await client.query('COMMIT');
    console.log(`\n✅ SUCESSO!`);
    console.log(`- Lojas excluídas: ${deletedStoresCount}`);
    console.log(`- Cadastros assistidos/rascunhos expurgados: ${deletedRegsCount}`);
    console.log(`- Empresas deletadas: ${deletedCompaniesCount}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`❌ Erro durante a exclusão, rollback executado:`, err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
