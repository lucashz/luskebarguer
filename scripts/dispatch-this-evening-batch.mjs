import pg from 'pg';
import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState,
  sendEvolutionV2SalesText,
  sendEvolutionV2Presence
} from '../src/lib/evolution-v2-sales.js';
import { processAllInboundTrojan } from './handle-inbound-trojan.mjs';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

const PROTECTED_PHONES = new Set([
  '5514998325915', // Bom Sabor marmitaria
  '5514996668189', // DONA NITA MARMITARIA
  '5514997013801', // Marmitaria La Mineira
  '5514997992631', // Café da Di
  '5514996237187', // Sabor Brasil
  '5514991011313'  // Smash League Burger
]);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isForce = args.includes('--force');

  console.log('================================================================');
  console.log('   DISPARO DO TURNO DA NOITE (JANTAR) — CAVALO DE TROIA PASSO 1  ');
  console.log('   Janela Recomendada: 17h00 às 19h45 (Abertura do Delivery Noturno)');
  console.log('================================================================\n');

  if (isDryRun) {
    console.log('🔍 MODO DRY-RUN ATIVADO: Nenhuma mensagem real será disparada.\n');
  }

  // 1. Checagem de Conectividade Evolution API
  const evoConfig = evolutionV2SalesConfig();
  const conn = await getEvolutionV2ConnectionState(evoConfig);
  if (!conn.connected) {
    throw new Error(`WhatsApp não está conectado na Evolution API (${evoConfig.instance}). Estado: ${conn.state}`);
  }
  console.log(`✅ WhatsApp CONECTADO na instância "${evoConfig.instance}".\n`);

  // 2. Trava de Horário Comercial (17h00 às 19h45)
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const totalMinutes = hour * 60 + minute;
  const startWindow = 17 * 60; // 17h00
  const endWindow = 19 * 60 + 45; // 19h45

  if (!isForce && !isDryRun && (totalMinutes < startWindow || totalMinutes > endWindow)) {
    console.log(`⚠️ Horário atual (${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}) fora da janela ideal da noite (17h00 às 19h45).`);
    console.log(`   Para disparar antes ou após o horário programado, utilize a flag --force.`);
    console.log(`   Exemplo: node scripts/dispatch-this-evening-batch.mjs --force\n`);
    await pool.end();
    return;
  }

  // 3. Buscar os 20 leads preparados para a noite de hoje
  const res = await pool.query(`
    SELECT 
      id, 
      business_name, 
      segment, 
      city, 
      state, 
      phone, 
      metadata,
      metadata->>'step1_precomputed_message' AS step1_message,
      metadata->>'menu_slug' AS slug
    FROM sales_leads
    WHERE metadata->>'target_date' = '2026-10-29'
      AND metadata->>'target_turn' = 'noite'
      AND stage = 'preview_ready'
      AND last_contact_at IS NULL
      AND attempt_count = 0
    ORDER BY (metadata->>'evening_batch_index')::int ASC, state ASC
  `);

  const leads = res.rows.filter(l => !PROTECTED_PHONES.has(l.phone));

  console.log(`📋 Total de leads na fila da noite: ${leads.length}\n`);

  if (leads.length === 0) {
    console.log('✅ Nenhum lead pendente para disparo neste turno.');
    await pool.end();
    return;
  }

  let sentCount = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const phone = lead.phone;
    const msg = lead.step1_message;

    console.log(`----------------------------------------------------------------`);
    console.log(`🚀 [${i + 1}/${leads.length}] [${lead.state}] ${lead.business_name} (${lead.city}) [${lead.segment}]`);
    console.log(`   Telefone: ${phone} | Loja: https://taprontomenu.com.br/${lead.slug}`);
    console.log(`   Mensagem Passo 1: "${msg}"`);

    if (!isDryRun) {
      // 4. Digitação humana (4 a 6 segundos)
      const typingMs = 4000 + Math.floor(Math.random() * 2500);
      console.log(`   ⏳ Simulando digitação por ${(typingMs / 1000).toFixed(1)}s...`);
      await sendEvolutionV2Presence({ phone, presence: 'composing', delayMs: typingMs }, evoConfig);
      await sleep(typingMs);

      // 5. Envio real via Evolution API
      const sendRes = await sendEvolutionV2SalesText({ phone, text: msg }, evoConfig);
      console.log(`   ✓ Enviado com sucesso! (ID: ${sendRes.id})`);

      // 6. Atualização no Banco de Dados
      await pool.query(`
        UPDATE sales_leads
        SET stage = 'awaiting_reply',
            attempt_count = attempt_count + 1,
            last_contact_at = now(),
            metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{outreach_strategy}',
              '"trojan_inquiry_step1"'::jsonb
            ),
            updated_at = now()
        WHERE id = $1
      `, [lead.id]);

      // 7. Registro em sales_messages
      await pool.query(`
        INSERT INTO sales_messages (
          lead_id, provider_message_id, direction,
          body, status, requires_approval, sent_at, metadata, created_at
        ) VALUES (
          $1, $2, 'outbound',
          $3, 'sent', false, now(),
          jsonb_build_object(
            'kind', 'trojan_inquiry_step1',
            'step', 1,
            'turn', 'noite',
            'batch_date', '2026-10-29'
          ),
          now()
        ) ON CONFLICT (provider_message_id) DO NOTHING
      `, [lead.id, sendRes.id, msg]);

      sentCount++;

      // 8. Delay anti-ban entre mensagens (45s a 75s) se houver próximo lead
      if (i < leads.length - 1) {
        const cooldown = 45000 + Math.floor(Math.random() * 30000);
        console.log(`   ⏱️ Pausa anti-ban: aguardando ${(cooldown / 1000).toFixed(1)}s antes do próximo envio...\n`);
        await sleep(cooldown);
      }
    } else {
      sentCount++;
    }
  }

  console.log('\n================================================================');
  console.log(`🏁 Lote da Noite Concluído! Total processado: ${sentCount}/${leads.length}`);
  console.log('================================================================\n');

  if (!isDryRun) {
    console.log('🔄 Executando varredura de respostas inbound...');
    await processAllInboundTrojan().catch(() => {});
  }

  await pool.end();
}

main().catch(err => {
  console.error("ERRO FATAL:", err);
  process.exit(1);
});
