import {
  buildValueFirstStep1,
  buildValueFirstStep2,
  buildValueFirstStep3Followup,
  buildValueFirstMediaReceivedReply,
  normalizeSalesPhone,
  isValidSalesPhone,
  isAffirmativeSalesReply,
  isMenuMediaReply
} from '../src/lib/sales-automation.js';

console.log('=== TESTE UNITÁRIO VALUE-FIRST OUTREACH ===\n');

// 1. Telefone fixo e móvel
const fixedPhone = '(14) 3281-2233';
const mobilePhone = '(14) 99717-0781';
console.log('Fixo normalizado:', normalizeSalesPhone(fixedPhone), 'Válido?', isValidSalesPhone(fixedPhone));
console.log('Móvel normalizado:', normalizeSalesPhone(mobilePhone), 'Válido?', isValidSalesPhone(mobilePhone));

if (!isValidSalesPhone(fixedPhone) || !isValidSalesPhone(mobilePhone)) {
  throw new Error('Falha na validação de telefone fixo/móvel');
}

// 2. Passo 1 com reputação real do Google
const leadHighRating = {
  business_name: 'Pizzaria Bella Bauru',
  city: 'Bauru',
  metadata: { rating: '4.8', reviews_count: 142 }
};
const step1High = buildValueFirstStep1(leadHighRating);
console.log('\n--- PASSO 1 (Alta Reputação): ---');
console.log(step1High);
console.log('Tamanho:', step1High.length, 'chars (limite 350)');
if (step1High.length > 350) throw new Error('Passo 1 excedeu 350 caracteres');
if (!step1High.includes('Pizzaria Bella Bauru')) throw new Error('Nome do estabelecimento ausente no Passo 1');

// 3. Passo 1 sem nota ou com nota baixa (foco na cidade)
const leadLowRating = {
  business_name: 'Bar e Lanches do Zé',
  city: 'Marília',
  metadata: { rating: '3.6', reviews_count: 3 }
};
const step1Low = buildValueFirstStep1(leadLowRating);
console.log('\n--- PASSO 1 (Sem Nota / Foco na Cidade): ---');
console.log(step1Low);
console.log('Tamanho:', step1Low.length, 'chars (limite 350)');
if (step1Low.length > 350) throw new Error('Passo 1 excedeu 350 caracteres');

// 4. Passo 2: Entrega da Loja Demo + Gancho de Importação Gratuita
const step2 = buildValueFirstStep2({ menuUrl: 'https://taprontomenu.com.br/pizzaria-bella-bauru' });
console.log('\n--- PASSO 2 (Entrega Demo): ---');
console.log(step2);
if (!step2.includes('Painel Gestor') || !step2.includes('taprontomenu.com.br')) {
  throw new Error('Passo 2 com falha de conteúdo');
}

// 5. Passo 3: Follow-up Pós-Clique (25min)
const step3 = buildValueFirstStep3Followup();
console.log('\n--- PASSO 3 (Follow-up 25min): ---');
console.log(step3);
if (!step3.includes('impressora de vocês') || !step3.includes('foto do seu cardápio')) {
  throw new Error('Passo 3 com falha de conteúdo');
}

// 6. Confirmação de recebimento de cardápio
const mediaReply = buildValueFirstMediaReceivedReply();
console.log('\n--- CONFIRMAÇÃO DE CARDÁPIO RECEBIDO: ---');
console.log(mediaReply);

// 7. Testes de classificadores
console.log('\n--- CLASSIFICADORES: ---');
console.log('isAffirmative("Pode mandar aí"):', isAffirmativeSalesReply('Pode mandar aí'));
console.log('isAffirmative("quero ver"):', isAffirmativeSalesReply('quero ver'));
console.log('isMenuMedia("segue nosso cardapio em pdf"):', isMenuMediaReply('segue nosso cardapio em pdf'));
console.log('isMenuMedia("vou mandar foto da comanda"):', isMenuMediaReply('vou mandar foto da comanda'));

console.log('\n✅ TODOS OS TESTES UNITÁRIOS PASSARAM COM SUCESSO!');
