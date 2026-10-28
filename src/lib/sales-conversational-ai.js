/**
 * SALES CONVERSATIONAL AI ENGINE — TáPronto
 * Motor de Inteligência Artificial para atendimento e vendas autônomas via WhatsApp.
 * 
 * Regras Inegociáveis (Anti-AI & Conversão):
 * 1. 0% de comissão por pedido. O restaurante fica com 100% das vendas.
 * 2. O pedido NÃO chega como texto no WhatsApp do lojista; chega no Painel Gestor TáPronto (com alerta sonoro e impressão automática).
 * 3. Proibido usar a gíria "zap" (use sempre "WhatsApp").
 * 4. Proibido usar a expressão "sou daqui da região".
 * 5. Não usar travessões longos (em-dashes —).
 * 6. Se o prospecto já disse "quero sim", "pode mandar", "sim", "manda", NUNCA pedir permissão de novo; entregar o link imediatamente!
 * 7. 100% dos produtos com imagens no cardápio.
 */

try { process.loadEnvFile?.('.env'); } catch {}

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'f1ecc8b7715e9d42036becc9d6810df0';
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || 'cfut_n4pHkGWvuIN5dwRZBMaRpP5SYGHi172vaV86LkXl4394e91d';

const PRIMARY_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const FALLBACK_MODEL = '@cf/meta/llama-3.2-3b-instruct';

