import { createHash } from 'node:crypto';

export const SALES_STAGES = Object.freeze([
  'discovered', 'qualified', 'awaiting_first_message_approval', 'first_message_sent',
  'awaiting_reply', 'engaged', 'needs_discovery', 'demo_requested', 'price_requested',
  'competitor_identified', 'followup_scheduled', 'human_handoff', 'not_interested',
  'opted_out', 'won', 'lost', 'paused'
]);

export const TERMINAL_SALES_STAGES = new Set(['not_interested', 'opted_out', 'won', 'lost', 'paused']);
export const SALES_INTENTS = Object.freeze([
  'interested', 'demo_request', 'price_question', 'existing_competitor', 'busy', 'objection',
  'not_interested', 'opt_out', 'human_request', 'greeting', 'unknown'
]);

const TRANSITIONS = Object.freeze({
  discovered: ['qualified', 'human_handoff', 'paused', 'opted_out', 'lost'],
  qualified: ['awaiting_first_message_approval', 'human_handoff', 'paused', 'opted_out', 'lost'],
  awaiting_first_message_approval: ['first_message_sent', 'human_handoff', 'paused', 'opted_out', 'lost'],
  first_message_sent: ['awaiting_reply', 'engaged', 'paused', 'opted_out', 'not_interested'],
  awaiting_reply: ['engaged', 'needs_discovery', 'demo_requested', 'price_requested', 'competitor_identified', 'followup_scheduled', 'human_handoff', 'paused', 'opted_out', 'not_interested', 'lost'],
  engaged: ['awaiting_reply', 'needs_discovery', 'demo_requested', 'price_requested', 'competitor_identified', 'followup_scheduled', 'human_handoff', 'paused', 'opted_out', 'not_interested', 'won', 'lost'],
  needs_discovery: ['awaiting_reply', 'engaged', 'demo_requested', 'price_requested', 'competitor_identified', 'followup_scheduled', 'human_handoff', 'paused', 'opted_out', 'not_interested'],
  demo_requested: ['awaiting_reply', 'engaged', 'human_handoff', 'won', 'lost', 'paused', 'opted_out'],
  price_requested: ['awaiting_reply', 'engaged', 'human_handoff', 'won', 'lost', 'paused', 'opted_out'],
  competitor_identified: ['awaiting_reply', 'engaged', 'followup_scheduled', 'human_handoff', 'not_interested', 'paused', 'opted_out', 'lost'],
  followup_scheduled: ['awaiting_reply', 'engaged', 'needs_discovery', 'demo_requested', 'price_requested', 'competitor_identified', 'human_handoff', 'paused', 'opted_out', 'not_interested', 'lost'],
  human_handoff: ['engaged', 'demo_requested', 'price_requested', 'won', 'lost', 'paused', 'opted_out'],
  not_interested: [], opted_out: [], won: [], lost: [], paused: ['qualified', 'awaiting_reply', 'engaged', 'lost']
});

const OPT_OUT_PATTERNS = [
  /\bn[aã]o\s+(?:quero|tenho interesse|(?:me\s+)?chame|(?:me\s+)?mande|(?:me\s+)?envie)\b/i,
  /\bpare\b/i, /\bremov[ae].{0,18}(?:n[uú]mero|contato|lista)\b/i,
  /\bn[aã]o entre em contato\b/i, /\bme deixa em paz\b/i, /\bsair\b/i
];

