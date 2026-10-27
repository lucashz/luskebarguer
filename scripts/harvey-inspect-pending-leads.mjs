import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

function scoreLeadHarvey(lead, payload) {
  let score = 0;
  const reasons = [];

  // 1. Reachability & Phone (0-3 pts)
  const phone = String(lead.phone || '').replace(/\D/g, '');
  const isMobile = phone.length === 13 && phone.startsWith('55') && phone[4] === '9';
  if (isMobile) {
    score += 3;
    reasons.push('WhatsApp móvel direto verificado (+3)');
  } else if (phone.length >= 10) {
    score += 1;
    reasons.push('Telefone cadastrado mas verificar se é móvel (+1)');
  } else {
    reasons.push('Telefone inválido ou ausente (0)');
  }

  // 2. Segment & Business Fit (0-3 pts)
  const seg = String(lead.segment || '').toLowerCase();
  const name = String(lead.business_name || '').toLowerCase();
  const isTargetFood = ['restaurante', 'pizzaria', 'hamburgueria', 'lanchonete', 'pastelaria', 'petiscaria', 'bar', 'pub', 'delivery', 'sushi', 'acai'].some(k => seg.includes(k) || name.includes(k));
  if (isTargetFood) {
    score += 3;
    reasons.push('Segmento de alimentação com alta rotatividade (+3)');
  } else {
    score += 1;
    reasons.push('Segmento geral (+1)');
  }

  // 3. Signal & Preview Readiness (0-2 pts)
  const hasPreview = Boolean(payload?.previews?.mobilePath || payload?.previews?.desktopPath || lead.metadata?.menu_url);
  if (hasPreview) {
    score += 2;
    reasons.push('Cardápio demo e prévia gerada pronta (+2)');
  } else {
    reasons.push('Sem prévia visual gerada (0)');
  }

  // 4. Location / Target Fit (0-2 pts)
  if (lead.city) {
    score += 2;
    reasons.push(`Localização mapeada (${lead.city}/${lead.state || 'BR'}) (+2)`);
  }

  let tier = 'Tier 3 (Descartar)';
  if (score >= 8) tier = 'Tier 1 (Alta Prioridade - Disparo Imediato)';
  else if (score >= 5) tier = 'Tier 2 (Padrão)';

  return { score, tier, reasons: reasons.join(' | ') };
}

async function main() {
  console.log('=== HARVEY SCOUT: INSPEÇÃO E QUALIFICAÇÃO DE LEADS PENDENTES ===\n');

  const pending = await pool.query(`
    SELECT j.id AS job_id, j.status, 
           to_char(j.run_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS run_brt,
           j.payload,
           l.id AS lead_id, l.business_name, l.phone, l.city, l.state, l.segment, l.metadata
    FROM sales_automation_jobs j
    LEFT JOIN sales_leads l ON l.id = j.lead_id
    WHERE j.status = 'pending'
    ORDER BY j.run_at ASC
  `);

  console.log(`Total de jobs pendentes encontrados: ${pending.rowCount}\n`);

  const results = pending.rows.map(row => {
    const harvey = scoreLeadHarvey(row, row.payload);
    return {
      job_id: row.job_id.slice(0, 8),
      empresa: row.business_name?.slice(0, 32),
      cidade: row.city || 'N/A',
      whatsapp: row.phone,
      agendado_para: row.run_brt,
      score_harvey: `${harvey.score}/10`,
      classificacao: harvey.tier
    };
  });

  if (results.length > 0) {
    console.table(results);
  } else {
    console.log('Nenhum job com status "pending" no momento.');
    
    // Check next scheduled jobs or uncontacted candidates
    const recent = await pool.query(`
      SELECT j.id, j.status, 
             to_char(j.run_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as run_brt,
             l.business_name, l.phone
      FROM sales_automation_jobs j
      LEFT JOIN sales_leads l ON l.id = j.lead_id
      ORDER BY j.run_at DESC LIMIT 10
    `);
    console.log('\nÚltimos jobs no banco:');
    console.table(recent.rows);
  }

  await pool.end();
}

main().catch(err => {
  console.error('Erro na qualificação Harvey:', err);
  process.exit(1);
});

