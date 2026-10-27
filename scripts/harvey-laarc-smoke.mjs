import assert from 'node:assert/strict';
import { classifyInboundReply, generateLaarcResponse, TAPRONTO_KNOWLEDGE } from '../src/lib/harvey-laarc-handler.js';

console.log('--- TESTANDO HARVEY KNOWLEDGE-BASE & LAARC ENGINE ---');

// 1. Verify Knowledge Base Loaded
assert.ok(TAPRONTO_KNOWLEDGE.product, 'Knowledge base deve conter o produto.');
assert.ok(TAPRONTO_KNOWLEDGE.commission, 'Knowledge base deve conter dados de comissão.');
console.log('✓ Base de Conhecimento do TáPronto carregada com sucesso');

// 2. Test Classification of Real Product Questions
console.log('2. Testando Classificação de Dúvidas Reais de Restaurantes...');

const testCases = [
  { q: 'Vocês cobram porcentagem ou taxa por pedido?', expected: 'commission_fees' },
  { q: 'Dá pra imprimir na impressora térmica?', expected: 'printer_integration' },
  { q: 'O cliente pode pagar por Pix com QR Code?', expected: 'payment_pix' },
  { q: 'Tem como colocar taxa de entrega por bairro?', expected: 'delivery_rules' },
  { q: 'O cliente precisa baixar algum aplicativo?', expected: 'app_download' },
  { q: 'Como faço pra alterar o preço dos pratos?', expected: 'menu_editing' },
  { q: 'Tem contrato de fidelidade ou multa se cancelar?', expected: 'contract_loyalty' },
  { q: 'Como é que funciona pra receber o pedido?', expected: 'how_it_works' },
  { q: 'Dá pra programar o horário que a loja abre e fecha?', expected: 'store_hours' },
  { q: 'Já usamos o iFood aqui', expected: 'competitor_ifood' },
  { q: 'Uso o Olaclick atualmente', expected: 'competitor_other' },
  { q: 'Quanto custa a mensalidade?', expected: 'price_question' },
  { q: 'Já tenho cardápio em PDF no WhatsApp', expected: 'pdf_status_quo' },
  { q: 'Estou na correria agora, depois vejo', expected: 'timing_busy' },
  { q: 'Gostei, pode mandar o link', expected: 'interested' },
  { q: 'Não temos interesse, obrigado', expected: 'brush_off' },
  { q: 'Por favor parar de mandar mensagens', expected: 'opt_out' },
  { q: 'Explica mais sobre esse sistema de vocês', expected: 'how_it_works' },
  { q: 'Qualquer dúvida totalmente aberta', expected: 'general_product_info' }
];

for (const { q, expected } of testCases) {
  const result = classifyInboundReply(q);
  assert.equal(result.category, expected, `Pergunta "${q}" deveria ser classificada como ${expected}, mas foi ${result.category}`);
}
console.log(`✓ Todas as ${testCases.length} perguntas reais foram classificadas corretamente`);

// 3. Test Response Quality, Knowledge-Base Accuracy & Anti-AI Rules
console.log('3. Testando Qualidade das Respostas baseadas em Fatos Reais...');

const categoriesToTest = [
  'printer_integration', 'commission_fees', 'payment_pix', 'delivery_rules',
  'app_download', 'menu_editing', 'contract_loyalty', 'store_hours',
  'photos_dishes', 'how_it_works', 'competitor_ifood', 'competitor_other',
  'price_question', 'pdf_status_quo', 'timing_busy', 'interested', 'general_product_info'
];

for (const cat of categoriesToTest) {
  const reply = generateLaarcResponse(cat, {
    previewUrl: 'https://taprontomenu.com.br/demo-pizzaria'
  });

  // Anti-AI and persona validations
  assert.ok(!reply.includes('—'), `[${cat}] não pode conter travessão em dash.`);
  assert.ok(!reply.toLowerCase().includes('revolucionário'), `[${cat}] não pode ter buzzwords.`);
  assert.ok(!reply.toLowerCase().includes('imagine'), `[${cat}] não pode ter infomercial phrasing.`);
  assert.ok(!/^oi[!,.\s]/i.test(reply), `[${cat}] não deve começar com 'Oi!', pois o cumprimento já ocorreu.`);
  
  // Word count check (< 50 words)
  const wordCount = reply.split(/\s+/).length;
  assert.ok(wordCount <= 50, `[${cat}] muito longa: ${wordCount} palavras.`);
  console.log(`✓ [${cat}] (${wordCount} palavras): "${reply.slice(0, 65)}..."`);
}

console.log('\n--- TODOS OS TESTES DE KNOWLEDGE BASE PASSARAM COM SUCESSO (100% OK) ---');