export function salesConfig(env = process.env) {
  const hasEvolutionV2 = Boolean(String(env.SALES_EVOLUTION_V2_BASE_URL || '').trim() && String(env.SALES_EVOLUTION_V2_INSTANCE || '').trim());
  return {
    enabled: parseBoolean(env.SALES_AUTOMATION_ENABLED, false),
    mode: ['draft', 'supervised', 'autonomous'].includes(String(env.SALES_AUTOMATION_MODE || '').toLowerCase()) ? String(env.SALES_AUTOMATION_MODE).toLowerCase() : 'draft',
    storeId: String(env.SALES_WHATSAPP_STORE_ID || '').trim(),
    provider: hasEvolutionV2 ? 'evolution_v2' : 'evolution_go',
    minConfidence: clamp(Number(env.SALES_MIN_CONFIDENCE || 0.78), 0.5, 0.99),
    dailyLimit: clampInt(Number(env.SALES_DAILY_LIMIT || 10), 1, 500),
    instanceDailyLimit: clampInt(Number(env.SALES_INSTANCE_DAILY_LIMIT || env.SALES_DAILY_LIMIT || 10), 1, 500),
    minIntervalSeconds: clampInt(Number(env.SALES_MIN_INTERVAL_SECONDS || 180), 30, 86400),
    timezone: String(env.SALES_TIMEZONE || 'America/Sao_Paulo'),
    allowedStart: validTime(env.SALES_ALLOWED_START_TIME) ? env.SALES_ALLOWED_START_TIME : '09:00',
    allowedEnd: validTime(env.SALES_ALLOWED_END_TIME) ? env.SALES_ALLOWED_END_TIME : '18:00',
    blockedDates: new Set(String(env.SALES_BLOCKED_DATES || '').split(',').map((item) => item.trim()).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item))),
    workerIntervalSeconds: clampInt(Number(env.SALES_WORKER_INTERVAL_SECONDS || 15), 5, 300)
  };
}

export function normalizeSalesPhone(value = '') {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length === 12 || digits.length === 13) return digits;
  return digits;
}

export function isValidSalesPhone(value = '') {
  const norm = normalizeSalesPhone(value);
  return /^55\d{10,11}$/.test(norm);
}

export function shouldPauseForEvolutionConnectionState(value = '') {
  const state = String(value || '').trim().toLowerCase();
  return ['close', 'closed', 'disconnected', 'offline', 'error'].includes(state);
}

export function assertSalesTransition(from, to) {
  if (from === to) return true;
  if (!SALES_STAGES.includes(from) || !SALES_STAGES.includes(to) || !(TRANSITIONS[from] || []).includes(to)) {
    throw new Error(`Transição comercial inválida: ${from} -> ${to}`);
  }
  return true;
}

export function isOptOutMessage(body = '') {
  return OPT_OUT_PATTERNS.some((pattern) => pattern.test(String(body || '').normalize('NFC')));
}

