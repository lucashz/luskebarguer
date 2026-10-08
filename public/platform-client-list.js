(function exposePlatformClientList(root) {
  const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
  const demoCompanyId = '2f11b078-bf31-40e6-8328-1e1200a02b07';
  const sourceLabels = Object.freeze({ self_service: 'Autoatendimento', platform_admin: 'Central administrativa', assisted: 'Cadastro assistido', sales_automation: 'Automação de vendas', import: 'Importação', api: 'API' });
  const purposeLabels = Object.freeze({ customer_request: 'Solicitação do cliente', lead_capture: 'Captação de lead', internal_test: 'Teste interno', migration: 'Migração', demo: 'Demonstração' });

  function registrationSourceLabel(value) { return sourceLabels[value] || value || 'Não informado'; }
  function registrationPurposeLabel(value) { return purposeLabels[value] || value || 'Não informado'; }
  function registrationProvenanceLabel(provenance) {
    if (!provenance || provenance.state === 'legacy_untracked') return 'Legado sem rastreamento';
    return `${registrationSourceLabel(provenance.source)} · ${registrationPurposeLabel(provenance.purpose)}`;
  }
  function customerAccessLabel(lastCustomerLoginAt) {
    return lastCustomerLoginAt ? `Último acesso: ${new Date(lastCustomerLoginAt).toLocaleString('pt-BR')}` : 'Cliente nunca acessou';
  }
  function buildCompanyFilterQuery({ creationSource, creationPurpose, createdByAdminId, customerAccess, page = 1, perPage = 100 } = {}) {
    const params = new URLSearchParams();
    if (creationSource) params.set('creation_source', creationSource);
    if (creationPurpose) params.set('creation_purpose', creationPurpose);
    if (createdByAdminId) params.set('created_by_admin_id', createdByAdminId);
    if (customerAccess) params.set('customer_access', customerAccess);
    params.set('page', String(page));
    params.set('per_page', String(perPage));
    return params.toString();
  }

  function sortCompaniesAlphabetically(companies = []) {
    return [...companies].sort((left, right) => collator.compare(String(left?.name || ''), String(right?.name || '')));
  }

  function companiesEligibleForAttention(companies = []) {
    const terminalStatuses = new Set(['cancelled', 'archived', 'deleted']);
    return companies.filter((company) => company?.id !== demoCompanyId && !company?.excluded_from_metrics && !terminalStatuses.has(String(company?.status || '').toLowerCase()));
  }

  function compactClientSummary({ company = {}, responsible = null, store = null, planName = 'Sem plano', status = '', ordersMonth = 0, revenueLabel = 'R$ 0,00' } = {}) {
    const responsibleLabel = [responsible?.name, responsible?.email].filter(Boolean).join(' · ') || 'Sem responsável';
    return [
      { key: 'company', label: 'Empresa', value: company.name || 'Sem nome' },
      { key: 'store', label: 'Loja', value: store ? `${store.name || 'Loja'}${store.slug ? ` /${store.slug}` : ''}` : 'Sem loja' },
      { key: 'responsible', label: 'Responsável', value: responsibleLabel },
      { key: 'contact', label: 'Contato', value: [company.billing_email, company.phone].filter(Boolean).join(' · ') || 'Não informado' },
      { key: 'plan', label: 'Plano', value: planName || 'Sem plano' },
      { key: 'status', label: 'Status', value: status || 'Sem status' },
      { key: 'orders', label: 'Pedidos/mês', value: String(Number(ordersMonth || 0)) },
      { key: 'revenue', label: 'Faturamento', value: revenueLabel || 'R$ 0,00' },
      { key: 'created', label: 'Cadastro', value: company.created_at ? new Date(company.created_at).toLocaleDateString('pt-BR') : '-' }
    ];
  }

  root.PlatformClientList = Object.freeze({ sortCompaniesAlphabetically, companiesEligibleForAttention, compactClientSummary, registrationSourceLabel, registrationPurposeLabel, registrationProvenanceLabel, customerAccessLabel, buildCompanyFilterQuery });
})(globalThis);
