import pg from 'pg';
import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState,
  sendEvolutionV2SalesText,
  checkEvolutionV2WhatsappNumber,
  sendEvolutionV2Presence
} from '../src/lib/evolution-v2-sales.js';
import { processAllInboundTrojan } from './handle-inbound-trojan.mjs';
import { buildHarveyStep1 } from '../src/lib/harvey-outbound-engine.js';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@127.0.0.1:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

const DAILY_TARGET_LEADS = 40;
const COMMERCIAL_WINDOW_START_HOUR = 9;
const COMMERCIAL_WINDOW_START_MINUTE = 15;
const COMMERCIAL_WINDOW_END_HOUR = 19;
const COMMERCIAL_WINDOW_END_MINUTE = 30;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --------------------------------------------------------------------------
// MENSAGEM PASSO 1: PADRÃO HARVEY ANTI-AI (CURIOSIDADE & PERMISSÃO)
// --------------------------------------------------------------------------
export function buildInquiryMessage(lead) {
  return buildHarveyStep1(lead);
}

// --------------------------------------------------------------------------
// SELEÇÃO SORTIDA DE CANDIDATOS (100% Mista entre todos os nichos)
// --------------------------------------------------------------------------
async function getAssortedCandidates(limit = 1) {
  const query = `
    SELECT id, business_name, city, state, segment, phone, normalized_phone, metadata, score
    FROM sales_leads
    WHERE stage IN ('discovered', 'verified')
      AND attempt_count = 0
      AND phone IS NOT NULL
      AND stage NOT IN ('discarded', 'opted_out')
      AND (metadata->>'outreach_strategy') IS NULL
    ORDER BY 
      COALESCE(score, 0) DESC,
      RANDOM()
    LIMIT $1
  `;
  const res = await pool.query(query, [limit]);
  return res.rows;
}

// --------------------------------------------------------------------------
// CONTAGEM DE DISPAROS DO PASSO 1 HOJE
// --------------------------------------------------------------------------
async function countStep1SentToday() {
  const res = await pool.query(`
    SELECT count(*)::int AS count
    FROM sales_messages
    WHERE direction = 'outbound'
      AND (metadata->>'kind' = 'trojan_inquiry_step1' OR body LIKE '%delivery%')
      AND created_at >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')
  `);
  return res.rows[0]?.count || 0;
}

