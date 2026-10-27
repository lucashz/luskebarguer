import pg from 'pg';
import {
  evolutionV2SalesConfig,
  sendEvolutionV2SalesText,
  sendEvolutionV2SalesMedia,
  sendEvolutionV2Presence
} from '../src/lib/evolution-v2-sales.js';
import { buildTrackedMenuUrl } from '../src/lib/outreach-click-tracking.js';
import { buildHarveyStep2 } from '../src/lib/harvey-outbound-engine.js';
import { readFile } from 'node:fs/promises';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@127.0.0.1:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --------------------------------------------------------------------------
// CLASSIFICADOR DE RESPOSTAS INBOUND & INTERCEPTOR DE BOT/URA
// --------------------------------------------------------------------------
export function classifyInboundMessage(text = '', diffSeconds = 60) {
  const clean = String(text || '').trim();
  const lower = clean.toLowerCase();

  // 1. Resposta ultra-rápida (< 3 segundos) ou com menu de bot/URA
  const hasUraPattern = /\b(digite\s*[1-9]|op[çc][ãa]o\s*[1-9]|[1-9]\s*[-–)]\s*(atendimento|pedidos|card[aá]pio|falar|entrega)|escolha\s*uma\s*op[çc][ãa]o)\b/i.test(clean);
  const isAutoGreeting = diffSeconds < 4 && /\b(bem[- ]vindo|ol[aá]|automaticamente|rob[oô]|assistente virtual)\b/i.test(lower);

  if (hasUraPattern || isAutoGreeting) {
    return {
      type: 'BOT_URA',
      confidence: 'high',
      needsHumanHandshake: hasUraPattern && !/\b(1|2)\s*[-–)]\s*card[aá]pio/i.test(clean)
    };
  }

  // 2. Concorrente / Agregador identificado no link ou texto
  const competitorPatterns = [
    { name: 'Anota AI', regex: /\b(anota\.ai|anotaai)\b/i },
    { name: 'Goomer', regex: /\b(goomer\.app|goomer)\b/i },
    { name: 'InstaDelivery', regex: /\b(instadelivery|instadelivery\.com\.br)\b/i },
    { name: 'Cardápio Web', regex: /\b(cardapioweb\.com|cardapioweb)\b/i },
    { name: 'iFood', regex: /\b(ifood\.com\.br|ifood)\b/i },
    { name: 'OlaClick', regex: /\b(olaclick|ola\.click)\b/i }
  ];

  for (const comp of competitorPatterns) {
    if (comp.regex.test(lower)) {
      return { type: 'COMPETITOR', competitor: comp.name };
    }
  }

  // 3. Mídia / Arquivo / Cardápio em formato estático
  if (lower.includes('pdf') || lower.includes('.pdf') || lower.includes('documento') || lower.includes('segue o cardápio') || lower.includes('cardapio')) {
    return { type: 'PDF_OR_IMAGE' };
  }

  // 4. Pergunta direta sobre o pedido ("o que vai querer?", "qual o endereço?")
  const isDirectOrderPrompt = /\b(vai querer|o que vai|qual o seu pedido|posso anotar|qual o endere[çc]o|vai pedir|qual o seu nome|entrega ou retirada)\b/i.test(lower);
  if (isDirectOrderPrompt) {
    return { type: 'ORDER_PROMPT' };
  }

  return { type: 'HUMAN_TEXT' };
}

