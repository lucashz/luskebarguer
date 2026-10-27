import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const leads = [
    { name: 'Império Do Sabor', id: '2e253f4a-0bff-4fba-8cdb-a5b1bc66d8a7' },
    { name: 'Marmitaria Ki Delicia', id: '87932274-9871-405c-a83a-0f5882406f86' },
    { name: 'Marmitaria Serra Negra', id: '4807dbd2-7681-4a6e-88b7-081e005683e9' },
    { name: 'Monteiro Restaurante', id: '1a52b3bc-74af-4be5-9845-5a862dcd8457' },
    { name: 'Prato Real Restaurante', id: 'd26240b4-3c62-4462-8de6-f689340b2b68' },
    { name: 'Que seja sabor', id: 'c3f220b9-ed8c-44e6-8abd-40a204506d7f' },
    { name: 'Restaurante Cabana', id: 'f890e4be-bf26-487f-b7a0-5f41b16058a5' },
    { name: 'Restaurante Divino Sabor', id: '1850968a-257d-4e93-aa28-809acccc871d' },
    { name: 'Restaurante VitStela', id: '0252a101-0d12-44a2-a4f7-1d42d32cb15c' },
    { name: 'Tempero de Família', id: 'f92032ce-7053-46ce-9e6c-cc33aab913a6' }
  ];

  console.log("=== STATUS DOS 10 LEADS DO LOTE NO DB ===");
  for (const l of leads) {
    const leadRow = await client.query('SELECT stage, attempt_count, last_contact_at FROM sales_leads WHERE id = $1', [l.id]);
    const msgs = await client.query('SELECT id, metadata->>\'kind\' as kind, created_at FROM sales_messages WHERE lead_id = $1 ORDER BY created_at ASC', [l.id]);
    console.log(`- ${l.name}: Stage=${leadRow.rows[0]?.stage}, Attempts=${leadRow.rows[0]?.attempt_count}, Msgs=${msgs.rows.length} (${msgs.rows.map(m => m.kind).join(', ')})`);
  }

  await client.end();
}

main().catch(console.error);

