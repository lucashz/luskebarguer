import pg from 'pg';

const pool = new pg.Pool({ connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public' });

async function protectLeads() {
  const phones = [
    '5514997992631', // Café da Di
    '5514996237187', // Sabor Brasil
    '5514991011313', // Smash League Burger
    '5514998325915', // Bom Sabor marmitaria
    '5514996668189', // Dona Nita
    '5514997013801'  // La Mineira
  ];

  const res = await pool.query(`
    UPDATE sales_leads
    SET stage = 'human_handoff',
        automation_status = 'stopped',
        metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{protection_reason}',
          '"protected_prevent_multi_day_loop"'::jsonb
        ),
        updated_at = now()
    WHERE phone = ANY($1::text[])
    RETURNING id, business_name, phone, stage, automation_status;
  `, [phones]);

  console.log('Leads atualizados e protegidos no banco:');
  console.table(res.rows);

  await pool.end();
}

protectLeads().catch(console.error);
