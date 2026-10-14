(function exposePlatformClientList(root) {
  const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
  const demoCompanyId = '2f11b078-bf31-40e6-8328-1e1200a02b07';

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

  root.PlatformClientList = Object.freeze({ sortCompaniesAlphabetically, companiesEligibleForAttention, compactClientSummary });
})(globalThis);
