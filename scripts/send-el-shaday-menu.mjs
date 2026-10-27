import pg from 'pg';
import {
  evolutionV2SalesConfig,
  sendEvolutionV2SalesText
} from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const PHONE = '5514991555260';
const LEAD_ID = '5ff87f0d-8131-4a26-bdfd-b125de8bb5e0';
const MENU_URL = 'https://taprontomenu.com.br/el-shaday-hamburgueria';

const MESSAGE_TEXT = `Fiz aqui pra vocês verem na prática como fica! 

👉 ${MENU_URL}

Montei uma demonstração importando os itens direto do PDF que vocês mandaram (com os artesanais, linha de frango, tradicionais, hot dogs e os adicionais).

Como foi uma importação automática do arquivo, pode haver algum pequeno erro ou ajuste em preços e opções. Dá uma olhada no celular pra ver como o cliente escolhe rápido e o pedido já entra somado e organizado no painel da plataforma.

Se quiser que eu ajuste qualquer produto, foto ou valor, só me dar um toque aqui que arrumo na hora!`;

async function main() {
  console.log(`=== ENVIANDO MENSAGEM COM O CARDÁPIO PARA EL SHADAY (${PHONE}) ===\n`);

  // 1. Enviar mensagem de WhatsApp
  const evoConfig = evolutionV2SalesConfig();
  console.log('1. Disparando mensagem via Evolution API v2...');
  const sendRes = await sendEvolutionV2SalesText({ phone: PHONE, text: MESSAGE_TEXT }, evoConfig);
  console.log('✓ Mensagem enviada com sucesso pela Evolution API:', sendRes);

  // 2. Registrar no banco se conexão estiver disponível
  try {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL
    });

    const convRes = await pool.query('SELECT id FROM sales_conversations WHERE lead_id = $1 LIMIT 1', [LEAD_ID]);
    const convId = convRes.rows[0]?.id || null;

    await pool.query(`
      INSERT INTO sales_messages (
        lead_id, conversation_id, provider_message_id, direction,
        body, status, requires_approval, approved_at, sent_at, metadata, created_at
      ) VALUES (
        $1, $2, $3, 'outbound',
        $4, 'sent', false, now(), now(),
        jsonb_build_object('kind', 'trojan_delivery_menu', 'url', $5),
        now()
      )
    `, [LEAD_ID, convId, sendRes?.id || `manual-${Date.now()}`, MESSAGE_TEXT, MENU_URL]);

    await pool.query(`
      UPDATE sales_leads
      SET stage = 'engaged',
          last_contact_at = now(),
          metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{outreach_strategy}', '"trojan_menu_delivered"'::jsonb),
          updated_at = now()
      WHERE id = $1
    `, [LEAD_ID]);

    console.log('✓ Registro gravado com sucesso no CRM!');
    await pool.end();
  } catch (dbErr) {
    console.warn('Aviso: Registro no banco local falhou (túnel pode estar offline), mas a mensagem foi enviada pelo WhatsApp!', dbErr.message);
  }

  console.log('\n========================================');
  console.log('🎉 CARDÁPIO ENTREGUE COM SUCESSO AO LEAD!');
  console.log('========================================');
}

main().catch(console.error);
