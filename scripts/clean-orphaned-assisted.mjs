import { getLocalPool } from './src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = true;

  // Find all assisted_registrations that belong to:
  // 1. Leads marked 'lost' or with menu_status = 'deleted'
  // 2. Or outreach leads where store was deleted and status is not published/activated
  const query = `
    SELECT ar.id, ar.establishment_name, ar.status, ar.store_id, ar.attribution->>'lead_id' as lead_id,
           l.business_name as lead_name, l.stage as lead_stage, l.metadata->>'menu_status' as menu_status
    FROM assisted_registrations ar
    LEFT JOIN sales_leads l ON l.id = (ar.attribution->>'lead_id')::uuid
    WHERE ar.status NOT IN ('published', 'activated')
      AND (
        l.stage = 'lost'
        OR l.stage = 'discarded'
        OR l.metadata->>'menu_status' = 'deleted'
        OR (
          ar.attribution->>'source' = 'outreach'
          AND ar.store_id IS NULL
          AND ar.establishment_name NOT IN (
            'Boteco Do Bakana', 'Holy Sandwich', 'Blackbird Burger', 'Skin Lanches da Preta',
            'Big lanches Rota 370.', 'Marmitaria Bom Sabor', 'Restaurante Buiu''s',
            'La Bella Pizzaria Choperia', 'Restaurante Panela De Barro', 'Marmitaria Menu',
            'Lian Sorvetes Dois Córregos', 'Ponto do Açaí', 'Padaria e marmitaria pão quente',
            'Armazém da Gula', 'Bar do Mineiro Pederneiras Sp'
          )
        )
      )
  `;

  const res = await pool.query(query);
  console.log(`Encontrados ${res.rowCount} cadastros assistidos órfãos para exclusão.`);
  console.table(res.rows.map(r => ({
    id: r.id.slice(0, 8),
    nome: r.establishment_name,
    status: r.status,
    lead_nome: r.lead_name,
    lead_stage: r.lead_stage,
    menu_status: r.menu_status
  })));

  if (apply && res.rowCount > 0) {
    const ids = res.rows.map(r => r.id);
    const delRes = await pool.query(
      `DELETE FROM assisted_registrations WHERE id = ANY($1::uuid[]) RETURNING id`,
      [ids]
    );
    console.log(`✅ Excluídos com sucesso ${delRes.rowCount} cadastros assistidos órfãos.`);
  } else if (!apply && res.rowCount > 0) {
    console.log(`Execute com --apply para efetuar a exclusão.`);
  }

  await pool.end();
}

main().catch(console.error);
