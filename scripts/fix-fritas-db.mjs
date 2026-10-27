import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

async function main() {
  await pool.query(`
    UPDATE menu_items 
    SET image_url = 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=1200&q=85'
    WHERE image_url LIKE '%1576107232684%'
  `);
  console.log('Atualizado com sucesso!');
  await pool.end();
}

main().catch(console.error);