export function cleanLeadBusinessName(rawName = '') {
  return String(rawName || '')
    .replace(/\s*-\s*(Hamburgueria|Lanchonete|Restaurante|Pizzaria|Marmitaria|Bar|Disk|Delivery|Cafeteria|Rotisseria).*/i, '')
    .replace(/\s*\|\s*.*/i, '')
    .replace(/\(.*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * PASSO 1: Abordagem Direta, Curta e Transparente (Value-First)
 * Máximo 350 caracteres, sem fingir compra, com dados reais do Google Maps.
 */
export function buildValueFirstStep1(lead = {}, now = new Date()) {
  const business = cleanLeadBusinessName(lead.business_name || lead.businessName || 'estabelecimento');
  const city = clean(lead.city || 'região');
  const meta = lead.metadata || {};

  const rawRating = meta.rating || lead.rating;
  const ratingNum = rawRating ? Number(String(rawRating).replace(',', '.')) : 0;
  const reviewsCount = Number(meta.reviews_count || lead.reviews_count || 0);

  const hour = now.getHours();
  const saudacao = hour >= 18 ? 'Boa noite' : (hour >= 12 ? 'Boa tarde' : 'Bom dia');

  // Com reputação destacada no Google (nota >= 4.0 e reviews)
  if (ratingNum >= 4.0 && reviewsCount > 0) {
    const ratingStr = String(ratingNum.toFixed(1)).replace('.', ',');
    const variations = [
      `${saudacao}, tudo bem? Vi o perfil da *${business}* aqui no Google (parabéns pela nota ${ratingStr} ⭐!). Sou da TáPronto e montei uma prévia de como ficaria o cardápio digital de vocês pra receber pedidos já somados e prontos pra imprimir na cozinha, sem taxas do iFood. Posso te mandar o link aqui rapidinho pra você ver como ficou?`,
      `${saudacao}! Tudo certo por aí? Achei a *${business}* pelo Google Maps (muito boas as ${reviewsCount} avaliações de vocês!). Preparei um modelo de demonstração do cardápio digital de vocês onde o cliente faz o pedido sozinho em 30s e já cai direto na impressora do caixa. Posso mandar o link aqui pra você testar sem compromisso?`,
      `${saudacao}, tudo bom? Encontrei o perfil da *${business}* no Google com nota ${ratingStr} ⭐, parabéns pela reputação! Montei uma prévia ilustrada do cardápio digital de vocês, com pedidos diretos sem comissão e alerta sonoro no balcão. Posso te mandar o link de teste em 30 segundos?`,
      `${saudacao}! Vi a ótima avaliação da *${business}* no Google (${reviewsCount} avaliações). Sou da equipe TáPronto e preparei uma demonstração rápida no celular para mostrar como agilizar o WhatsApp no pico, com impressão automática na cozinha e taxa zero. Posso enviar o link aqui pra dar uma olhada?`
    ];
    return variations[Math.floor(Math.random() * variations.length)].slice(0, 350);
  }

  // Fallback para estabelecimentos sem nota ou com nota < 4.0 (foco na cidade)
  const fallbacks = [
    `${saudacao}, tudo bem? Vi o trabalho da *${business}* aqui em ${city}. Sou da TáPronto e montei uma demonstração prática de como ficaria o cardápio digital de vocês para receber pedidos já somados no balcão, com alerta sonoro e impressão automática sem taxas. Posso te mandar o link aqui pra você testar em 30 segundos?`,
    `${saudacao}! Tudo certo por aí na *${business}*? Sou da TáPronto e preparei um modelo de cardápio digital no celular pro segmento de vocês em ${city}, onde o pedido já cai somado direto na impressora do caixa. Posso mandar o link aqui rapidinho pra você dar uma olhada sem compromisso?`,
    `${saudacao}, tudo bem? Sou da equipe TáPronto e montei uma prévia do cardápio digital da *${business}* em ${city}. O cliente escolhe os adicionais em 30s e o pedido cai direto na impressora da cozinha com som estridente e taxa zero. Posso enviar o link pra você dar uma olhada rápida?`
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)].slice(0, 350);
}

/**
 * PASSO 2: Entrega Imediata da Demo + Gancho de Importação Gratuita
 */
export function buildValueFirstStep2({ menuUrl }) {
  const cleanUrl = String(menuUrl || 'https://taprontomenu.com.br').trim();
  return `Tá na mão! Dá uma olhada em como ficou o visual:\n👉 ${cleanUrl}\n\nColoquei alguns itens de exemplo com fotos só pra você testar a velocidade. Clica num produto e simula um pedido rápido — ele cai na hora no nosso Painel Gestor com alerta sonoro e impressão automática.\n\nSe curtir, pode me mandar uma foto ou PDF do seu cardápio atual por aqui mesmo que a nossa equipe cadastra seus produtos e preços reais hoje pra você testar grátis!`;
}

/**
 * PASSO 3: Follow-up Consultivo Pós-Clique (25 minutos pós-clique sem resposta)
 */
export function buildValueFirstStep3Followup() {
  return `Vi que você conseguiu abrir a prévia do cardápio aí! Ficou alguma dúvida de como os pedidos chegam prontos no computador ou impressora de vocês?\n\nSe quiser testar na prática hoje mesmo, é só me mandar uma foto do seu cardápio atual que eu deixo tudo configurado com os seus preços reais, sem custo.`;
}

/**
 * Resposta de entrega imediata do cardápio pronto ao receber foto/PDF do cardápio do lead
 */
export function buildValueFirstMediaReceivedReply({ menuUrl = '' } = {}) {
  const cleanUrl = String(menuUrl || '').replace(/\?[^\s]+$/, '');
  const urlSnippet = cleanUrl ? `\n\n👉 ${cleanUrl}\n\n` : '\n\n';
  return `Show de bola! Já deixei pronta uma prévia rápida no celular do cardápio digital de vocês com fotos e taxa zero:${urlSnippet}O cliente escolhe os itens em segundos e o pedido já cai somado direto no Painel Gestor TáPronto com alerta sonoro e impressão automática na cozinha. Dá uma olhada e me fala o que achou da agilidade!`;
}

export function isAffirmativeSalesReply(text = '') {
  const cleanText = String(text || '').toLowerCase().trim();
  const patterns = [
    /\b(pode|sim|manda|claro|manda ai|manda aí|quero|quero ver|beleza|blz|manda o link|pode sim|mande|envia|enviar|com certeza|bora|vamos|manda bala|manda aqui|como funciona|quero conhecer|pode ser|mostra)\b/i,
    /pode\s*mandar/i,
    /pode\s*enviar/i,
    /quero\s*sim/i,
    /pode\s*ser/i
  ];
  return patterns.some((p) => p.test(cleanText));
}

export function isMenuMediaReply(text = '') {
  const cleanText = String(text || '').toLowerCase().trim();
  return (
    cleanText.includes('pdf') ||
    cleanText.includes('.pdf') ||
    cleanText.includes('cardapio') ||
    cleanText.includes('cardápio') ||
    cleanText.includes('segue o cardápio') ||
    cleanText.includes('foto') ||
    cleanText.includes('tabela') ||
    cleanText.includes('anexo') ||
    cleanText.includes('documento')
  );
}

export function initialSalesMessage(lead = {}) {
  return buildValueFirstStep1(lead);
}

export function discoverySalesMessage() {
  return 'Hoje os pedidos chegam direto pelo WhatsApp ou vocês já usam algum cardápio online?';
}

export function configuredSalesFacts(env = process.env) {
  return {
    monthlyPrice: clean(env.SALES_MONTHLY_PRICE || ''),
    planBenefits: clean(env.SALES_PLAN_BENEFITS || ''),
    demoUrl: clean(env.SALES_DEMO_URL_DEFAULT || ''),
    checkoutUrl: clean(env.SALES_CHECKOUT_URL || '')
  };
}

export function autonomousSalesMessageAllowed(decision = {}, config = salesConfig()) {
  if (config.mode !== 'autonomous' || decision.requires_human || decision.should_stop_automation) return false;
  return ['greeting', 'interested', 'existing_competitor', 'busy', 'price_question', 'demo_request'].includes(decision.intent);
}

export function shouldAutomaticallyReplyToLead(lead = {}) {
  return lead.source !== 'google_outreach' && !lead.metadata?.outreach_run_id;
}

export function fallbackSalesDecision(body = '', context = {}) {
  const text = clean(body).toLowerCase();
  const facts = context.facts || configuredSalesFacts(context.env || process.env);
  if (isOptOutMessage(text)) return decision('opt_out', 1, 'opted_out', false, null, true, 'Solicitação de não contato.');
  if (/\b(n[aã]o tenho interesse|n[aã]o obrigado|n[aã]o obrigada|dispenso|sem interesse)\b/i.test(text)) return decision('not_interested', .98, 'not_interested', false, null, false, 'Lead informou que não tem interesse.');
  if (/\b(pre[çc]o|valor|quanto custa|mensalidade|plano)\b/i.test(text)) {
    if (facts.monthlyPrice) return decision('price_question', .96, 'price_requested', true, `O plano custa R$ ${facts.monthlyPrice} por mês${facts.planBenefits ? ` e inclui ${facts.planBenefits}` : ''}. Se quiser, posso te mostrar como funciona.`, false, null);
    return decision('price_question', .96, 'price_requested', false, null, true, 'Preço não configurado; atendimento humano necessário.');
  }
  if (/\b(demonstra|demo|quero ver|pode mostrar|me mostra)\b/i.test(text)) {
    if (facts.demoUrl) return decision('demo_request', .95, 'demo_requested', true, `Claro. Aqui está uma demonstração: ${facts.demoUrl} O cliente não precisa instalar aplicativo.`, false, null);
    return decision('demo_request', .95, 'demo_requested', false, null, true, 'Demonstração não configurada; atendimento humano necessário.');
  }
  if (/\b(falar com|pessoa|humano|atendente|lucas)\b/i.test(text)) return decision('human_request', .95, 'human_handoff', false, null, true, 'Atendimento humano solicitado.');
  if (/\b(ifood|ola\s?click|pedir delivery|anota ai|goomer|card[aá]pio web|datacaixa|sistema)\b/i.test(text)) return decision('existing_competitor', .9, 'competitor_identified', true, 'Entendi. Vocês estão satisfeitos com a plataforma atual ou existe alguma dificuldade que ainda incomoda?', false, null);
  if (/\b(agora n[aã]o|sem tempo|ocupad|correria|depois)\b/i.test(text)) return decision('busy', .88, 'followup_scheduled', true, 'Sem problema. Prefere que eu mande uma demonstração por aqui para olhar quando puder ou te chamo em outro horário?', false, null, true);
  if (/\b(j[aá] tenho|n[aã]o preciso|funciona bem|estou satisfeit|estamos satisfeit|muito caro|complicado)\b/i.test(text)) return decision('objection', .86, 'needs_discovery', true, 'Entendo. O que mais pesa hoje para vocês: organizar os pedidos, manter um canal próprio ou facilitar o atendimento pelo WhatsApp?', false, null);
  if (/\b(sim|tenho interesse|pode mandar|pode enviar|quero conhecer|legal|interessante)\b/i.test(text)) return decision('interested', .84, 'engaged', true, discoverySalesMessage(), false, null);
  if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite|tudo bem)[!.? ]*$/i.test(text)) return decision('greeting', .84, 'engaged', true, discoverySalesMessage(), false, null);
  return decision('unknown', .45, 'human_handoff', true, 'Boa pergunta. Não quero te passar uma informação errada. Vou confirmar com o responsável pelo TáPronto e retorno por aqui.', true, 'Mensagem ambígua ou informação não configurada.');
}

