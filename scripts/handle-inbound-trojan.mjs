import pg from 'pg';
import {
  evolutionV2SalesConfig,
  sendEvolutionV2SalesText,
  sendEvolutionV2SalesMedia,
  sendEvolutionV2Presence
} from '../src/lib/evolution-v2-sales.js';
import { generateAiSalesReply } from '../src/lib/sales-conversational-ai.js';
import { readFile } from 'node:fs/promises';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@127.0.0.1:5432/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Lista de telefones protegidos / resolvidos manualmente que nunca devem receber automação
const PROTECTED_PHONES = new Set([
  '5514997013801', // Marmitaria La Mineira
  '5514996668189', // DONA NITA MARMITARIA
  '5514998325915', // Bom Sabor marmitaria
  '5514997992631', // Café da Di
  '5514996237187', // Sabor Brasil
  '5514991011313'  // Smash League Burger
]);

// --------------------------------------------------------------------------
// BUSCA DINÂMICA DE ITEM DESTAQUE REAL DO CARDÁPIO (Com Fallback Gastronômico)
// --------------------------------------------------------------------------
async function getFeaturedProduct(storeId, segment = 'restaurante') {
  if (storeId) {
    try {
      const itemRes = await pool.query(`
        SELECT name, price 
        FROM menu_items 
        WHERE store_id = $1 
          AND is_available = true
          AND image_url IS NOT NULL 
          AND length(trim(image_url)) > 10
        ORDER BY price DESC 
        LIMIT 1
      `, [storeId]);

      if (itemRes.rows.length > 0 && itemRes.rows[0].name) {
        return itemRes.rows[0].name.trim();
      }
    } catch {}
  }

  switch (segment) {
    case 'hamburgueria': return 'Hambúrguer Artesanal Especial';
    case 'pizzaria': return 'Pizza Especial da Casa';
    case 'bar':
    case 'petiscaria': return 'Porção Especial da Casa';
    case 'marmitaria': return 'Prato Executivo Especial';
    default: return 'Prato Principal';
  }
}

