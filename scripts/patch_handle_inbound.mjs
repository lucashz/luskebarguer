import { readFileSync, writeFileSync } from 'node:fs';

const filePath = 'D:/lsk/TáProntomenu.com.br/.worktrees/release-production-outreach-20261014/scripts/handle-inbound-trojan.mjs';
let content = readFileSync(filePath, 'utf8');

// Patch 1: Opt-out in Step 1
const target1 = `    // 1. Classificação da Mensagem Inbound
    const classification = classifyInboundMessage(lastInbound, elapsedSeconds);`;

const replacement1 = `    // 0. Detecção de Opt-out / Recusa no Step 1
    const optOutPatterns = [
      /\\bn[aã]o\\s+(?:quero|tenho interesse|precis[oa]|obrigad[oa]|autoriz[oa]|mande|envie)\\b/i,
      /\\bsem\\s+interesse\\b/i,
      /\\bpare\\b/i,
      /\\bremov[ae].{0,18}(?:n[uú]mero|contato|lista)\\b/i,
      /\\bn[aã]o entre em contato\\b/i,
      /\\bme deixa em paz\\b/i,
      /\\bdescadastr[ae]\\b/i,
      /\\bsair\\b/i
    ];
    if (optOutPatterns.some(p => p.test(lastInbound))) {
      console.log(\`  🚫 Opt-out detectado em \${row.business_name} ("\${lastInbound}"). Atualizando etapa para opted_out.\`);
      await pool.query(\`
        UPDATE sales_leads
        SET stage = 'opted_out',
            automation_status = 'stopped',
            opted_out_at = now(),
            stop_reason = 'Opt-out recebido via WhatsApp',
            updated_at = now()
        WHERE id = $1
      \`, [row.lead_id]);
      await pool.query(\`
        INSERT INTO sales_suppressions (normalized_phone, reason, source, created_at)
        VALUES ($1, 'Opt-out recebido via WhatsApp', 'lead_opt_out', now())
        ON CONFLICT (normalized_phone) DO NOTHING
      \`, [phone]);
      continue;
    }

    // 1. Classificação da Mensagem Inbound
    const classification = classifyInboundMessage(lastInbound, elapsedSeconds);`;

if (!content.includes(target1)) {
  throw new Error('target1 not found in handle-inbound-trojan.mjs');
}
content = content.replace(target1, replacement1);

// Patch 2: Opt-out in Step 2
const target2 = `    // Validar se resposta é afirmativa
    if (!isAffirmativeReply(lastInbound)) {
      console.log(\`  ℹ️ Resposta não é afirmativa direta ("\${lastInbound}"). Mantendo para análise manual.\`);
      continue;
    }`;

const replacement2 = `    // 0. Detecção de Recusa / Opt-out no Step 2
    const step2RefusalPatterns = [
      /\\bn[aã]o\\s+(?:quero|tenho interesse|precis[oa]|obrigad[oa]|autoriz[oa]|mande|envie|manda)\\b/i,
      /\\bsem\\s+interesse\\b/i,
      /\\bdeixa\\s+quieto\\b/i,
      /\\bdispenso\\b/i,
      /\\bpare\\b/i
    ];
    if (step2RefusalPatterns.some(p => p.test(lastInbound))) {
      console.log(\`  🚫 Lead recusou demonstração no Step 2: \${row.business_name} ("\${lastInbound}").\`);
      await pool.query(\`
        UPDATE sales_leads
        SET stage = 'opted_out',
            automation_status = 'stopped',
            opted_out_at = now(),
            stop_reason = 'Recusa de demonstração via WhatsApp',
            updated_at = now()
        WHERE id = $1
      \`, [row.lead_id]);
      continue;
    }

    // Validar se resposta é afirmativa
    if (!isAffirmativeReply(lastInbound)) {
      console.log(\`  ℹ️ Resposta não é afirmativa direta ("\${lastInbound}"). Mantendo para análise manual.\`);
      continue;
    }`;

if (!content.includes(target2)) {
  throw new Error('target2 not found in handle-inbound-trojan.mjs');
}
content = content.replace(target2, replacement2);

writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched handle-inbound-trojan.mjs!');