export function parseEvolutionInbound(payload = {}) {
  const event = String(payload?.event || payload?.type || '').toUpperCase();
  if (!event.includes('MESSAGE') || event.includes('SEND_MESSAGE')) return null;
  const data = payload?.data || payload;
  const key = data?.key || data?.Info || data?.info || {};
  const source = key?.MessageSource || key?.messageSource || data?.messageSource || {};
  let remote = clean(key?.remoteJid || key?.RemoteJid || source?.Chat || source?.chat || source?.Sender || source?.sender || data?.remoteJid || data?.from || data?.sender || '');
  const altRemote = clean(key?.remoteJidAlt || key?.RemoteJidAlt || data?.remoteJidAlt || data?.remote_jid_alt || '');
  if (/@lid$/i.test(remote) && altRemote) {
    remote = altRemote;
  }
  const fromMe = Boolean(key?.fromMe ?? key?.FromMe ?? source?.IsFromMe ?? source?.isFromMe ?? data?.fromMe ?? data?.from_me);
  if (fromMe || /@g\.us$/i.test(remote) || data?.isGroup === true) return null;
  const message = data?.message || data?.Message || {};
  const body = clean(
    data?.text || data?.body || message?.conversation || message?.Conversation || message?.extendedTextMessage?.text
    || message?.ExtendedTextMessage?.Text || message?.text || data?.messageText || ''
  );
  const messageType = body ? 'text' : clean(data?.messageType || data?.type || Object.keys(message)[0] || 'unsupported');
  const providerMessageId = clean(key?.id || key?.ID || data?.messageId || data?.id || '');
  const phone = normalizeSalesPhone(remote.split('@')[0]);
  if (!phone) return null;
  return { phone, body, providerMessageId, messageType, fromMe: false, isGroup: false };
}