// --------------------------------------------------------------------------
// MOTOR CONVERSACIONAL DE IA PARA PROCESSAMENTO DE RESPOSTAS INBOUND
// --------------------------------------------------------------------------
async function handleAllInboundWithAI(evoConfig) {
  const pendingRes = await pool.query(`
    SELECT 
      l.id AS lead_id,
      l.business_name,
      l.phone,
      l.normalized_phone,
      l.city,
      l.segment,
      l.stage,
      l.automation_status,
      l.metadata,
      c.id AS conv_id,
      (SELECT body FROM sales_messages WHERE lead_id = l.id AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1) AS last_inbound,
      (SELECT created_at FROM sales_messages WHERE lead_id = l.id AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1) AS inbound_time,
      (SELECT created_at FROM sales_messages WHERE lead_id = l.id AND direction = 'outbound' ORDER BY created_at DESC LIMIT 1) AS outbound_time
    FROM sales_leads l
    JOIN sales_conversations c ON c.lead_id = l.id
    WHERE l.automation_status = 'active'
      AND l.stage NOT IN ('opted_out', 'human_handoff', 'resolved_manual')
      AND EXISTS (
        SELECT 1 FROM sales_messages 
        WHERE lead_id = l.id AND direction = 'inbound'
      )
  `);

  const now = new Date();
  const rows = pendingRes.rows.filter(r => {
    // 1. Lead protegido manualmente
    if (PROTECTED_PHONES.has(r.phone) || PROTECTED_PHONES.has(r.normalized_phone)) return false;

    const inTime = new Date(r.inbound_time);
    const outTime = r.outbound_time ? new Date(r.outbound_time) : new Date(0);
    const diffFromInbound = (now.getTime() - inTime.getTime()) / 1000;
    
    // 2. Trava de Mensagens Antigas (Stale Inbound): se a mensagem inbound chegou há mais de 3 horas, NÃO responder de surpresa!
    if (diffFromInbound > 3 * 3600) {
      return false;
    }

    // 3. Processa se a última mensagem foi inbound e com pelo menos 20 segundos de debounce para digitação contínua
    return inTime > outTime && diffFromInbound >= 20;
  });

  if (rows.length === 0) return;

  console.log(`[Conversational AI] ${rows.length} lead(s) com respostas prontas para atendimento.`);

  for (const row of rows) {
    const phone = row.normalized_phone || row.phone;
    const meta = row.metadata || {};
    const storeId = meta.store_id;

    // Conexão dedicada para gerenciar a transação com Postgres Advisory Lock
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. ADVISORY LOCK TRANSACIONAL (Elimina 100% de duplicação entre processos simultâneos)
      const lockRes = await client.query(
        "SELECT pg_try_advisory_xact_lock(hashtext('sales_lead_' || $1::text)) AS acquired",
        [row.lead_id]
      );
      if (!lockRes.rows[0]?.acquired) {
        console.log(`  🔒 Lead ${row.business_name} em processamento por outra rotina. Pulando.`);
        await client.query('ROLLBACK');
        continue;
      }

      // 2. Trava de Frequência Diária: no máximo 2 outbounds por lead nas últimas 24 horas
      const recentOutbounds = await client.query(`
        SELECT count(*)::int as count 
        FROM sales_messages 
        WHERE lead_id = $1 
          AND direction = 'outbound' 
          AND created_at >= now() - INTERVAL '24 hours'
      `, [row.lead_id]);

      if (recentOutbounds.rows[0]?.count >= 2) {
        console.log(`  ⏹️ [Limite Diário Atingido] Lead ${row.business_name} já recebeu ${recentOutbounds.rows[0].count} mensagens nas últimas 24h. Pausando para evitar incômodo.`);
        await client.query(`
          UPDATE sales_leads 
          SET stage = 'human_handoff', 
              automation_status = 'stopped',
              metadata = COALESCE(metadata, '{}'::jsonb) || '{"paused_reason": "daily_rate_limit_exceeded"}'::jsonb,
              updated_at = now()
          WHERE id = $1
        `, [row.lead_id]);
        await client.query('COMMIT');
        client.release();
        continue;
      }

      // 3. Detecção de Bot / Auto-Reply de WhatsApp Business
      const lastInboundText = String(row.last_inbound || '').toLowerCase();
      const isAutoReply = (
        lastInboundText.includes('agradece seu contato') ||
        lastInboundText.includes('como podemos ajudar') ||
        lastInboundText.includes('atendimento automático') ||
        lastInboundText.includes('mensagem automática') ||
        lastInboundText.includes('fora do nosso horário') ||
        lastInboundText.includes('no momento estamos ausentes') ||
        lastInboundText.includes('horário de funcionamento') ||
        lastInboundText.includes('pedidos delivery ou retirada somente pelo site') ||
        lastInboundText.includes('acesse o aplicativo') ||
        lastInboundText.includes('digite 1 para') ||
        lastInboundText.includes('digite 2 para')
      );

      const previousInbounds = await client.query(`
        SELECT body FROM sales_messages 
        WHERE lead_id = $1 AND direction = 'inbound' 
        ORDER BY created_at DESC LIMIT 3
      `, [row.lead_id]);

      if (isAutoReply && previousInbounds.rows.length >= 2) {
        const bodies = previousInbounds.rows.map(b => b.body?.trim().toLowerCase());
        const isRepeatedBot = bodies.length >= 2 && bodies[0] === bodies[1];
        if (isRepeatedBot) {
          console.log(`  🤖 [Bot Loop Detectado] Lead ${row.business_name} está enviando auto-respostas repetidas. Pausando automação para não ping-pongar.`);
          await client.query(`
            UPDATE sales_leads 
            SET stage = 'human_handoff', 
                automation_status = 'stopped',
                metadata = COALESCE(metadata, '{}'::jsonb) || '{"paused_reason": "bot_loop_detected"}'::jsonb,
                updated_at = now()
            WHERE id = $1
          `, [row.lead_id]);
          await client.query('COMMIT');
          client.release();
          continue;
        }
      }

      // 4. Trava anti-flood: verificar se alguma mensagem outbound foi enviada nos últimos 40 segundos
      const recentOutbound = await client.query(`
        SELECT created_at FROM sales_messages 
        WHERE lead_id = $1 AND direction = 'outbound' 
          AND created_at > NOW() - INTERVAL '40 seconds'
        LIMIT 1
      `, [row.lead_id]);

      if (recentOutbound.rows.length > 0) {
        console.log(`  ⏳ Mensagem recente já enviada para ${row.business_name}. Pulando.`);
        await client.query('ROLLBACK');
        continue;
      }

      console.log(`\n======================================================`);
      console.log(`[AI Resposta] Processando: ${row.business_name} (${phone})`);
      console.log(`Última mensagem inbound: "${row.last_inbound}"`);

      // 3. Obter histórico completo recente da conversa
      const historyRes = await client.query(`
        SELECT direction, body, created_at
        FROM sales_messages
        WHERE lead_id = $1
        ORDER BY created_at ASC
        LIMIT 20
      `, [row.lead_id]);
      const conversationHistory = historyRes.rows;

      // 4. Obter item destaque e URL demonstrativa 100% limpa (anti-spam, sem parâmetros de tracking)
      const featuredItem = await getFeaturedProduct(storeId, row.segment);
      const cleanSlug = meta.menu_slug || row.business_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const candidateMenuUrl = `https://taprontomenu.com.br/${cleanSlug}`;

      // 5. Acionar o Motor Conversacional de IA (Cloudflare Workers AI Llama 70B/8B)
      const aiDecision = await generateAiSalesReply({
        lead: row,
        conversationHistory,
        candidateMenuUrl,
        featuredItem
      });

      console.log(`  🤖 Decisão da IA: Ação = "${aiDecision.action}", Confiança = ${aiDecision.confidence}`);
      console.log(`  📝 Motivo: ${aiDecision.reasoning}`);
      console.log(`  💬 Mensagem Gerada:\n"${aiDecision.reply_text}"`);

      // 6. Tratamento de Ação
      if (aiDecision.action === 'opt_out') {
        // Enviar despedida educada se gerada
        if (aiDecision.reply_text) {
          const presenceDelay = 3500;
          await sendEvolutionV2Presence({ phone, presence: 'composing', delayMs: presenceDelay }, evoConfig);
          const sendRes = await sendEvolutionV2SalesText({ phone, text: aiDecision.reply_text }, evoConfig);

          await client.query(`
            INSERT INTO sales_messages (
              lead_id, conversation_id, provider_message_id, direction,
              body, status, sent_at, metadata, created_at
            ) VALUES (
              $1, $2, $3, 'outbound',
              $4, 'sent', now(),
              jsonb_build_object('kind', 'ai_opt_out_reply', 'reasoning', $5::text),
              now()
            ) ON CONFLICT (provider_message_id) DO NOTHING
          `, [row.lead_id, row.conv_id, sendRes.id, aiDecision.reply_text, aiDecision.reasoning]);
        }

        await client.query(`
          UPDATE sales_leads
          SET stage = 'opted_out',
              automation_status = 'stopped',
              opted_out_at = now(),
              stop_reason = $2,
              updated_at = now()
          WHERE id = $1
        `, [row.lead_id, aiDecision.reasoning || 'Opt-out identificado pela IA']);

        await client.query(`
          INSERT INTO sales_suppressions (normalized_phone, reason, source, created_at)
          VALUES ($1, 'Opt-out via WhatsApp', 'lead_opt_out', now())
          ON CONFLICT (normalized_phone) DO NOTHING
        `, [phone]);

        await client.query('COMMIT');
        console.log(`  ✓ Lead ${row.business_name} marcado como opt_out com sucesso.`);
        continue;
      }

      if (aiDecision.action === 'human_handoff' || aiDecision.action === 'assisted_setup') {
        // Se a mensagem do cliente contiver menção a envio de cardápio / PDF / foto, enviar confirmação imediata
        const isMediaSent = /\b(pdf|\.pdf|cardapio|cardápio|foto|tabela|anexo|segue|mandei)\b/i.test(lastInboundText);
        const replyText = isMediaSent
          ? 'Show! Recebi seu cardápio aqui, já estamos montando a versão oficial com seus preços e te aviso em instantes!'
          : (aiDecision.reply_text || 'Entendido! Já estou encaminhando para o nosso especialista dar sequência com você por aqui.');

        await sendEvolutionV2Presence({ phone, presence: 'composing', delayMs: 4500 }, evoConfig);
        const sendRes = await sendEvolutionV2SalesText({ phone, text: replyText }, evoConfig);

        await client.query(`
          INSERT INTO sales_messages (
            lead_id, conversation_id, provider_message_id, direction,
            body, status, sent_at, metadata, created_at
          ) VALUES (
            $1, $2, $3, 'outbound',
            $4, 'sent', now(),
            jsonb_build_object('kind', 'assisted_setup_cardapio_received', 'reasoning', $5::text),
            now()
          ) ON CONFLICT (provider_message_id) DO NOTHING
        `, [row.lead_id, row.conv_id, sendRes.id, replyText, aiDecision.reasoning || 'Cardápio recebido']);

        await client.query(`
          UPDATE sales_leads
          SET stage = 'human_handoff',
              automation_status = 'stopped',
              stop_reason = $2,
              metadata = COALESCE(metadata, '{}'::jsonb) || '{"assisted_setup": true, "has_sent_menu_media": true}'::jsonb,
              updated_at = now()
          WHERE id = $1
        `, [row.lead_id, isMediaSent ? 'Cardápio recebido para cadastro assistido' : (aiDecision.reasoning || 'Encaminhado para atendimento humano')]);

        await client.query('COMMIT');
        console.log(`  ℹ️ Lead ${row.business_name} transferido para atendimento humano (onboarding assistido).`);
        continue;
      }

      // Envio de resposta normal (deliver_demo, answer_objection, continue_conversation, etc.)
      if (aiDecision.reply_text) {
        // Humanização do tempo de digitação (3.5s a 7s proporcional ao texto)
        const presenceDelay = Math.min(7000, Math.max(3500, Math.floor(aiDecision.reply_text.length * 16)));
        console.log(`  ⏳ Simulando digitação por ${presenceDelay}ms...`);
        await sendEvolutionV2Presence({ phone, presence: 'composing', delayMs: presenceDelay }, evoConfig);

        const sendRes = await sendEvolutionV2SalesText({ phone, text: aiDecision.reply_text }, evoConfig);

        await client.query(`
          INSERT INTO sales_messages (
            lead_id, conversation_id, provider_message_id, direction,
            body, status, requires_approval, approved_at, sent_at, metadata, created_at
          ) VALUES (
            $1, $2, $3, 'outbound',
            $4, 'sent', false, now(), now(),
            jsonb_build_object(
              'kind', 'conversational_ai_reply',
              'action', $5::text,
              'delivered_link', $6::boolean,
              'confidence', $7::numeric,
              'reasoning', $8::text
            ),
            now()
          ) ON CONFLICT (provider_message_id) DO NOTHING
        `, [
          row.lead_id,
          row.conv_id,
          sendRes.id,
          aiDecision.reply_text,
          aiDecision.action,
          aiDecision.delivered_link || false,
          aiDecision.confidence || 0.9,
          aiDecision.reasoning
        ]);

        const nextStrategy = aiDecision.delivered_link ? 'value_first_demo_delivered' : (meta.outreach_strategy || 'value_first_in_conversation');

        await client.query(`
          UPDATE sales_leads
          SET metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{outreach_strategy}', $2::jsonb
              ),
              stage = 'engaged',
              last_contact_at = now(),
              updated_at = now()
          WHERE id = $1
        `, [row.lead_id, JSON.stringify(nextStrategy)]);

        console.log(`  ✓ Resposta enviada com sucesso para ${row.business_name}!`);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`  ❌ Erro ao processar lead ${row.business_name}:`, err.message);
    } finally {
      client.release();
    }
  }
}

