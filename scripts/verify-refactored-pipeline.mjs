import pg from 'pg';
import { buildInquiryMessage } from './autonomous-daily-outreach.mjs';
import { buildStep2PivotMessage } from './handle-inbound-trojan.mjs';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

console.log('--- TESTE 1: SPINTAX PASSO 1 (TEMPORALMENTE INDEPENDENTE) ---');
for (let i = 0; i < 3; i++) {
  console.log(`Variante ${i + 1}:`, buildInquiryMessage({ segment: 'hamburgueria' }));
}

console.log('\n--- TESTE 2: STEP 2 COM AUTENTICIDADE ---');

// Cenário A: Lead com template padrão (deve elogiar nota e avaliações do Google Maps)
const templateLead = {
  business_name: 'Pizzaria Bella Itália',
  rating: '4.8',
  metadata: { rating: '4.8', reviews_count: 320 }
};
const pivotTemplate = buildStep2PivotMessage({
  lead: templateLead,
  itemName: 'Pizza Especial da Casa',
  classification: { type: 'HUMAN_TEXT' },
  segment: 'pizzaria'
});
console.log('Pivot Lead Template (Google Maps Praise):\n', pivotTemplate);

// Cenário B: Lead com cardápio real extraído (deve elogiar o prato real diretamente)
const realMenuLead = {
  business_name: 'Costelaria Premium',
  metadata: { has_real_menu: true }
};
const pivotReal = buildStep2PivotMessage({
  lead: realMenuLead,
  itemName: 'Costela no Bafo com Mandioca',
  classification: { type: 'HUMAN_TEXT' },
  segment: 'restaurante'
});
console.log('\nPivot Lead com Cardápio Real (Direct Dish Praise):\n', pivotReal);

console.log('\n--- TESTE 3: AMOSTRA DE CANDIDATOS SORTIDOS NO BANCO ---');
const candRes = await pool.query(`
  SELECT id, business_name, segment, city, phone, score, metadata->>'rating' AS rating, metadata->>'reviews_count' AS reviews
  FROM sales_leads
  WHERE stage IN ('discovered', 'verified')
    AND attempt_count = 0
    AND phone IS NOT NULL
    AND stage NOT IN ('discarded', 'opted_out')
    AND (metadata->>'outreach_strategy') IS NULL
  ORDER BY COALESCE(score, 0) DESC, RANDOM()
  LIMIT 5
`);
console.table(candRes.rows);

await pool.end();
console.log('\n✓ Validação concluída com sucesso!');