export function salesInboundEventKey(payload = {}, inbound = {}) {
  if (inbound.providerMessageId) return inbound.providerMessageId;
  const timestamp = payload?.data?.messageTimestamp || payload?.data?.timestamp || payload?.timestamp || '';
  return `derived_${salesIdempotencyKey(payload?.instance || '', inbound.phone || '', inbound.body || '', inbound.messageType || '', timestamp)}`;
}

export function canAutomaticallySend({ config, lead, message, paused = false, suppressed = false, now = new Date() }) {
  if (!config.enabled) return deny('Automação comercial desativada.');
  if (paused) return deny('Automação comercial pausada.');
  if (config.mode === 'draft') return deny('Modo draft nunca envia mensagens.');
  if (config.provider !== 'evolution_v2' && !config.storeId) return deny('SALES_WHATSAPP_STORE_ID não configurado.');
  if (!lead || TERMINAL_SALES_STAGES.has(lead.stage) || lead.automation_status !== 'active') return deny('Lead não está ativo para automação.');
  if (lead.opted_out_at || suppressed) return deny('Contato está na lista de supressão.');
  if (!message || message.status !== 'approved') return deny('Mensagem não aprovada.');
  if (!isWithinSalesWindow(now, config)) return deny('Fora da janela comercial configurada.');
  return { allowed: true, reason: '' };
}

