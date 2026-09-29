function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function isInstagramPaid(event) {
  const attribution = event?.attribution || {};
  return ['instagram', 'facebook'].includes(normalized(attribution.utm_source))
    && ['paid_social', 'cpc', 'paid'].includes(normalized(attribution.utm_medium));
}

function isCurrentInstagramAd(event) {
  const attribution = event?.attribution || {};
  return isInstagramPaid(event)
    && normalized(attribution.utm_campaign) === 'delivery_noroeste_rs'
    && normalized(attribution.utm_content) === '52582798716168';
}

function eventIdentity(event, stage) {
  if (['signup_completed', 'subscription_created'].includes(stage)) return event.company_id || event.visitor_key || event.id;
  return event.visitor_key || event.company_id || event.id;
}

function stageCount(events, names, stage) {
  return new Set(events
    .filter((event) => names.includes(event.event_name))
    .map((event) => eventIdentity(event, stage))
    .filter(Boolean)).size;
}

function stageCounts(events) {
  return {
    landing_views: stageCount(events, ['landing_view'], 'landing_view'),
    signup_clicks: stageCount(events, ['signup_started'], 'signup_started'),
    signup_completed: stageCount(events, ['signup_completed'], 'signup_completed'),
    whatsapp_clicks: stageCount(events, ['whatsapp_click'], 'whatsapp_click'),
    subscriptions: stageCount(events, ['subscription_created', 'subscription_activated'], 'subscription_created')
  };
}

function rate(part, total) {
  return total ? Number(((part / total) * 100).toFixed(1)) : 0;
}

export function instagramPaidFunnel(events = []) {
  const paidEvents = events.filter(isCurrentInstagramAd);
  const counts = stageCounts(paidEvents);
  const campaignNames = [...new Set(paidEvents.map((event) => String(event.attribution?.utm_campaign || '').trim() || 'Sem campanha'))];
  const campaigns = campaignNames.map((campaign) => ({
    campaign,
    ...stageCounts(paidEvents.filter((event) => (String(event.attribution?.utm_campaign || '').trim() || 'Sem campanha') === campaign))
  })).sort((left, right) => right.landing_views - left.landing_views || left.campaign.localeCompare(right.campaign, 'pt-BR'));
  return {
    ...counts,
    landing_to_signup_click_rate: rate(counts.signup_clicks, counts.landing_views),
    signup_click_to_completed_rate: rate(counts.signup_completed, counts.signup_clicks),
    landing_to_whatsapp_rate: rate(counts.whatsapp_clicks, counts.landing_views),
    landing_to_subscription_rate: rate(counts.subscriptions, counts.landing_views),
    campaigns
  };
}

export function assistedRegistrationMetrics(rows = [], events = [], subscriptions = []) {
  const stagesWithMenu = new Set(['reviewing_menu', 'ready_to_publish', 'published', 'activated']);
  const declaredSourceCounts = new Map();
  for (const row of rows) {
    const source = String(row.attribution?.declared_source || row.declared_source || row.answers?.contact?.source || 'Não informada').trim() || 'Não informada';
    declaredSourceCounts.set(source, (declaredSourceCounts.get(source) || 0) + 1);
  }
  const companyIds = new Set(rows.map((row) => row.company_id).filter(Boolean));
  const whatsappClicks = stageCount(events.filter(isCurrentInstagramAd), ['whatsapp_click'], 'whatsapp_click');
  const initiated = rows.length;
  const published = rows.filter((row) => ['published', 'activated'].includes(row.status) || row.published_at).length;
  const activated = rows.filter((row) => row.status === 'activated' || row.activated_at).length;
  const trialsStarted = new Set(subscriptions
    .filter((row) => companyIds.has(row.company_id) && (row.trial_started_at || row.status === 'trial'))
    .map((row) => row.company_id)).size;
  const subscriptionsCreated = new Set(subscriptions
    .filter((row) => companyIds.has(row.company_id) && ['active', 'grace_period', 'payment_pending'].includes(row.status))
    .map((row) => row.company_id)).size;

  return {
    whatsapp_clicks: whatsappClicks,
    initiated,
    menus_received: rows.filter((row) => stagesWithMenu.has(row.status)).length,
    menus_in_review: rows.filter((row) => row.status === 'reviewing_menu').length,
    published,
    emails_sent: rows.filter((row) => row.email_status === 'sent').length,
    activated,
    trials_started: trialsStarted,
    subscriptions_created: subscriptionsCreated,
    click_to_initiated_rate: rate(initiated, whatsappClicks),
    initiated_to_published_rate: rate(published, initiated),
    published_to_activated_rate: rate(activated, published),
    attribution_notice: 'Cliques são anônimos e não são vinculados individualmente aos contatos.',
    declared_sources: [...declaredSourceCounts.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source, 'pt-BR'))
  };
}
