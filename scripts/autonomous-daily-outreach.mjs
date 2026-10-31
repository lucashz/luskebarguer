import pg from 'pg';
import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState,
  sendEvolutionV2SalesText,
  checkEvolutionV2WhatsappNumber,
  sendEvolutionV2Presence
} from '../src/lib/evolution-v2-sales.js';
import { processAllInboundTrojan } from './handle-inbound-trojan.mjs';
import { buildValueFirstStep1 } from '../src/lib/sales-automation.js';
import { provisionOutreachStore } from '../src/lib/outreach-store-provisioning.js';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@127.0.0.1:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

const DAILY_TARGET_LEADS = 40;
const COMMERCIAL_WINDOW_START_HOUR = 9;
const COMMERCIAL_WINDOW_START_MINUTE = 15;
const COMMERCIAL_WINDOW_END_HOUR = 19;
const COMMERCIAL_WINDOW_END_MINUTE = 0;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --------------------------------------------------------------------------
// MENSAGEM PASSO 1: PADRÃO VALUE-FIRST CONSULTIVO (DIRETO E TRANSPARENTE)
// --------------------------------------------------------------------------
export function buildInquiryMessage(lead) {
  return buildValueFirstStep1(lead);
}

// --------------------------------------------------------------------------
// SELEÇÃO SORTIDA DE CANDIDATOS (100% Mista entre todos os nichos)
// --------------------------------------------------------------------------
export async function getAssortedCandidates(limit = 1) {
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
export async function countStep1SentToday() {
  const res = await pool.query(`
    SELECT count(*)::int AS count
    FROM sales_messages
    WHERE direction = 'outbound'
      AND (metadata->>'kind' IN ('step1_direct_value', 'trojan_inquiry_step1') OR body LIKE '%TáPronto%')
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
  console.log(`🔍 Avaliando lead: ${lead.business_name} (${phone}) - ${lead.city || 'SP'}/${lead.state || 'SP'} [${lead.segment || 'geral'}]`);

  // 1. Validação Real do WhatsApp (Evolution API v2 - suporta móvel 13 dígitos e fixo 12 dígitos)
  const waCheck = await checkEvolutionV2WhatsappNumber({ phone }, evoConfig);

  if (!waCheck.exists) {
    console.log(`  ❌ WhatsApp INEXISTENTE para ${phone}. Descartando lead para preservar cota...`);
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

  // 2.5. Garantir provisionamento da loja demonstrativa com fotos gastronômicas de alta qualidade
  if (!lead.metadata?.menu_slug) {
    try {
      const prov = await provisionOutreachStore({ lead, pool, baseUrl: 'https://taprontomenu.com.br' });
      if (prov?.ok) {
        lead.metadata = { ...lead.metadata, menu_slug: prov.slug, menu_url: prov.menuUrl, store_id: prov.storeId };
        console.log(`  🏪 Loja demonstrativa pronta: ${prov.menuUrl}`);
      }
    } catch (errProv) {
      console.warn(`  ⚠️ Aviso ao provisionar loja para ${lead.business_name}:`, errProv.message);
    }
  }

  // 3. Montar mensagem Passo 1 (Value-First Transparente, Direto e Curto)
  const msg = buildValueFirstStep1(lead);
  console.log(`  💬 Mensagem Passo 1 (${msg.length} caracteres):\n"${msg}"`);

  // 4. Humanização: Simulação de "Digitando..." (4 a 6 segundos)
  console.log(`  ⏳ Enviando status "Digitando..." (composing por 5s)...`);
  await sendEvolutionV2Presence({ phone, presence: 'composing', delayMs: 5000 }, evoConfig);

  // 5. Sessão de conversa no banco de dados
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
      jsonb_build_object('kind', 'step1_direct_value', 'step', 1, 'mode', 'value_first_assorted_drip'),
      now()
    ) ON CONFLICT (provider_message_id) DO NOTHING
  `, [lead.id, convId, sendRes.id, msg]);

  // 8. Atualização do status do lead
  await pool.query(`
    UPDATE sales_leads
    SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{outreach_strategy}', '"value_first_outreach"'::jsonb),
        attempt_count = attempt_count + 1,
        last_contact_at = now(),
        stage = 'awaiting_reply',
        updated_at = now()
    WHERE id = $1
  `, [lead.id]);

  console.log(`  🚀 Passo 1 (Value-First) enviado com sucesso! (ID: ${sendRes.id})`);
  return { sent: true, providerId: sendRes.id };
}

// --------------------------------------------------------------------------
// MODO TESTE DE LOTE SORTIDO (CLI)
// --------------------------------------------------------------------------
export async function runTestBatch(targetCount = 3) {
  console.log(`\n================================================================`);
  console.log(`  INICIANDO LOTE PILOTO VALUE-FIRST SORTIDO (${targetCount} LEADS) `);
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

  console.log(`\n🏁 Teste piloto concluído: ${sentCount} lead(s) enviados com sucesso com o fluxo Value-First.`);
  return { sentCount };
}

// --------------------------------------------------------------------------
// ORQUESTRADOR CONTÍNUO AUTÔNOMO (40 LEADS / DIA - 09h15 às 19h00 SORTIDOS)
// --------------------------------------------------------------------------
export async function runAutonomousOutreachLoop() {
  console.log('================================================================');
  console.log('   ORQUESTRADOR DIÁRIO AUTÔNOMO TÁPRONTO (40 LEADS / DIA)       ');
  console.log('   Metodologia: Value-First Transparente (2 Passos + Follow-up)');
  console.log('   Janela Contínua Sortida: 09h15 às 19h00 (Todos os Nichos)   ');
  console.log('   Gotejamento Orgânico com Delay Anti-ban (45 a 85s)          ');
  console.log('================================================================\n');

  const evoConfig = evolutionV2SalesConfig();

  while (true) {
    try {
      // 1. Processar sempre os inbounds (Step 2 Demo, Step 3 Followup, Cardápios e Ghosting)
      await processAllInboundTrojan();

      // 2. Verificar horário comercial atual
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const totalMinutes = hour * 60 + minute;
      const windowStart = COMMERCIAL_WINDOW_START_HOUR * 60 + COMMERCIAL_WINDOW_START_MINUTE; // 09:15 = 555
      const windowEnd = COMMERCIAL_WINDOW_END_HOUR * 60 + COMMERCIAL_WINDOW_END_MINUTE;       // 19:00 = 1140
      const isWithinCommercialWindow = totalMinutes >= windowStart && totalMinutes <= windowEnd;

      // 3. Contabilizar envios de hoje
      const sentToday = await countStep1SentToday();

      if (isWithinCommercialWindow && sentToday < DAILY_TARGET_LEADS) {
        // Cálculo de pacing orgânico contínuo ao longo do dia (585 minutos totais)
        const windowElapsed = totalMinutes - windowStart;
        const totalWindowDuration = windowEnd - windowStart; // 585 minutos
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
    const count = Number(process.argv[3]) || 3;
    runTestBatch(count)
      .then(() => pool.end())
      .catch((e) => { console.error(e); pool.end(); });
  } else {
    runAutonomousOutreachLoop().catch((err) => {
      console.error('[Autonomous Outreach Fatal]:', err);
    });
  }
}
