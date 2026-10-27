import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Uso: node scripts/import-menu.mjs <caminho-para-menu.json>');
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(filePath)) {
    console.error(`Arquivo não encontrado: ${filePath}`);
    process.exit(1);
  }

  const menuData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const { storeId, storeSlug, storeDescription, coverUrl, categories, modifiers } = menuData;

  if (!storeId) {
    console.error('storeId é obrigatório no JSON!');
    process.exit(1);
  }

  console.log(`=== IMPORTAÇÃO CANÔNICA DE CARDÁPIO: ${storeSlug || storeId} ===\n`);

  // Validação estrita da Regra de Ouro (Zero itens sem imagem)
  let totalItemsCount = 0;
  for (const cat of categories) {
    for (const item of cat.items) {
      totalItemsCount++;
      if (!item.imageUrl || item.imageUrl.trim() === '') {
        throw new Error(`VIOLAÇÃO DA REGRA DE OURO: Item "${item.name}" na categoria "${cat.name}" está sem imageUrl!`);
      }
    }
  }
  console.log(`✓ Validação prévia: ${categories.length} categorias e ${totalItemsCount} produtos validados com foto.`);

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    // 1. Limpeza atômica
    console.log('1. Limpando dados legados da loja...');
    await client.query('DELETE FROM menu_modifiers WHERE store_id = $1', [storeId]);
    await client.query('DELETE FROM menu_modifier_groups WHERE store_id = $1', [storeId]);
    await client.query('DELETE FROM menu_items WHERE store_id = $1', [storeId]);
    await client.query('DELETE FROM menu_categories WHERE store_id = $1', [storeId]);

    // 2. Atualizar capa e descrição se fornecidos
    if (storeDescription) {
      await client.query('UPDATE stores SET description = $1, updated_at = NOW() WHERE id = $2', [storeDescription, storeId]);
    }
    if (coverUrl) {
      await client.query('UPDATE store_settings SET cover_url = $1, updated_at = NOW() WHERE store_id = $2', [coverUrl, storeId]);
    }

    // 3. Inserir Categorias e Itens
    console.log('2. Inserindo categorias e itens...');
    const burgerItemIds = [];

    for (let cIdx = 0; cIdx < categories.length; cIdx++) {
      const cat = categories[cIdx];
      const catRes = await client.query(`
        INSERT INTO menu_categories (store_id, name, description, sort_order, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, true, NOW(), NOW())
        RETURNING id
      `, [storeId, cat.name, cat.description || null, cIdx + 1]);

      const catId = catRes.rows[0].id;

      // Inserção em lote dos itens da categoria
      for (let iIdx = 0; iIdx < cat.items.length; iIdx++) {
        const item = cat.items[iIdx];
        const isFeatured = !!item.isFeatured;
        const tags = isFeatured ? ['Mais Vendido', 'Destaque'] : [];

        const itemRes = await client.query(`
          INSERT INTO menu_items (
            store_id, category_id, name, description, price, image_url,
            is_featured, is_available, sort_order, tags, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, NOW(), NOW())
          RETURNING id
        `, [
          storeId,
          catId,
          item.name,
          item.description || null,
          item.price,
          item.imageUrl,
          isFeatured,
          iIdx + 1,
          tags
        ]);

        if (cat.hasModifiers) {
          burgerItemIds.push(itemRes.rows[0].id);
        }
      }
    }

    // 4. Modificadores em Batch (Super Rápido)
    if (modifiers && modifiers.length > 0 && burgerItemIds.length > 0) {
      console.log(`3. Vinculando ${modifiers.length} adicionais a ${burgerItemIds.length} lanches em batch...`);

      // Inserir grupos de modificadores em lote
      const groupRows = [];
      for (const itemId of burgerItemIds) {
        const res = await client.query(`
          INSERT INTO menu_modifier_groups (
            store_id, menu_item_id, name, description, min_choices, max_choices, is_required, sort_order, created_at, updated_at
          )
          VALUES ($1, $2, 'Turbine seu Lanche (Adicionais)', 'Escolha adicionais para deixar seu lanche ainda mais completo', 0, 10, false, 1, NOW(), NOW())
          RETURNING id
        `, [storeId, itemId]);
        groupRows.push(res.rows[0].id);
      }

      // Inserir todos os modificadores de todas as opções de uma só vez (bulk multi-values)
      const values = [];
      const params = [];
      let paramIdx = 1;

      for (const grpId of groupRows) {
        for (let mIdx = 0; mIdx < modifiers.length; mIdx++) {
          const mod = modifiers[mIdx];
          values.push(`($${paramIdx}, $${paramIdx+1}, $${paramIdx+2}, $${paramIdx+3}, true, $${paramIdx+4}, NOW(), NOW())`);
          params.push(storeId, grpId, mod.name, mod.price, mIdx + 1);
          paramIdx += 5;
        }
      }

      // Executa os modificadores em batches de 500 para não estourar o limite de parâmetros do Postgres
      const CHUNK_SIZE = 50; // 50 items = 250 params
      for (let i = 0; i < values.length; i += CHUNK_SIZE) {
        const chunkValues = values.slice(i, i + CHUNK_SIZE);
        const chunkParams = params.slice(i * 5, (i + chunkValues.length) * 5);

        // Reindexar placeholders para o chunk
        const reindexedValues = [];
        let cIdx = 1;
        for (let j = 0; j < chunkValues.length; j++) {
          reindexedValues.push(`($${cIdx}, $${cIdx+1}, $${cIdx+2}, $${cIdx+3}, true, $${cIdx+4}, NOW(), NOW())`);
          cIdx += 5;
        }

        const sql = `
          INSERT INTO menu_modifiers (
            store_id, group_id, name, price_delta, is_available, sort_order, created_at, updated_at
          )
          VALUES ${reindexedValues.join(',\n')}
        `;
        await client.query(sql, chunkParams);
      }
    }

    await client.query('COMMIT');
    console.log(`\n🎉 CARDÁPIO IMPORTADO COM SUCESSO ABSOLUTO!`);
    console.log(`   - Loja: ${storeSlug}`);
    console.log(`   - Categorias: ${categories.length}`);
    console.log(`   - Produtos: ${totalItemsCount} (100% com fotos)`);
    console.log(`   - Adicionais vinculados em lote!`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Falha na importação, transação revertida (ROLLBACK):', err);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch(console.error);