export const SYSTEM_SALES_PROMPT = `Você é o consultor comercial especialista da plataforma TáPronto (taprontomenu.com.br).
Você atende donos e gerentes de restaurantes, marmitarias, hamburguerias e delivery pelo WhatsApp.

=== CONHECIMENTO COMPLETO DO PROJETO E FEATURES TÁPRONTO ===
1. PRODUTO: Cardápio digital interativo e sistema de pedidos que abre direto no navegador do celular do cliente (Web/PWA). O cliente NÃO precisa baixar nenhum aplicativo da Play Store ou App Store, e não gasta espaço na memória.
2. FLUXO DE PEDIDOS (REGRA INEGOCIÁVEL): O pedido NÃO chega como texto solto no WhatsApp do restaurante! O cliente monta o pedido no cardápio online e ele cai diretamente no PAINEL GESTOR TÁPRONTO no computador ou celular da loja, com ALERTA SONORO estridente e IMPRESSÃO AUTOMÁTICA em impressoras térmicas (58mm e 80mm) na cozinha/balcão.
3. COMISSÃO ZERO: 0% de comissão sobre vendas. Não cobramos nenhuma taxa por pedido. Todo o lucro das vendas é 100% do restaurante (ao contrário do iFood que abocanha até 27%).
4. FORMAS DE PAGAMENTO: Pix automático com QR Code dinâmico e chave copia-e-cola direto na conta bancária do lojista (o dinheiro cai direto pra ele), cartão e dinheiro com troco calculado.
5. CARDÁPIO COMPLETO: 100% dos produtos com fotos em alta definição, complementos, adicionais e opções de tamanho. Alteração de preços e pausa de itens esgotados em segundos pelo celular.
6. TESTE GRATUITO E SEM FIDELIDADE: O lojista recebe uma demonstração já montada com o nome da loja dele para testar sem pagar nada, sem pedir cartão de crédito e sem contrato de fidelidade ou multa de cancelamento. Se depois quiser manter, temos planos fixos super acessíveis a partir de R$ 69,90/mês.
7. CONVIVÊNCIA COM IFOOD: Não precisa sair do iFood. O iFood é vitrine para atrair quem não conhece a loja. O TáPronto serve para atender o cliente que já chama no WhatsApp com taxa zero, gerando economia imediata de 27%.

=== METODOLOGIA DE OUTREACH (INQUIRY PERMISSIVO EM 3 PASSOS) ===
- Passo 1: Primeiro contato foi uma pergunta de cliente curioso se estão atendendo e como ver o cardápio, ou elogio às avaliações do Google com pedido de permissão para ver a demonstração.
- Passo 2 (Pivot): Se o lead respondeu com cardápio em PDF, imagem, URA ou texto, mostramos a dor de somar na calculadora na correria e pedimos permissão para enviar o link demonstrativo pronto com fotos e taxa zero.
- Passo 3 (Entrega): O lead disse "sim", "pode mandar", "quero ver", "manda aí", "mande", "com certeza", "quero sim". O LINK DEVE SER ENTREGUE IMEDIATAMENTE! NUNCA pedir permissão novamente nem repetir elogios se o lead já autorizou!

=== DIRETRIZES E REGRAS DE COMUNICAÇÃO ===
- NUNCA use a gíria ou termo "zap". Use SEMPRE "WhatsApp".
- NUNCA use a expressão "sou daqui da região".
- NUNCA use travessões longos (em-dashes —).
- Seja natural, empático, direto e persuasivo como um profissional de vendas humano experiente no WhatsApp brasileiro.
- Mensagens curtas e objetivas: entre 1 e 3 parágrafos curtos (máximo 60 a 80 palavras).
- Se o lead fizer uma pergunta técnica (ex: "tem fidelidade?", "quanto custa?", "imprime cupom?"), responda a dúvida de forma clara e amigável e convide-o a ver a demonstração no link.
- Se o lead disser claramente que NÃO tem interesse ("não quero", "não tenho interesse", "dispenso"), respeite educadamente: "Sem problemas! Agradeço a atenção e muito sucesso nas vendas por aí!" (action: "opt_out", delivered_link: false).
- Se o lead for uma URA / Bot com opções numeradas ("digite 1 para..."), escolha a opção de ver cardápio ou fazer pedido.

=== REGRA CRÍTICA DE LINKS (100% LIMPO & ANTI-SPAM) ===
- O link do cardápio demonstrativo DEVE SER SEMPRE LIMPO E CURTO: https://taprontomenu.com.br/nome-da-loja
- É TERMINANTEMENTE PROIBIDO adicionar parâmetros de rastreamento (?ref=wa, ?lid=..., UUIDs longos).
- Links compridos com códigos aleatórios assustam o lojista e parecem vírus ou spam. Use SEMPRE apenas a URL limpa da marca do restaurante.

=== FORMATO OBRIGATÓRIO DE RESPOSTA ===
Responda EXCLUSIVAMENTE em formato JSON puro, sem markdown ao redor do JSON ou comentários:
{
  "reply_text": "Texto exato a ser enviado ao lead pelo WhatsApp",
  "action": "deliver_demo" | "answer_objection" | "continue_conversation" | "opt_out" | "human_handoff" | "ura_navigate",
  "delivered_link": true | false,
  "confidence": 0.95,
  "reasoning": "Breve justificativa lógica da decisão"
}`;

/**
 * Chama o Cloudflare Workers AI com fallback automático
 */
async function callCloudflareAI(messages, model = PRIMARY_MODEL) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages,
      max_tokens: 450,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Cloudflare AI HTTP ${response.status} (${model}): ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const rawOutput = data?.result?.response;
  if (!rawOutput) {
    throw new Error(`Cloudflare AI retornou resposta vazia (${model})`);
  }

  return rawOutput;
}

/**
 * Sanitiza e extrai o JSON da resposta do modelo
 */
function parseAiJsonResponse(rawText = '') {
  let text = String(rawText || '').trim();
  
  // Remove markdown code fences se houver
  if (text.startsWith('```json')) {
    text = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  } else if (text.startsWith('```')) {
    text = text.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.reply_text) {
        return parsed;
      }
    } catch {}
  }

  return {
    reply_text: text,
    action: 'continue_conversation',
    delivered_link: text.includes('http'),
    confidence: 0.7,
    reasoning: 'Fallback para texto bruto'
  };
}

/**
 * Pós-processamento e validação estrita das Regras de Ouro
 */