// Validação de Resposta Afirmativa para o Step 2 (Permissão de Loja Demo)
function isAffirmativeReply(text = '') {
  const clean = text.toLowerCase().trim();
  const patterns = [
    /\b(pode|sim|manda|claro|manda ai|manda aí|quero|quero ver|beleza|blz|manda o link|pode sim|mande|envia|enviar|com certeza|bora|vamos|manda bala|manda aqui)\b/i,
    /pode\s*mandar/i,
    /pode\s*enviar/i,
    /quero\s*sim/i,
    /pode\s*ser/i
  ];
  return patterns.some(p => p.test(clean));
}

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

  // Fallbacks gastronômicos por segmento
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
// GERADOR DE COPY DO STEP 2 (Pivot com Pattern Interrupt, Elogio Autêntico e Spintax)
// --------------------------------------------------------------------------
export function buildStep2PivotMessage({ lead = {}, itemName, classification, segment }) {
  const meta = lead.metadata || {};
  const hasRealScrapedMenu = Boolean(
    meta.has_real_menu || 
    meta.scraped_menu || 
    (Array.isArray(meta.scraped_items) && meta.scraped_items.length > 0)
  );

  const rawRating = meta.rating || lead.rating;
  const rating = rawRating ? String(rawRating).replace(',', '.') : null;
  const reviewsCount = meta.reviews_count || lead.reviews_count;
  const ratingText = rating ? `nota ${rating}` : 'excelente reputação';
  const reviewsText = reviewsCount ? ` (${reviewsCount} avaliações)` : '';
  const reputationPraise = `Show de bola! Dei uma olhada no perfil de vocês no Google e vi que estão com ${ratingText}${reviewsText}, parabéns pelo capricho e pela reputação!`;

  const isPdf = classification.type === 'PDF_OR_IMAGE';
  const frictionDetail = isPdf
    ? 'no cardápio em PDF/foto o cliente precisa ficar dando zoom no celular e somando o pedido na calculadora'
    : 'mandar texto ou valores soltos no WhatsApp faz o cliente ter que ficar somando preços e adicionais na mão';

  // Cenário 1: Concorrente identificado (Anota AI, Goomer, iFood, etc.)
  if (classification.type === 'COMPETITOR') {
    const comp = classification.competitor;
    if (hasRealScrapedMenu && itemName) {
      const copies = [
        `Show! Dei uma olhada no cardápio de vocês no ${comp}, esse ${itemName} parece bom demais!\n\nA gente desenvolveu o TáPronto justamente pra quem já usa ferramentas como o ${comp}, mas quer velocidade instantânea de carregamento no celular e o pedido caindo direto no Painel Gestor com alerta sonoro e impressão automática na cozinha, sem depender de intermediações.\n\nPosso te mandar uma demonstração rápida que montei com os produtos de vocês pra você comparar a velocidade?`,
        `Maravilha! Vi o link de vocês no ${comp}, o capricho no ${itemName} chama muita atenção!\n\nMontamos uma demonstração rápida no TáPronto para estabelecimentos que buscam zero travamentos no horário de pico e impressão térmica automática direta no balcão.\n\nPosso te mandar o link de teste com a loja de vocês pra você ver como ficou? Ficou muito bacana.`
      ];
      return copies[Math.floor(Math.random() * copies.length)];
    } else {
      const copies = [
        `Show de bola! Vi o link de vocês no ${comp} e também o perfil no Google com ${ratingText}${reviewsText}, parabéns pelo capricho e pela reputação!\n\nA gente desenvolveu o TáPronto justamente pra estabelecimentos que querem velocidade instantânea de carregamento no celular e o pedido caindo direto no Painel Gestor com alerta sonoro e impressão automática na cozinha, com taxa zero.\n\nMontei uma prévia ilustrada com produtos do segmento de vocês pra você comparar a agilidade na prática em 30 segundos. Posso te mandar o link de teste?`,
        `Maravilha! Vi as avaliações no Google de vocês com ${ratingText}${reviewsText} e o link no ${comp}.\n\nMontamos uma demonstração rápida no TáPronto com produtos ilustrados do seu segmento para mostrar como o pedido chega sem travamentos, direto no painel com alerta sonoro e impressão térmica no balcão.\n\nPosso te mandar o link de teste pra você ver como ficou?`
      ];
      return copies[Math.floor(Math.random() * copies.length)];
    }
  }

  // Cenário 2: Pergunta direta de pedido ("Vai querer pedir o quê?")
  if (classification.type === 'ORDER_PROMPT') {
    if (hasRealScrapedMenu && itemName) {
      return `Estava dando uma olhada aqui nas opções e esse ${itemName} de vocês me deu água na boca, parabéns pelo produto!\n\nMas antes te confesso que entrei em contato porque trabalho com tecnologia pra delivery e montei uma versão rápida do cardápio de vocês: o cliente escolhe os opcionais em 30 segundos e o pedido cai direto no Painel Gestor TáPronto com alerta sonoro e impressão automática na cozinha, sem depender de calculadora ou taxas do iFood.\n\nPosso te mandar o link pra você ver como ficou a loja de vocês pronta? Ficou muito legal.`;
    } else {
      return `${reputationPraise}\n\nTe confesso que entrei em contato porque trabalho com tecnologia pra delivery e montei uma demonstração prática com cardápio ilustrado do segmento de vocês: o cliente escolhe os adicionais em 30 segundos e o pedido cai direto no Painel Gestor TáPronto com alerta sonoro e impressão automática no balcão, sem depender de calculadora no WhatsApp.\n\nPosso te mandar o link de teste pra você ver como ficou a navegação? Ficou bem legal.`;
    }
  }

  // Cenário 3: Padrão (PDF, Foto ou Mensagem Humana)
  if (hasRealScrapedMenu && itemName) {
    const copies = [
      `Sensacional! Eu bati o olho no cardápio de vocês e esse ${itemName} dá água na boca, parabéns pelo capricho!\n\nMas reparei que ${frictionDetail} pra poder pedir.\n\nA gente montou uma versão rápida e moderna do cardápio de vocês onde o cliente monta o pedido em 30 segundos e já cai somado direto no Painel Gestor TáPronto com alerta sonoro e impressão automática na cozinha, sem depender de calculadora ou taxas do iFood.\n\nPosso te mandar o link aqui pra você ver como ficou com os seus produtos?`,
      `Show de bola! Dei uma conferida geral e já fiquei de olho nesse ${itemName}, parece absurdo de bom!\n\nSó vi que ${frictionDetail}.\n\nDesenvolvemos uma versão interativa pro cardápio de vocês: o cliente seleciona os adicionais na hora e o pedido chega pronto e impresso na bancada pelo Painel Gestor TáPronto, com taxa zero.\n\nPosso te mandar o link da loja de teste de vocês pra você dar uma olhada rápida?`,
      `Top demais! Esse ${itemName} de vocês chama muita atenção, muito bem apresentado!\n\nMas sei como é corrido no delivery quando ${frictionDetail}.\n\nCriamos uma demonstração limpa do cardápio de vocês no TáPronto: o pedido entra 100% organizado no Painel Gestor com sinal sonoro e impressão automática na cozinha.\n\nQuer dar uma olhada em como ficou o cardápio de vocês montado?`
    ];
    return copies[Math.floor(Math.random() * copies.length)];
  }

  // Fallback Template Padrão: Elogio autêntico baseado nos dados do Google Maps
  const copies = [
    `${reputationPraise}\n\nMas reparei que ${frictionDetail} pra poder pedir.\n\nA gente montou uma demonstração rápida e moderna com cardápio ilustrado do segmento de vocês: o cliente escolhe os adicionais em 30 segundos e o pedido já cai somado direto no Painel Gestor TáPronto com alerta sonoro e impressão automática na cozinha, sem depender de calculadora ou taxas do iFood.\n\nPosso te mandar o link aqui pra você fazer um teste rápido e ver como ficou a loja? Ficou bem bacana.`,
    `Show de bola! Dei uma olhada nas avaliações de vocês no Google e vi que estão com ${ratingText}${reviewsText}, parabéns pelo capricho e pela reputação!\n\nMas sei como é corrido no delivery quando ${frictionDetail}.\n\nDesenvolvemos uma demonstração interativa com fotos em alta definição do seu nicho: o cliente monta o pedido na hora e ele chega impresso na bancada pelo Painel Gestor TáPronto, com taxa zero.\n\nPosso te mandar o link de teste pra você ver a velocidade na prática?`,
    `${reputationPraise}\n\nMontei uma demonstração rápida e prática para estabelecimentos do segmento de vocês, onde o cliente não precisa ficar calculando na mão nem dando zoom: o pedido entra 100% organizado no Painel Gestor TáPronto com sinal sonoro e impressão automática na cozinha.\n\nQuer dar uma olhada em como ficou essa loja modelo pra testar em 30 segundos?`
  ];
  return copies[Math.floor(Math.random() * copies.length)];
}

