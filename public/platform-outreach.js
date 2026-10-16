(function registerOutreachDashboard(global) {
  function renderOutreachMetricsHtml(outreach, options = {}) {
    if (options.loading) return '<p class="empty-state">Carregando métricas de prospecção...</p>';
    if (options.error) return `<p class="empty-state">${escapeHtml(options.error)}</p>`;

    const data = outreach || {};
    const summary = data.summary || {};
    const rates = data.rates || {};
    if (!Number(summary.found || summary.contacts_sent || summary.respondents || summary.discarded || 0)) {
      return '<p class="empty-state">Nenhuma prospecção registrada no período selecionado.</p>';
    }

    const funnel = [
      ['Encontrados', summary.found],
      ['Qualificados', summary.qualified],
      ['Prévias prontas', summary.previews_ready],
      ['Contatados', summary.contacts_sent],
      ['Responderam', summary.respondents],
      ['Interessados', summary.interested],
      ['Conversão', summary.conversions]
    ];
    const maxFunnel = Math.max(1, ...funnel.map(([, value]) => Number(value || 0)));
    const rateCards = [
      ['Qualificação', rates.qualification, 'qualificados ÷ encontrados'],
      ['Preparação', rates.preparation, 'prévias ÷ qualificados'],
      ['Envio', rates.send_completion, 'contatados ÷ prévias'],
      ['Resposta', rates.response, 'respostas ÷ contatos'],
      ['Interesse por contato', rates.interest_per_contact, 'interessados ÷ contatos'],
      ['Conversão', rates.conversion, 'empresas ÷ contatos']
    ];

    return `
      <section class="outreach-dashboard" aria-label="Prospecção automática">
        <div class="outreach-summary-grid">
          ${[
            ['Encontrados', summary.found],
            ['Qualificados', summary.qualified],
            ['Descartados', summary.discarded],
            ['Prévias', summary.previews_ready],
            ['Contatados', summary.contacts_sent],
            ['Responderam', summary.respondents],
            ['Interessados', summary.interested],
            ['Remoções', summary.opt_outs],
            ['Falhas', summary.failures],
            ['Conversões', summary.conversions]
          ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${number(value)}</strong></article>`).join('')}
        </div>
        <div class="outreach-layout">
          <section class="outreach-panel">
            <h4>Funil da prospecção automática</h4>
            <div class="outreach-funnel">
              ${funnel.map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${number(value)}</strong><i style="--value:${Math.max(3, (Number(value || 0) / maxFunnel) * 100)}%"></i></article>`).join('')}
            </div>
          </section>
          <section class="outreach-panel">
            <h4>Taxas comerciais</h4>
            <div class="outreach-rate-grid">
              ${rateCards.map(([label, value, hint]) => `<article><span>${escapeHtml(label)}</span><strong>${number(value)}%</strong><small>${escapeHtml(hint)}</small></article>`).join('')}
            </div>
          </section>
        </div>
        <div class="outreach-breakdowns">
          ${listSection('Motivos de descarte', data.discard_reasons, (row) => [discardLabel(row.code), row.count])}
          ${listSection('Cidades', data.locations, (row) => [`${row.city || 'Não informada'}${row.state ? `/${row.state}` : ''}`, `${number(row.contacts_sent)} contatos · ${number(row.responses)} respostas`])}
          ${listSection('Segmentos', data.segments, (row) => [row.segment || 'Não informado', `${number(row.contacts_sent)} contatos · ${number(row.interested)} interessados`])}
          ${listSection('Cotas gratuitas', data.quotas, (row) => [quotaLabel(row.sku), `${number(row.used)} usadas · ${number(row.remaining)} restantes`])}
        </div>
        ${dailyTable(data.daily)}
        ${recentTable(data.recent_leads)}
        <div class="outreach-health">
          <span>Evolution API: <strong>${escapeHtml(healthLabel(data.health?.evolution))}</strong></span>
          <span>Webhook: <strong>${escapeHtml(healthLabel(data.health?.webhook))}</strong></span>
        </div>
      </section>
    `;
  }

  function listSection(title, rows, mapper) {
    const items = Array.isArray(rows) ? rows.slice(0, 6) : [];
    return `<section class="outreach-panel"><h4>${escapeHtml(title)}</h4>${items.length ? items.map((row) => {
      const [label, value] = mapper(row);
      return `<p><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></p>`;
    }).join('') : '<p class="outreach-empty">Sem dados no período.</p>'}</section>`;
  }

  function dailyTable(rows) {
    const items = Array.isArray(rows) ? rows.slice(-10).reverse() : [];
    if (!items.length) return '';
    return `<section class="outreach-panel outreach-table-wrap"><h4>Evolução diária</h4><table><thead><tr><th>Data</th><th>Encontrados</th><th>Qualificados</th><th>Contatos</th><th>Respostas</th></tr></thead><tbody>${items.map((row) => `<tr><td>${escapeHtml(formatDate(row.date))}</td><td>${number(row.found)}</td><td>${number(row.qualified)}</td><td>${number(row.contacts_sent)}</td><td>${number(row.responses)}</td></tr>`).join('')}</tbody></table></section>`;
  }

  function recentTable(rows) {
    const items = Array.isArray(rows) ? rows.slice(0, 20) : [];
    if (!items.length) return '';
    return `
      <section class="outreach-panel outreach-table-wrap">
        <h4>Contatos recentes e Cardápios</h4>
        <table>
          <thead>
            <tr>
              <th>Estabelecimento</th>
              <th>Local</th>
              <th>Telefone</th>
              <th>Etapa</th>
              <th>Cardápio Criado</th>
              <th>Validade</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((row) => {
              const hasMenu = Boolean(row.menu_url || row.store_id);
              let menuCell = '<span class="muted">—</span>';
              if (row.menu_url) {
                const slug = row.menu_url.replace(/^https?:\/\/[^/]+\/?/, '/');
                menuCell = `<a href="${escapeHtml(row.menu_url)}" target="_blank" rel="noopener noreferrer" class="outreach-menu-link" style="color:var(--primary,#0284c7);font-weight:600;text-decoration:none;">${escapeHtml(slug)} ↗</a>`;
              }

              let statusCell = '<span class="muted">—</span>';
              let actionsCell = '<span class="muted">—</span>';

              if (hasMenu) {
                if (row.continuity_confirmed) {
                  statusCell = `<span class="status-pill success" style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;">✓ Mantido</span>`;
                  actionsCell = `<small style="color:#166534;font-weight:500;">Continuidade dada</small>`;
                } else if (row.menu_status === 'deleted') {
                  statusCell = `<span class="status-pill muted" style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:999px;font-size:12px;">Excluído</span>`;
                  actionsCell = `<small class="muted">Prazo de 2 dias expirou</small>`;
                } else {
                  const hours = typeof row.hours_remaining === 'number' ? row.hours_remaining : null;
                  const isExpiringSoon = hours !== null && hours <= 12;
                  const expColor = isExpiringSoon ? '#991b1b' : '#854d0e';
                  const expBg = isExpiringSoon ? '#fee2e2' : '#fef9c3';
                  const expText = hours !== null ? (hours > 0 ? `Expira em ${hours}h` : 'Expirando hoje') : 'Ativo (2 dias)';
                  statusCell = `<span class="status-pill" style="background:${expBg};color:${expColor};padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;">${escapeHtml(expText)}</span>`;
                  actionsCell = `
                    <div style="display:flex;gap:6px;align-items:center;">
                      <button class="primary-button compact" data-outreach-continuity="${row.id}" type="button" style="padding:4px 10px;font-size:12px;white-space:nowrap;">Dar continuidade</button>
                      <button class="ghost-button compact" data-outreach-delete-menu="${row.id}" type="button" title="Excluir cardápio agora" style="padding:4px 8px;font-size:12px;color:#dc2626;border-color:#fecaca;">Excluir</button>
                    </div>
                  `;
                }
              }

              return `<tr>
                <td><strong>${escapeHtml(row.business_name)}</strong></td>
                <td>${escapeHtml([row.city, row.state].filter(Boolean).join('/'))}</td>
                <td>${escapeHtml(row.phone)}</td>
                <td>${escapeHtml(stageLabel(row.stage))}</td>
                <td>${menuCell}</td>
                <td>${statusCell}</td>
                <td>${actionsCell}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </section>
    `;
  }

  function number(value) { return Number(value || 0).toLocaleString('pt-BR'); }
  function formatDate(value) { const [year, month, day] = String(value || '').slice(0, 10).split('-'); return year && month && day ? `${day}/${month}` : ''; }
  function healthLabel(value) { return ({ connected: 'Conectada', healthy: 'Saudável', disconnected: 'Desconectada', unavailable: 'Indisponível', unknown: 'Sem leitura' })[value] || value || 'Sem leitura'; }
  function stageLabel(value) { return ({ discovered: 'Encontrado', basic_validated: 'Validado', activity_validated: 'Ativo', menu_checked: 'Sem cardápio', photos_ready: 'Fotos prontas', preview_ready: 'Prévia pronta', scheduled: 'Agendado', awaiting_reply: 'Aguardando resposta', discarded: 'Descartado', send_failed: 'Falha no envio', opted_out: 'Removido', human_handoff: 'Atendimento humano' })[value] || value || '—'; }
  function discardLabel(value) { return ({ online_menu: 'Já possui cardápio online', no_whatsapp: 'WhatsApp não confirmado', inactive: 'Sem atividade recente', insufficient_photos: 'Fotos insuficientes', duplicate: 'Contato já trabalhado', inconclusive: 'Validação inconclusiva' })[value] || value || 'Não informado'; }
  function quotaLabel(value) { return ({ places_pro: 'Google Places Pro', places_advanced: 'Google Places avançado', place_photos: 'Fotos do Google' })[value] || value || 'Cota'; }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]); }

  global.OutreachDashboard = Object.freeze({ renderOutreachMetricsHtml });
})(globalThis);
