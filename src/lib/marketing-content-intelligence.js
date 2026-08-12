const FORBIDDEN_PATTERNS = [/venda\s*10x/i, /revolucion[aá]ri[oa]/i, /substitu[ia].{0,20}whatsapp/i, /garantimos?/i, /resultado garantido/i];
const PAIN_WORDS = ['pedido', 'whatsapp', 'adicional', 'cliente', 'cardápio', 'cardapio', 'fila', 'erro', 'atraso'];

export function auditMarketingContent(content = {}, recent = []) {
  const hook = String(content.hook || content.title || '').trim();
  const caption = String(content.caption || '').trim();
  const overlay = String(content.overlay_text || hook).trim();
  const combined = `${hook} ${caption} ${overlay}`;
  const checks = [
    check('hook', hook.length >= 18 && hook.length <= 95, 'Use um gancho específico que seja entendido rapidamente.'),
    check('dor_real', PAIN_WORDS.some((word) => combined.toLowerCase().includes(word)), 'Mostre uma situação real do lojista.'),
    check('cta', Boolean(String(content.cta || '').trim()), 'Inclua uma única próxima ação.'),
    check('legenda', caption.length >= 70 && caption.length <= 1800, 'A legenda precisa explicar o valor sem ficar longa demais.'),
    check('texto_na_arte', overlay.split(/\s+/).filter(Boolean).length <= 12, 'Reduza o texto da imagem para no máximo 12 palavras.'),
    check('marca', /tápronto|tapronto/i.test(combined), 'Relacione o conteúdo ao TáPronto.'),
    check('promessa', !FORBIDDEN_PATTERNS.some((pattern) => pattern.test(combined)), 'Remova promessa exagerada ou linguagem proibida.'),
    check('link', /^https:\/\//i.test(String(content.utm_url || '')), 'Inclua um link HTTPS rastreável.'),
    check('hashtags', Array.isArray(content.hashtags) && content.hashtags.length >= 3 && content.hashtags.length <= 12, 'Use de 3 a 12 hashtags específicas.'),
    check('repeticao', similarityRisk(content, recent) < 0.72, 'O tema está muito parecido com uma publicação recente.')
  ];
  const score = Math.round((checks.filter((item) => item.passed).length / checks.length) * 100);
  return { score, status: score >= 80 ? 'ready' : score >= 60 ? 'review' : 'improve', checks, blockers: checks.filter((item) => !item.passed).map((item) => item.message) };
}

export function contentFatigue(content = [], windowSize = 12) {
  const recent = content.slice(0, windowSize); const groups = new Map();
  for (const item of recent) { const key = String(item.pillar || item.niche || 'geral').toLowerCase(); groups.set(key, (groups.get(key) || 0) + 1); }
  return [...groups.entries()].map(([topic, count]) => ({ topic, count, share: recent.length ? Math.round(count / recent.length * 100) : 0, fatigued: recent.length >= 6 && count / recent.length > .4 })).sort((a, b) => b.count - a.count);
}

export function repurposeVariants(source = {}) {
  const topic = source.title || source.hook || 'Pedido organizado'; const niche = source.niche || 'restaurantes'; const cta = source.cta || 'Testar o TáPronto';
  return [
    { title: `${topic} em 7 passos`, format: 'carousel', hook: `O que muda quando o pedido chega completo?`, script: `1. Dor real\n2. Consequência\n3. Como deveria funcionar\n4. Tela do TáPronto\n5. Exemplo para ${niche}\n6. Benefício\n7. ${cta}`, caption: `Salve este passo a passo para organizar os pedidos da sua loja.\n\n${cta}.`, overlay_text: 'Pedido completo em 7 passos' },
    { title: `${topic} em 30 segundos`, format: 'reel', hook: `Seu pedido ainda chega pela metade?`, script: `0-3s: gancho\n3-10s: pedido incompleto\n10-22s: demonstração do TáPronto\n22-28s: benefício\n28-30s: ${cta}`, caption: `Pedido organizado não depende de memória. Veja o fluxo funcionando na prática.\n\n${cta}.`, overlay_text: 'Pedido completo, sem adivinhação' },
    { title: `${topic} nos Stories`, format: 'story', hook: `Qual é a maior bagunça no horário de pico?`, script: `Story 1: enquete\nStory 2: exemplo real\nStory 3: tela do produto\nStory 4: ${cta}`, caption: `Responda a enquete e veja uma forma simples de organizar os pedidos.`, overlay_text: 'Seu pedido chega completo?' }
  ];
}

function check(key, passed, message) { return { key, passed: Boolean(passed), message }; }
function similarityRisk(item, recent) { const source = tokens(`${item.title || ''} ${item.hook || ''}`); if (!source.size) return 0; return Math.max(0, ...recent.filter((other) => other.id !== item.id).map((other) => { const target = tokens(`${other.title || ''} ${other.hook || ''}`); const shared = [...source].filter((token) => target.has(token)).length; return shared / new Set([...source, ...target]).size; })); }
function tokens(value) { return new Set(String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((word) => word.length > 3)); }