export function isWithinSalesWindow(now = new Date(), config = salesConfig()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (values.weekday === 'Sun') return false;
  if (config.blockedDates?.has(`${values.year}-${values.month}-${values.day}`)) return false;
  const current = `${values.hour}:${values.minute}`;
  return current >= config.allowedStart && current <= config.allowedEnd;
}

export function isOutreachWebhookHealthy(health = {}, now = new Date(), maxAgeMs = 10 * 60 * 1000) {
  if (health.status && !['healthy', 'connected', 'ok'].includes(String(health.status).toLowerCase())) return false;
  const receivedAt = new Date(health.lastReceivedAt || health.last_received_at || 0).getTime();
  return Number.isFinite(receivedAt) && receivedAt > 0 && now.getTime() - receivedAt <= maxAgeMs;
}

export function salesIdempotencyKey(...parts) {
  return createHash('sha256').update(parts.map((part) => String(part || '')).join(':')).digest('hex');
}

export async function requestSalesDecision({ messages }) {
  const latest = messages?.at?.(-1)?.body || '';
  return fallbackSalesDecision(latest);
}

export function validateSalesDecision(value = {}) {
  if (!SALES_INTENTS.includes(value.intent)) throw new Error('Intenção comercial inválida.');
  if (!SALES_STAGES.includes(value.next_stage)) throw new Error('Próximo estágio comercial inválido.');
  const confidence = Number(value.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('Confiança comercial inválida.');
  return {
    intent: value.intent, confidence, next_stage: value.next_stage,
    should_reply: Boolean(value.should_reply), reply: value.reply ? clean(value.reply).slice(0, 1200) : null,
    should_schedule_followup: Boolean(value.should_schedule_followup), followup_at: value.followup_at || null,
    requires_human: Boolean(value.requires_human), human_reason: value.human_reason ? clean(value.human_reason).slice(0, 500) : null,
    should_stop_automation: Boolean(value.should_stop_automation), stop_reason: value.stop_reason ? clean(value.stop_reason).slice(0, 500) : null,
    summary: clean(value.summary).slice(0, 1000)
  };
}

function decision(intent, confidence, nextStage, shouldReply, reply, requiresHuman, humanReason, schedule = false) {
  return { intent, confidence, next_stage: nextStage, should_reply: shouldReply, reply, should_schedule_followup: schedule, followup_at: null, requires_human: requiresHuman, human_reason: humanReason, should_stop_automation: intent === 'opt_out' || intent === 'not_interested', stop_reason: intent === 'opt_out' ? 'Solicitação de não contato.' : null, summary: clean(humanReason || `Intenção: ${intent}.`) };
}
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function deny(reason) { return { allowed: false, reason }; }
function validTime(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')); }
function parseBoolean(value, fallback) { if (value === undefined || value === null || value === '') return fallback; return ['1','true','yes','on'].includes(String(value).toLowerCase()); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function clampInt(value, min, max) { return Math.round(clamp(Number.isFinite(value) ? value : min, min, max)); }