// --------------------------------------------------------------------------
// TELEMETRIA PÓS-CLIQUE: GHOSTING RECOVERY (20 Minutos sem Resposta e Sem Pedido Teste)
// --------------------------------------------------------------------------
async function handleGhostingRecovery(evoConfig) {
  try {
    const ghostRes = await pool.query(`
      SELECT 
        l.id AS lead_id,
        l.business_name,
        l.phone,
        l.normalized_phone,
        l.metadata,
        c.id AS conv_id
      FROM sales_leads l
      JOIN sales_conversations c ON c.lead_id = l.id
      WHERE (l.metadata->>'outreach_strategy' = 'value_first_demo_delivered' OR l.metadata->>'outreach_strategy' = 'trojan_demo_delivered')
        AND l.metadata->>'link_clicked' = 'true'
        AND (l.metadata->>'ghosting_followup_sent') IS NULL
        AND NOW() - (l.metadata->>'last_link_click_at')::timestamptz >= INTERVAL '25 minutes'
        AND NOW() - (l.metadata->>'last_link_click_at')::timestamptz <= INTERVAL '6 hours'
        AND NOT EXISTS (
          SELECT 1 FROM sales_messages m 
          WHERE m.lead_id = l.id 
            AND m.direction = 'inbound' 
            AND m.created_at > (l.metadata->>'last_link_click_at')::timestamptz
        )
        AND NOT EXISTS (
          SELECT 1 FROM orders o 
          WHERE o.store_id::text = l.metadata->>'store_id'
        )
      LIMIT 3
    `);

    if (ghostRes.rows.length === 0) return;

    console.log(`[Ghosting Recovery] Leads que clicaram há >= 25min e não responderam/pediram: ${ghostRes.rows.length}`);

    for (const lead of ghostRes.rows) {
      if (PROTECTED_PHONES.has(lead.phone) || PROTECTED_PHONES.has(lead.normalized_phone)) continue;

      const phone = lead.normalized_phone || lead.phone;
      const meta = lead.metadata || {};
      const featuredItem = meta.featured_item;

      const ghostMsg = `Vi que você conseguiu abrir a prévia do cardápio aí! Ficou alguma dúvida de como os pedidos chegam prontos no computador ou impressora de vocês?\n\nSe quiser testar na prática hoje mesmo, é só me mandar uma foto do seu cardápio atual que eu deixo tudo configurado com os seus preços reais, sem custo.`;

      console.log(`  -> Enviando Ghosting Follow-up para ${lead.business_name}...`);
      await sendEvolutionV2Presence({ phone, presence: 'composing', delayMs: 4500 }, evoConfig);
      const sendRes = await sendEvolutionV2SalesText({ phone, text: ghostMsg }, evoConfig);

      await pool.query(`
        INSERT INTO sales_messages (
          lead_id, conversation_id, provider_message_id, direction,
          body, status, sent_at, metadata, created_at
        ) VALUES (
          $1, $2, $3, 'outbound',
          $4, 'sent', now(),
          jsonb_build_object('kind', 'step3_click_followup', 'step', 3),
          now()
        ) ON CONFLICT (provider_message_id) DO NOTHING
      `, [lead.lead_id, lead.conv_id, sendRes.id, ghostMsg]);

      await pool.query(`
        UPDATE sales_leads
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{ghosting_followup_sent}', 'true'::jsonb),
            updated_at = now()
        WHERE id = $1
      `, [lead.lead_id]);

      console.log(`  ✓ Ghosting follow-up enviado para ${lead.business_name}!`);
    }
  } catch (err) {
    console.warn('[Ghosting Recovery] Erro na verificação:', err.message);
  }
}

