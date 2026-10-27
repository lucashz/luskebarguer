import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const leadId = '5ff87f0d-8131-4a26-bdfd-b125de8bb5e0';
  const providerId = '3EB03705729063EDC07671';
  const url = 'https://taprontomenu.com.br/el-shaday-hamburgueria';
  const text = `Fiz aqui pra vocês verem na prática como fica!\n\n👉 ${url}\n\nMontei uma demonstração importando os itens direto do PDF que vocês mandaram (com os artesanais, linha de frango, tradicionais, hot dogs e os adicionais).\n\nComo foi uma importação automática do arquivo, pode haver algum pequeno erro ou ajuste em preços e opções. Dá uma olhada no celular pra ver como o cliente escolhe rápido e o pedido já chega somado certinho no WhatsApp de vocês.\n\nSe quiser que eu ajuste qualquer produto, foto ou valor, só me dar um toque aqui que arrumo na hora!`;

  const convRes = await pool.query('SELECT id FROM sales_conversations WHERE lead_id = $1 LIMIT 1', [leadId]);
  const convId = convRes.rows[0]?.id || null;

  await pool.query(`
    INSERT INTO sales_messages (
      lead_id, conversation_id, provider_message_id, direction,
      body, status, requires_approval, approved_at, sent_at, metadata, created_at
    ) VALUES (
      $1, $2, $3, 'outbound',
      $4, 'sent', false, now(), now(),
      jsonb_build_object('kind', 'trojan_delivery_menu', 'url', $5::text),
      now()
    )
    ON CONFLICT (provider_message_id) DO NOTHING
  `, [leadId, convId, providerId, text, url]);

  await pool.query(`
    UPDATE sales_leads
    SET stage = 'engaged',
        last_contact_at = now(),
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{outreach_strategy}', '"trojan_menu_delivered"'::jsonb),
        updated_at = now()
    WHERE id = $1
  `, [leadId]);

  console.log('CRM synced successfully in production DB!');
  await pool.end();
}

main().catch(console.error);