// --------------------------------------------------------------------------
// DISPARO DE UM LEAD INDIVIDUAL COM VALIDAÇÃO REAL DE WHATSAPP E DIGITANDO
// --------------------------------------------------------------------------
export async function dispatchSingleLead(lead, evoConfig) {
  const phone = lead.normalized_phone || lead.phone;
  console.log(`\n----------------------------------------------------------------`);
  console.log(`🔍 Avaliando lead: ${lead.business_name} (${phone}) - ${lead.city}/${lead.state} [${lead.segment}]`);

  // 1. Validação Real do WhatsApp (inclui celular de 13 dígitos e fixo de 12 dígitos)
  const waCheck = await checkEvolutionV2WhatsappNumber({ phone }, evoConfig);

  if (!waCheck.exists) {
    console.log(`  ❌ WhatsApp INEXISTENTE ou desconectado para ${phone}. Descartando lead para preservar cota...`);
    await pool.query(`
      UPDATE sales_leads
      SET stage = 'discarded',
          discard_code = 'no_whatsapp',
          discard_details = 'Número não possui conta ativa no WhatsApp (Evolution API v2)',
          updated_at = now()
      WHERE id = $1
    `, [lead.id]);
    return { sent: false, reason: 'no_whatsapp' };
  }

  console.log(`  ✅ WhatsApp VÁLIDO confirmado pela Evolution API v2 (JID: ${waCheck.jid}).`);

  // 2. Pontuação: +30 pontos para WhatsApp verificado
  await pool.query(`
    UPDATE sales_leads
    SET score = COALESCE(score, 0) + CASE WHEN COALESCE((metadata->>'whatsapp_verified')::boolean, false) = true THEN 0 ELSE 30 END,
        metadata = jsonb_set(
          jsonb_set(COALESCE(metadata, '{}'::jsonb), '{whatsapp_verified}', 'true'::jsonb),
          '{whatsapp_jid}', to_jsonb($2::text)
        ),
        updated_at = now()
    WHERE id = $1
  `, [lead.id, waCheck.jid]);

  // 3. Montar mensagem Passo 1 (Spintax Dinâmica Universal)
  const msg = buildInquiryMessage(lead);
  console.log(`  💬 Mensagem Passo 1: "${msg}"`);

  // 4. Humanização: Simulação de "Digitando..." (4 a 6 segundos)
  console.log(`  ⏳ Enviando status "Digitando..." (composing)...`);
  await sendEvolutionV2Presence({ phone, presence: 'composing', delayMs: 4500 }, evoConfig);

  // 5. Sessão de conversa
  let convRes = await pool.query('SELECT id FROM sales_conversations WHERE lead_id = $1 LIMIT 1', [lead.id]);
  let convId;
  if (convRes.rows.length === 0) {
    const newConv = await pool.query(`
      INSERT INTO sales_conversations (lead_id, status, created_at, updated_at)
      VALUES ($1, 'active', now(), now())
      RETURNING id
    `, [lead.id]);
    convId = newConv.rows[0].id;
  } else {
    convId = convRes.rows[0].id;
  }

  // 6. Envio via Evolution API v2
  const sendRes = await sendEvolutionV2SalesText({ phone, text: msg }, evoConfig);

  // 7. Registro na tabela sales_messages
  await pool.query(`
    INSERT INTO sales_messages (
      lead_id, conversation_id, provider_message_id, direction,
      body, status, requires_approval, approved_at, sent_at, metadata, created_at
    ) VALUES (
      $1, $2, $3, 'outbound',
      $4, 'sent', false, now(), now(),
      jsonb_build_object('kind', 'trojan_inquiry_step1', 'step', 1, 'mode', 'assorted_drip'),
      now()
    ) ON CONFLICT (provider_message_id) DO NOTHING
  `, [lead.id, convId, sendRes.id, msg]);

  // 8. Atualização do status do lead
  await pool.query(`
    UPDATE sales_leads
    SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{outreach_strategy}', '"trojan_inquiry_step1"'::jsonb),
        attempt_count = attempt_count + 1,
        last_contact_at = now(),
        stage = 'awaiting_reply',
        updated_at = now()
    WHERE id = $1
  `, [lead.id]);

  console.log(`  🚀 Passo 1 enviado com sucesso! (ID: ${sendRes.id})`);
  return { sent: true, providerId: sendRes.id };
}

// --------------------------------------------------------------------------
// MODO TESTE DE LOTE SORTIDO (CLI)
// --------------------------------------------------------------------------
async function runTestBatch(targetCount = 2) {
  console.log(`\n================================================================`);
  console.log(`  INICIANDO LOTE DE TESTE SORTIDO (${targetCount} LEADS) `);
  console.log(`================================================================\n`);

  const evoConfig = evolutionV2SalesConfig();
  const conn = await getEvolutionV2ConnectionState(evoConfig);
  if (!conn.connected) {
    throw new Error(`WhatsApp não está conectado na instância "${evoConfig.instance}". Estado: ${conn.state}`);
  }
  console.log(`✅ WhatsApp conectado na instância "${evoConfig.instance}".\n`);

  let sentCount = 0;
  let attempts = 0;
  const maxAttempts = targetCount * 4;

  while (sentCount < targetCount && attempts < maxAttempts) {
    attempts++;
    const candidates = await getAssortedCandidates(1);
    if (candidates.length === 0) {
      console.log('⚠️ Nenhum lead disponível na fila para teste.');
      break;
    }

    const lead = candidates[0];
    const res = await dispatchSingleLead(lead, evoConfig);

    if (res.sent) {
      sentCount++;
      console.log(`  [Progresso Teste: ${sentCount}/${targetCount}]`);
      if (sentCount < targetCount) {
        const waitMs = 45000 + Math.floor(Math.random() * 40000);
        console.log(`  ⏳ Aguardando ${(waitMs / 1000).toFixed(1)}s (proteção de chip anti-ban)...\n`);
        await sleep(waitMs);
      }
    }
  }

  console.log(`\n🏁 Teste sortido concluído: ${sentCount} enviados com sucesso.`);
}