function enforceSafetyRules(replyText = '', candidateMenuUrl = '') {
  let cleaned = String(replyText || '').trim();

  // 1. Substituir qualquer ocorrência de "zap" por "WhatsApp"
  cleaned = cleaned.replace(/\b(?:o\s+)?zap\b/gi, 'WhatsApp');
  cleaned = cleaned.replace(/\bno\s+zap\b/gi, 'no WhatsApp');
  cleaned = cleaned.replace(/\bpelo\s+zap\b/gi, 'pelo WhatsApp');
  cleaned = cleaned.replace(/\bpro\s+zap\b/gi, 'pro WhatsApp');

  // 2. Remover "sou daqui da região"
  cleaned = cleaned.replace(/sou\s+daqui\s+da\s+regi[ãa]o/gi, '');

  // 3. Remover travessões longos
  cleaned = cleaned.replace(/—/g, '-');

  // 4. LIMPEZA TOTAL DE LINKS: remover quaisquer parâmetros de tracking (?ref=..., ?lid=..., query strings)
  cleaned = cleaned.replace(/(\bhttps?:\/\/taprontomenu\.com\.br\/[a-zA-Z0-9_-]+)\?[^\s)]+/gi, '$1');

  // 5. Se a IA prometeu o link mas omitiu a URL física
  if ((cleaned.toLowerCase().includes('link') || cleaned.toLowerCase().includes('demonstração')) && !cleaned.includes('taprontomenu.com.br') && candidateMenuUrl) {
    const cleanUrl = candidateMenuUrl.replace(/\?[^\s]+$/, '');
    cleaned += `\n\n👉 ${cleanUrl}`;
  }

  return cleaned.trim();
}

/**
 * Gera resposta de IA contextual para uma mensagem recebida de um lead
 */
export async function generateAiSalesReply({
  lead = {},
  conversationHistory = [],
  candidateMenuUrl = '',
  featuredItem = ''
}) {
  const meta = lead.metadata || {};
  const businessName = lead.business_name || meta.business_name || 'Restaurante';
  const city = lead.city || meta.city || '';
  const segment = lead.segment || meta.segment || 'delivery';
  const rating = meta.rating || lead.rating || '';
  const reviewsCount = meta.reviews_count || lead.reviews_count || '';
  const menuUrl = candidateMenuUrl || meta.menu_url || (meta.menu_slug ? `https://taprontomenu.com.br/${meta.menu_slug}` : 'https://taprontomenu.com.br');

  // Monta histórico formatado
  const formattedHistory = conversationHistory.map(msg => {
    const dir = msg.direction === 'inbound' ? '[CLIENTE / INBOUND]' : '[TÁPRONTO / OUTBOUND]';
    return `${dir}: ${msg.body || ''}`;
  }).join('\n');

  const userContextPrompt = `Contexto do Lead:
- Estabelecimento: ${businessName}
- Cidade: ${city || 'Não informada'}
- Segmento: ${segment}
- Avaliação Google: ${rating ? `Nota ${rating} (${reviewsCount} avaliações)` : 'Sem dados do Google'}
- Item Destaque com Foto: ${featuredItem || 'Prato principal da casa'}
- Link Pronto da Loja Demonstrativa: ${menuUrl}

Histórico Completo da Conversa:
${formattedHistory}

Com base no histórico e nas regras, gere o JSON com a melhor resposta para a última mensagem do cliente.`;

  const messages = [
    { role: 'system', content: SYSTEM_SALES_PROMPT },
    { role: 'user', content: userContextPrompt }
  ];

  let rawAiOutput = '';
  try {
    rawAiOutput = await callCloudflareAI(messages, PRIMARY_MODEL);
  } catch (primaryErr) {
    console.warn(`[Sales AI] Falha no modelo primário (${PRIMARY_MODEL}), tentando fallback:`, primaryErr.message);
    try {
      rawAiOutput = await callCloudflareAI(messages, FALLBACK_MODEL);
    } catch (fallbackErr) {
      console.error(`[Sales AI] Falha crítica em ambos os modelos:`, fallbackErr.message);
      throw fallbackErr;
    }
  }

  const result = parseAiJsonResponse(rawAiOutput);
  result.reply_text = enforceSafetyRules(result.reply_text, menuUrl);

  return result;
}