// --------------------------------------------------------------------------
// FUNÇÃO PRINCIPAL DE PROCESSAMENTO (Com Global Advisory Mutex)
// --------------------------------------------------------------------------
export async function processAllInboundTrojan() {
  const globalLockRes = await pool.query(
    "SELECT pg_try_advisory_lock(hashtext('global_handle_inbound_trojan')) AS acquired"
  );
  if (!globalLockRes.rows[0]?.acquired) {
    console.log('[Inbound Cron] Outra execução já está ativa. Ignorando execução concorrente.');
    return;
  }

  try {
    const evoConfig = evolutionV2SalesConfig();

    // 1. Processar todas as respostas inbound pendentes com IA Conversacional
    await handleAllInboundWithAI(evoConfig);

    // 2. Telemetria Pós-Clique (Ghosting Recovery)
    await handleGhostingRecovery(evoConfig);
  } finally {
    await pool.query("SELECT pg_advisory_unlock(hashtext('global_handle_inbound_trojan'))").catch(() => {});
  }
}

// --------------------------------------------------------------------------
// EXECUÇÃO DIRETA VIA CLI
// --------------------------------------------------------------------------
const isDirect = process.argv[1] && /handle-inbound-trojan\.mjs$/i.test(process.argv[1]);
if (isDirect) {
  processAllInboundTrojan()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      pool.end();
    });
}
