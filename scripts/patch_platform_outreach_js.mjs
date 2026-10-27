import { readFileSync, writeFileSync } from 'node:fs';

const filePath = 'D:/lsk/TáProntomenu.com.br/.worktrees/release-production-outreach-20261014/public/platform-outreach.js';
let content = readFileSync(filePath, 'utf8');

// 1. Update stageLabel
const oldStageLabel = "function stageLabel(value) { return ({ discovered: 'Encontrado', basic_validated: 'Validado', activity_validated: 'Ativo', menu_checked: 'Sem cardápio', photos_ready: 'Fotos prontas', preview_ready: 'Prévia pronta', scheduled: 'Agendado', awaiting_reply: 'Aguardando resposta', discarded: 'Descartado', send_failed: 'Falha no envio', opted_out: 'Removido', human_handoff: 'Atendimento humano' })[value] || value || '—'; }";

const newStageLabel = `function stageLabel(value) {
    return ({
      discovered: 'Na fila',
      contacted: 'Aguardando resposta',
      awaiting_reply: 'Aguardando resposta',
      replied: 'Respondeu no WhatsApp',
      engaged: 'Respondeu (Engajado)',
      trojan_pivot_step2: 'Apresentando Solução',
      trojan_demo_delivered: 'Cardápio Entregue',
      link_clicked: 'Visualizou Cardápio',
      basic_validated: 'Validado',
      activity_validated: 'Ativo',
      menu_checked: 'Sem cardápio',
      photos_ready: 'Fotos prontas',
      preview_ready: 'Cardápio Pronto',
      scheduled: 'Agendado',
      discarded: 'Descartado',
      send_failed: 'Falha no envio',
      opted_out: 'Sem interesse (Opt-out)',
      won: 'Cliente Mantido',
      human_handoff: 'Atendimento humano'
    })[value] || value || '—';
  }

  function stagePill(row) {
    if (row.stage_badge) {
      let bg = '#f1f5f9';
      let color = '#475569';
      let border = '#cbd5e1';
      if (row.stage_type === 'success') { bg = '#dcfce7'; color = '#166534'; border = '#86efac'; }
      else if (row.stage_type === 'info') { bg = '#e0f2fe'; color = '#0369a1'; border = '#7dd3fc'; }
      else if (row.stage_type === 'accent') { bg = '#f3e8ff'; color = '#6b21a8'; border = '#d8b4fe'; }
      else if (row.stage_type === 'warning') { bg = '#fef9c3'; color = '#854d0e'; border = '#fde047'; }
      else if (row.stage_type === 'muted') { bg = '#fee2e2'; color = '#991b1b'; border = '#fca5a5'; }

      const inboundTooltip = row.last_inbound_body ? \` title="Última resposta: \${escapeHtml(row.last_inbound_body)}"\` : '';
      return \`<span class="status-pill" style="display:inline-block;background:\${bg};color:\${color};border:1px solid \${border};padding:3px 8px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;"\${inboundTooltip}>\${escapeHtml(row.stage_badge)}</span>\`;
    }
    return escapeHtml(stageLabel(row.stage));
  }`;

if (content.includes('function stagePill(row)')) {
  console.log('public/platform-outreach.js is already patched with stagePill and dynamic stage labels.');
  process.exit(0);
}

if (!content.includes(oldStageLabel)) {
  throw new Error('oldStageLabel not found in platform-outreach.js');
}

content = content.replace(oldStageLabel, newStageLabel);

// 2. Update rows.slice(0, 20) to rows.slice(0, 50)
content = content.replace('const items = Array.isArray(rows) ? rows.slice(0, 20) : [];', 'const items = Array.isArray(rows) ? rows.slice(0, 50) : [];');

// 3. Update stage cell in table
content = content.replace('<td>${escapeHtml(stageLabel(row.stage))}</td>', '<td>${stagePill(row)}</td>');

writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched public/platform-outreach.js!');