// --------------------------------------------------------------------------
// ORQUESTRADOR CONTÍNUO AUTÔNOMO (40 LEADS / DIA - 09h15 às 19h30 SORTIDOS)
// --------------------------------------------------------------------------
export async function runAutonomousOutreachLoop() {
  console.log('================================================================');
  console.log('   ORQUESTRADOR DIÁRIO AUTÔNOMO TÁPRONTO (40 LEADS / DIA)       ');
  console.log('   Janela Contínua Sortida: 09h15 às 19h30 (Todos os Nichos)   ');
  console.log('   Gotejamento Orgânico com Delay Anti-ban (45 a 85s)          ');
  console.log('================================================================\n');

  const evoConfig = evolutionV2SalesConfig();

  while (true) {
    try {
      // 1. Processar sempre os inbounds (Step 2, Step 3 e Ghosting Recovery) a cada ciclo
      await processAllInboundTrojan();

      // 2. Verificar horário comercial atual
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const totalMinutes = hour * 60 + minute;
      const windowStart = COMMERCIAL_WINDOW_START_HOUR * 60 + COMMERCIAL_WINDOW_START_MINUTE; // 09:15 = 555
      const windowEnd = COMMERCIAL_WINDOW_END_HOUR * 60 + COMMERCIAL_WINDOW_END_MINUTE;       // 19:30 = 1170
      const isWithinCommercialWindow = totalMinutes >= windowStart && totalMinutes <= windowEnd;

      // 3. Contabilizar envios de hoje
      const sentToday = await countStep1SentToday();

      if (isWithinCommercialWindow && sentToday < DAILY_TARGET_LEADS) {
        // Cálculo de pacing orgânico ao longo do dia
        const windowElapsed = totalMinutes - windowStart;
        const totalWindowDuration = windowEnd - windowStart; // 615 minutos
        const expectedPacedTarget = Math.max(1, Math.min(DAILY_TARGET_LEADS, Math.floor((windowElapsed / totalWindowDuration) * DAILY_TARGET_LEADS) + 1));

        if (sentToday < expectedPacedTarget) {
          const candidates = await getAssortedCandidates(1);
          if (candidates.length > 0) {
            const lead = candidates[0];
            const result = await dispatchSingleLead(lead, evoConfig);

            if (result.sent) {
              const waitMs = 45000 + Math.floor(Math.random() * 40000);
              console.log(`  [Progresso Diário: ${sentToday + 1}/${DAILY_TARGET_LEADS}] - Aguardando ${(waitMs / 1000).toFixed(1)}s...\n`);
              await sleep(waitMs);
            }
          }
        }
      }

      // Intervalo regular de 45 segundos entre checagens do loop
      await sleep(45000);
    } catch (err) {
      console.error('[Autonomous Loop Error]:', err.message);
      await sleep(30000);
    }
  }
}

// --------------------------------------------------------------------------
// EXECUÇÃO DIRETA
// --------------------------------------------------------------------------
const isDirect = process.argv[1] && /autonomous-daily-outreach\.mjs$/i.test(process.argv[1]);
if (isDirect) {
  const mode = process.argv[2];
  if (mode === 'test-batch') {
    const count = Number(process.argv[3]) || 2;
    runTestBatch(count)
      .then(() => pool.end())
      .catch((e) => { console.error(e); pool.end(); });
  } else {
    runAutonomousOutreachLoop().catch((err) => {
      console.error('[Autonomous Outreach Fatal]:', err);
    });
  }
}
