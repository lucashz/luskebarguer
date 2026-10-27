import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@172.17.0.1:6543/cardapio?schema=public';
const pool = new Pool({ connectionString });

async function main() {
  const abandoned = await pool.query(`
    SELECT ar.id, ar.establishment_name, ar.status, ar.store_id, ar.attribution->>'lead_id' as lead_id,
           l.business_name as lead_name, l.stage as lead_stage, l.metadata->>'menu_status' as menu_status
    FROM assisted_registrations ar
    LEFT JOIN sales_leads l ON l.id = (ar.attribution->>'lead_id')::uuid
    WHERE l.stage = 'lost' 
       OR l.metadata->>'menu_status' = 'deleted'
       OR (ar.store_id IS NULL AND ar.status = 'ready_for_preview' AND ar.establishment_name NOT IN ('Boteco Do Bakana', 'Holy Sandwich', 'Blackbird Burger', 'Skin Lanches da Preta', 'Big lanches Rota 370.', 'Marmitaria Bom Sabor', 'Restaurante Buiu''s', 'La Bella Pizzaria Choperia', 'Restaurante Panela De Barro', 'Marmitaria Menu', 'Lian Sorvetes Dois Córregos', 'Ponto do Açaí', 'Padaria e marmitaria pão quente', 'Armazém da Gula', 'Bar do Mineiro Pederneiras Sp'))
  `);

  console.log(`Cadastros assistidos abandonados/órfãos de cardápios deletados: ${abandoned.rowCount}`);
  console.table(abandoned.rows);

  await pool.end();
}

main().catch(console.error);
