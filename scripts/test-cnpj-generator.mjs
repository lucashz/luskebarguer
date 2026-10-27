import { validateDocument } from '../src/lib/assisted-registration.js';

function generateValidCnpj(seedNumber) {
  const base = String(900000000000n + BigInt(seedNumber)).slice(-12).padStart(12, '0');
  const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const secondWeights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  
  const d1Calc = base.split('').reduce((sum, d, i) => sum + Number(d) * firstWeights[i], 0) % 11;
  const d1 = d1Calc < 2 ? 0 : 11 - d1Calc;
  
  const baseWithD1 = base + d1;
  const d2Calc = baseWithD1.split('').reduce((sum, d, i) => sum + Number(d) * secondWeights[i], 0) % 11;
  const d2 = d2Calc < 2 ? 0 : 11 - d2Calc;
  
  return base + d1 + d2;
}

for (let i = 1; i <= 5; i++) {
  const cnpj = generateValidCnpj(i);
  console.log(`Seed ${i} -> ${cnpj} -> valid:`, validateDocument(cnpj));
}
