export const TAPRONTO_DEMO_COMPANY_ID = '2f11b078-bf31-40e6-8328-1e1200a02b07';

export function platformMetricsExcludedCompanyIds(env = process.env) {
  const configured = String(env.PLATFORM_METRICS_EXCLUDED_COMPANY_IDS || TAPRONTO_DEMO_COMPANY_ID)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured);
}

export function filterPlatformMetricsData(data = {}, options = {}) {
  const excludedCompanyIds = new Set(options.excludedCompanyIds || platformMetricsExcludedCompanyIds(options.env));
  for (const company of data.companies || []) {
    if (company?.creation_purpose === 'internal_test') excludedCompanyIds.add(company.id);
  }
  const stores = Array.isArray(data.stores) ? data.stores : [];
  const excludedStoreIds = new Set(stores
    .filter((store) => excludedCompanyIds.has(store.company_id))
    .map((store) => store.id));
  const excludesCompany = (row) => row?.company_id && excludedCompanyIds.has(row.company_id);
  const excludesStore = (row) => row?.store_id && excludedStoreIds.has(row.store_id);
  const keepCompany = (row) => !excludedCompanyIds.has(row?.id);
  const keepStore = (row) => !excludedCompanyIds.has(row?.company_id);
  const keepCompanyRelation = (row) => !excludesCompany(row);
  const keepStoreRelation = (row) => !excludesStore(row);
  const keepMetricEvent = (row) => !excludesCompany(row) && !excludesStore(row);

  return {
    ...data,
    companies: (data.companies || []).filter(keepCompany),
    stores: stores.filter(keepStore),
    subscriptions: (data.subscriptions || []).filter(keepCompanyRelation),
    subscriptionEvents: (data.subscriptionEvents || []).filter(keepCompanyRelation),
    orders: (data.orders || []).filter(keepStoreRelation),
    products: (data.products || []).filter(keepStoreRelation),
    settings: (data.settings || []).filter(keepStoreRelation),
    accessEvents: (data.accessEvents || []).filter(keepMetricEvent),
    marketingEvents: (data.marketingEvents || []).filter(keepMetricEvent),
    excludedCompanyIds,
    excludedStoreIds
  };
}

export function isPlatformRevenueSubscription(subscription = {}) {
  return ['active', 'trial', 'grace_period', 'payment_pending'].includes(subscription.status);
}

export function isPlatformPublishedStore(store = {}, company = {}) {
  return store.is_active !== false && !['onboarding', 'archived', 'cancelled'].includes(company.status);
}