// --------------------------------------------------------------------------
// FUNÇÃO PRINCIPAL DE PROCESSAMENTO INBOUND
// --------------------------------------------------------------------------
export async function processAllInboundTrojan() {
  const evoConfig = evolutionV2SalesConfig();

  // 1. Processar respostas ao Step 1 (Inquiry inicial -> Pivot Step 2 com Debounce e Anti-Bot)
  await handleStep1Replies(evoConfig);

  // 2. Processar respostas ao Step 2 (Permissão concedida -> Auto-ACK + Step 3 Delivery)
  await handleStep2Replies(evoConfig);

  // 3. Telemetria Pós-Clique (Ghosting Recovery para quem abriu o link e não falou nada em 20min)
  await handleGhostingRecovery(evoConfig);
}

// --------------------------------------------------------------------------
// ETAPA 1 -> 2: Processamento com Debounce Buffer (35s) & Filtro Anti-URA
// --------------------------------------------------------------------------
async function handleStep1Replies(evoConfig) {
  const pendingRes = await pool.query(`
    SELECT 
      l.id AS lead_id,
      l.business_name,
      l.phone,
      l.normalized_phone,
      l.city,
      l.segment,
      l.metadata,
      c.id AS conv_id,
      (SELECT body FROM sales_messages WHERE lead_id = l.id AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1) AS last_inbound,
      (SELECT created_at FROM sales_messages WHERE lead_id = l.id AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1) AS inbound_time,
      (SELECT created_at FROM sales_messages WHERE lead_id = l.id AND direction = 'outbound' ORDER BY created_at DESC LIMIT 1) AS outbound_time
    FROM sales_leads l
    JOIN sales_conversations c ON c.lead_id = l.id
    WHERE l.metadata->>'outreach_strategy' = 'trojan_inquiry_step1'
      AND EXISTS (
        SELECT 1 FROM sales_messages 
        WHERE lead_id = l.id AND direction = 'inbound'
      )
  `);

  const now = new Date();
  const rows = pendingRes.rows.filter(r => {
    const inTime = new Date(r.inbound_time);
    const outTime = new Date(r.outbound_time);
    const diffFromInbound = (now.getTime() - inTime.getTime()) / 1000;
    
    // Apenas mensagens que chegaram após o envio do Step 1 e com pelo menos 35 segundos de debounce
    return inTime > outTime && diffFromInbound >= 35;
  });

  if (rows.length === 0) return;

  console.log(`[Step 1 -> 2] Leads prontos pós-debounce: ${rows.length}`);

  for (const row of rows) {
    const phone = row.normalized_phone || row.phone;
    const lastInbound = row.last_inbound || '';
    const inTime = new Date(row.inbound_time);
    const outTime = new Date(row.outbound_time);
    const elapsedSeconds = Math.max(1, (new Date(row.inbound_time).getTime() - new Date(row.outbound_time).getTime()) / 1000);

    console.log(`\nProcessando resposta de Step 1 de: ${row.business_name} (${phone})`);
    console.log(`Mensagem recebida: "${lastInbound}" (Tempo de resposta: ${elapsedSeconds.toFixed(1)}s)`);

    // 0. Detecção de Opt-out / Recusa no Step 1
    const optOutPatterns = [
      /\bn[aã]o\s+(?:quero|tenho interesse|precis[oa]|obrigad[oa]|autoriz[oa]|mande|envie)\b/i,
      /\bsem\s+interesse\b/i,
      /\bpare\b/i,
      /\bremov[ae].{0,18}(?:n[uú]mero|contato|lista)\b/i,
      /\bn[aã]o entre em contato\b/i,
      /\bme deixa em paz\b/i,
      /\bdescadastr[ae]\b/i,
      /\bsair\b/i
    ];
    if (optOutPatterns.some(p => p.test(lastInbound))) {
      console.log(`  🚫 Opt-out detectado em ${row.business_name} ("${lastInbound}"). Atualizando etapa para opted_out.`);
      await pool.query(`
        UPDATE sales_leads
        SET stage = 'opted_out',
            automation_status = 'stopped',
            opted_out_at = now(),
            stop_reason = 'Opt-out recebido via WhatsApp',
            updated_at = now()
        WHERE id = $1
      `, [row.lead_id]);
      await pool.query(`
        INSERT INTO sales_suppressions (normalized_phone, reason, source, created_at)
        VALUES ($1, 'Opt-out recebido via WhatsApp', 'lead_opt_out', now())
        ON CONFLICT (normalized_phone) DO NOTHING
      `, [phone]);
      continue;
    }

    // 1. Classificação da Mensagem Inbound
    const classification = classifyInboundMessage(lastInbound, elapsedSeconds);

    // Se detectou URA / Bot com menu
    if (classification.type === 'BOT_URA') {
      console.log(`  🤖 Detectado Bot/URA automático em ${row.business_name}.`);
      
      // Se a URA contém menção clara a cardápio ou falar com atendente, seleciona opção
      if (/\b1\s*[-–)]\s*card[aá]pio/i.test(lastInbound)) {
        console.log(`  -> Respondendo "1" para avançar menu do cardápio...`);
        await sendEvolutionV2Presence({ phone, presence: 'composing', delayMs: 2500 }, evoConfig);
        const uraReply = await sendEvolutionV2SalesText({ phone, text: '1' }, evoConfig);
        await pool.query(`
          INSERT INTO sales_messages (lead_id, conversation_id, provider_message_id, direction, body, status, created_at)
          VALUES ($1, $2, $3, 'outbound', '1', 'sent', now())
          ON CONFLICT (provider_message_id) DO NOTHING
        `, [row.lead_id, row.conv_id, uraReply.id]);
        continue;
      }

      // Se for URA genérica, envia solicitação humana educada
      console.log(`  -> Solicitando atendimento humano...`);
      const humanReq = 'Boa tarde! Queria falar com um atendente por favor.';
      await sendEvolutionV2Presence({ phone, presence: 'composing', delayMs: 3000 }, evoConfig);
      const uraReply = await sendEvolutionV2SalesText({ phone, text: humanReq }, evoConfig);
      await pool.query(`
        INSERT INTO sales_messages (lead_id, conversation_id, provider_message_id, direction, body, status, created_at)
        VALUES ($1, $2, $3, 'outbound', $4, 'sent', now())
        ON CONFLICT (provider_message_id) DO NOTHING
      `, [row.lead_id, row.conv_id, uraReply.id, humanReq]);
      
      await pool.query(`
        UPDATE sales_leads
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{ura_detected}', 'true'::jsonb),
            updated_at = now()
        WHERE id = $1
      `, [row.lead_id]);
      continue;
    }

    // 2. Extração do Item Destaque
    const storeId = row.metadata?.store_id;
    const featuredItem = await getFeaturedProduct(storeId, row.segment);

    // 3. Construção do Pivot Humanizado (Com Autenticidade)
    const pivotMsg = buildStep2PivotMessage({
      lead: row,
      itemName: featuredItem,
      classification,
      segment: row.segment
    });

    console.log(`  -> Enviando Step 2 Pivot (Item: "${featuredItem}", Tipo: ${classification.type})...`);
    
    // Humanização: Simulação de "Digitando..." proporcional ao tamanho do texto (4 a 8s)
    const presenceDelay = Math.min(8000, Math.max(4500, Math.floor(pivotMsg.length * 18)));
    await sendEvolutionV2Presence({ phone, presence: 'composing', delayMs: presenceDelay }, evoConfig);

    const sendRes = await sendEvolutionV2SalesText({ phone, text: pivotMsg }, evoConfig);

    await pool.query(`
      INSERT INTO sales_messages (
        lead_id, conversation_id, provider_message_id, direction,
        body, status, requires_approval, approved_at, sent_at, metadata, created_at
      ) VALUES (
        $1, $2, $3, 'outbound',
        $4, 'sent', false, now(), now(),
        jsonb_build_object('kind', 'trojan_pivot_step2', 'step', 2, 'featured_item', $5::text),
        now()
      ) ON CONFLICT (provider_message_id) DO NOTHING
    `, [row.lead_id, row.conv_id, sendRes.id, pivotMsg, featuredItem]);

    await pool.query(`
      UPDATE sales_leads
      SET metadata = jsonb_set(
            jsonb_set(COALESCE(metadata, '{}'::jsonb), '{outreach_strategy}', '"trojan_pivot_step2"'::jsonb),
            '{featured_item}', $2::jsonb
          ),
          stage = 'engaged',
          updated_at = now()
      WHERE id = $1
    `, [row.lead_id, JSON.stringify(featuredItem)]);

    console.log(`  ✓ Step 2 enviado com sucesso para ${row.business_name}!`);
  }
}

// --------------------------------------------------------------------------
// ETAPA 2 -> 3: Auto-ACK Imediato + Entrega da Loja Demo Rastreada
// --------------------------------------------------------------------------
async function handleStep2Replies(evoConfig) {
  const pendingRes = await pool.query(`
    SELECT 
      l.id AS lead_id,
      l.business_name,
      l.phone,
      l.normalized_phone,
      l.city,
      l.metadata,
      c.id AS conv_id,
      (SELECT body FROM sales_messages WHERE lead_id = l.id AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1) AS last_inbound,
      (SELECT created_at FROM sales_messages WHERE lead_id = l.id AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1) AS inbound_time,
      (SELECT created_at FROM sales_messages WHERE lead_id = l.id AND direction = 'outbound' ORDER BY created_at DESC LIMIT 1) AS outbound_time
    FROM sales_leads l
    JOIN sales_conversations c ON c.lead_id = l.id
    WHERE l.metadata->>'outreach_strategy' = 'trojan_pivot_step2'
      AND EXISTS (
        SELECT 1 FROM sales_messages 
        WHERE lead_id = l.id AND direction = 'inbound'
      )
  `);

  const rows = pendingRes.rows.filter(r => new Date(r.inbound_time) > new Date(r.outbound_time));
  if (rows.length === 0) return;

  console.log(`[Step 2 -> 3] Leads com novas respostas de Step 2: ${rows.length}`);

  for (const row of rows) {
    const phone = row.normalized_phone || row.phone;
    const lastInbound = row.last_inbound || '';
    const meta = row.metadata || {};

    console.log(`\nProcessando resposta de Step 2 de: ${row.business_name} (${phone})`);
    console.log(`Mensagem recebida: "${lastInbound}"`);

    // 0. Detecção de Recusa / Opt-out no Step 2
    const step2RefusalPatterns = [
      /\bn[aã]o\s+(?:quero|tenho interesse|precis[oa]|obrigad[oa]|autoriz[oa]|mande|envie|manda)\b/i,
      /\bsem\s+interesse\b/i,
      /\bdeixa\s+quieto\b/i,
      /\bdispenso\b/i,
      /\bpare\b/i
    ];
    if (step2RefusalPatterns.some(p => p.test(lastInbound))) {
      console.log(`  🚫 Lead recusou demonstração no Step 2: ${row.business_name} ("${lastInbound}").`);
      await pool.query(`
        UPDATE sales_leads
        SET stage = 'opted_out',
            automation_status = 'stopped',
            opted_out_at = now(),
            stop_reason = 'Recusa de demonstração via WhatsApp',
            updated_at = now()
        WHERE id = $1
      `, [row.lead_id]);
      continue;
    }

    // Validar se resposta é afirmativa
    if (!isAffirmativeReply(lastInbound)) {
      console.log(`  ℹ️ Resposta não é afirmativa direta ("${lastInbound}"). Mantendo para análise manual.`);
      continue;
    }

    // 1. DISPARO IMEDIATO DE AUTO-ACK (Speed to lead < 30s) COM SIMULAÇÃO DE DIGITANDO
    const ackSent = meta.auto_ack_sent;
    if (!ackSent) {
      console.log(`  ⚡ Disparando AUTO-ACK imediato para ${row.business_name}...`);
      const ackMsg = `Show de bola! Tô pegando o link da demonstração que preparei pra vocês, 1 segundo...`;
      
      await sendEvolutionV2Presence({ phone, presence: 'composing', delayMs: 3500 }, evoConfig);
      const ackRes = await sendEvolutionV2SalesText({ phone, text: ackMsg }, evoConfig);

      await pool.query(`
        INSERT INTO sales_messages (
          lead_id, conversation_id, provider_message_id, direction,
          body, status, requires_approval, approved_at, sent_at, metadata, created_at
        ) VALUES (
          $1, $2, $3, 'outbound',
          $4, 'sent', false, now(), now(),
          jsonb_build_object('kind', 'trojan_auto_ack', 'step', 2.5),
          now()
        ) ON CONFLICT (provider_message_id) DO NOTHING
      `, [row.lead_id, row.conv_id, ackRes.id, ackMsg]);

      await pool.query(`
        UPDATE sales_leads
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{auto_ack_sent}', 'true'::jsonb),
            updated_at = now()
        WHERE id = $1
      `, [row.lead_id]);

      console.log(`  ✓ Auto-ACK enviado com sucesso!`);
    }

    // 2. VERIFICAR SE O CARDÁPIO JÁ ESTÁ PRONTO (>= 5 itens com foto)
    const storeId = meta.store_id;
    let itemsCount = 0;
    if (storeId) {
      const cntRes = await pool.query('SELECT count(*) FROM menu_items WHERE store_id = $1', [storeId]);
      itemsCount = Number(cntRes.rows[0]?.count || 0);
    }

    if (itemsCount >= 5) {
      console.log(`  🎯 Cardápio pronto com ${itemsCount} itens. Entregando link rastreado...`);

      const rawMenuUrl = meta.menu_url || (meta.menu_slug ? `https://taprontomenu.com.br/${meta.menu_slug}` : 'https://taprontomenu.com.br/cardapio');
      const trackedUrl = buildTrackedMenuUrl({ menuUrl: rawMenuUrl, leadId: row.lead_id });
      const hasRealScrapedMenu = Boolean(meta.has_real_menu || meta.scraped_menu || (Array.isArray(meta.scraped_items) && meta.scraped_items.length > 0));
      const featuredItem = meta.featured_item || 'principais produtos';

      const deliveryMsg = buildHarveyStep2({
        id: row.lead_id,
        business_name: meta.business_name || row.lead_name || 'loja',
        metadata: meta
      }, (hasRealScrapedMenu && meta.featured_item) ? meta.featured_item : null);

      // Humanização: Simulação de "Digitando..." proporcional ao tamanho do texto (5 a 8s)
      const deliveryDelay = Math.min(8000, Math.max(4500, Math.floor(deliveryMsg.length * 15)));
      await sendEvolutionV2Presence({ phone, presence: 'composing', delayMs: deliveryDelay }, evoConfig);

      const delRes = await sendEvolutionV2SalesText({ phone, text: deliveryMsg }, evoConfig);

      await pool.query(`
        INSERT INTO sales_messages (
          lead_id, conversation_id, provider_message_id, direction,
          body, status, requires_approval, approved_at, sent_at, metadata, created_at
        ) VALUES (
          $1, $2, $3, 'outbound',
          $4, 'sent', false, now(), now(),
          jsonb_build_object('kind', 'trojan_demo_step3', 'step', 3, 'tracked_url', $5::text),
          now()
        ) ON CONFLICT (provider_message_id) DO NOTHING
      `, [row.lead_id, row.conv_id, delRes.id, deliveryMsg, trackedUrl]);

      // Print mobile se houver
      if (meta.mobile_file) {
        try {
          await sleep(2500);
          const mobBytes = await readFile(meta.mobile_file);
          const mobRes = await sendEvolutionV2SalesMedia({
            phone,
            mediaBase64: Buffer.from(mobBytes).toString('base64'),
            mimeType: 'image/png',
            caption: 'Visualização rápida no celular para o cliente fazer pedidos online.'
          }, evoConfig);

          await pool.query(`
            INSERT INTO sales_messages (
              lead_id, conversation_id, provider_message_id, direction,
              body, status, requires_approval, approved_at, sent_at, metadata, created_at
            ) VALUES (
              $1, $2, $3, 'outbound',
              $4, 'sent', false, now(), now(),
              jsonb_build_object('kind', 'trojan_mobile_step3', 'step', 3),
              now()
            ) ON CONFLICT (provider_message_id) DO NOTHING
          `, [row.lead_id, row.conv_id, mobRes.id, 'Visualização rápida no celular para o cliente fazer pedidos online.']);
        } catch (mErr) {
          console.warn('  Aviso no envio de print mobile:', mErr.message);
        }
      }

      await pool.query(`
        UPDATE sales_leads
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{outreach_strategy}', '"trojan_demo_delivered"'::jsonb),
            stage = 'engaged',
            last_contact_at = now(),
            updated_at = now()
        WHERE id = $1
      `, [row.lead_id]);

      console.log(`  ✓ Cardápio rastreado entregue com sucesso para ${row.business_name}!`);
    } else {
      console.log(`  ⏳ Cardápio da loja ${storeId} ainda precisa de importação de itens. Notificado e em fila.`);
      await pool.query(`
        UPDATE sales_leads
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{needs_menu_generation}', 'true'::jsonb),
            stage = 'engaged',
            updated_at = now()
        WHERE id = $1
      `, [row.lead_id]);
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
      WHERE l.metadata->>'outreach_strategy' = 'trojan_demo_delivered'
        AND l.metadata->>'link_clicked' = 'true'
        AND (l.metadata->>'ghosting_followup_sent') IS NULL
        AND NOW() - (l.metadata->>'last_link_click_at')::timestamptz >= INTERVAL '20 minutes'
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

    console.log(`[Ghosting Recovery] Leads que clicaram há >= 20min e não responderam/pediram: ${ghostRes.rows.length}`);

    for (const lead of ghostRes.rows) {
      const phone = lead.normalized_phone || lead.phone;
      const meta = lead.metadata || {};
      const hasRealScrapedMenu = Boolean(
        meta.has_real_menu || 
        meta.scraped_menu || 
        (Array.isArray(meta.scraped_items) && meta.scraped_items.length > 0)
      );
      const featuredItem = meta.featured_item;

      let ghostMsg;
      if (hasRealScrapedMenu && featuredItem) {
        ghostMsg = `Vi que você conseguiu abrir a loja de teste por aí! Experimenta clicar no ${featuredItem} e adicionar um opcional pra você ver a velocidade com que o pedido fecha e simula a comanda pronta pro balcão. Conseguiu testar?`;
      } else {
        ghostMsg = `Vi que você conseguiu abrir a demonstração por aí! Experimenta clicar em qualquer item e simular um pedido teste pra você ver como ele fecha em segundos e já chega pronto no Painel Gestor TáPronto com alerta sonoro pro balcão. Conseguiu dar uma olhada?`;
      }

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
          jsonb_build_object('kind', 'ghosting_click_followup', 'step', 3.5),
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
