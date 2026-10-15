import { normalizeSalesPhone } from './sales-automation.js';

const ONLINE_MENU_HOSTS = /(^|\.)(ifood\.com\.br|anota\.ai|ola\.click|goomer\.app|pedido\.anota\.ai|deliverydireto\.com\.br|menudino\.com|cardapioweb\.com)$/i;
const MENU_PATH = /\/(cardapio|cardápio|menu|pedido|pedidos|order|orders|delivery)(?:\/|$|[?#])/i;
const MENU_TEXT = /\b(card[aá]pio|menu|pe[çc]a online|pedir online|fa[çc]a seu pedido|escolha seus produtos|delivery online)\b/i;

export async function qualifyOutreachCandidate(candidate = {}, dependencies = {}) {
  const now = validDate(dependencies.now) || new Date();
  const placeId = clean(candidate.id || candidate.place_id || candidate.google_place_id);
  const businessName = clean(candidate.displayName?.text || candidate.business_name || candidate.name);
  const phone = normalizeSalesPhone(candidate.nationalPhoneNumber || candidate.phone);
  const activityMaxDays = positiveDays(dependencies.activityMaxDays, 90);
  const evidence = { place_id: placeId, checked_at: now.toISOString() };

  if (!placeId || !businessName || !phone) return discarded('invalid_contact', evidence, now, placeId);
  if (!requiredFunction(dependencies.hasPriorContact, 'hasPriorContact')) return discarded('inconclusive', evidence, now, placeId);
  if (await dependencies.hasPriorContact({ placeId, phone, businessName })) return discarded('duplicate', evidence, now, placeId);

  if (!requiredFunction(dependencies.isSuppressed, 'isSuppressed')) return discarded('inconclusive', evidence, now, placeId);
  if (await dependencies.isSuppressed({ phone })) return discarded('suppressed', evidence, now, placeId);

  if (!requiredFunction(dependencies.checkWhatsApp, 'checkWhatsApp')) return discarded('inconclusive', evidence, now, placeId);
  try {
    if (!await dependencies.checkWhatsApp(phone)) return discarded('no_whatsapp', evidence, now, placeId);
  } catch (error) {
    return discarded('inconclusive', { ...evidence, failed_step: 'whatsapp', error: safeError(error) }, now, placeId);
  }

  const activity = latestActivity(candidate);
  if (!activity || now.getTime() - activity.getTime() > activityMaxDays * 86400000) {
    return discarded('inactive', { ...evidence, latest_activity_at: activity?.toISOString() || null }, now, placeId);
  }
  evidence.latest_activity_at = activity.toISOString();

  if (candidate.hasPublicMenuPhoto === true || directMenuUrl(candidate.websiteUri || candidate.website_uri)) {
    return discarded('online_menu', { ...evidence, menu_source: candidate.hasPublicMenuPhoto ? 'google_menu_photo' : candidate.websiteUri || candidate.website_uri }, now, placeId);
  }

  if (!requiredFunction(dependencies.searchMenu, 'searchMenu')) return discarded('inconclusive', evidence, now, placeId);
  let menuResults;
  try {
    menuResults = await dependencies.searchMenu({
      businessName,
      city: clean(candidate.city),
      state: clean(candidate.state),
      phone,
      placeId
    });
  } catch (error) {
    return discarded('inconclusive', { ...evidence, failed_step: 'menu_search', error: safeError(error) }, now, placeId);
  }
  const menuMatch = (Array.isArray(menuResults) ? menuResults : []).find(isOnlineMenuResult);
  if (menuMatch) return discarded('online_menu', { ...evidence, menu_source: clean(menuMatch.url), menu_title: clean(menuMatch.title) }, now, placeId);

  if (!requiredFunction(dependencies.validatePhoto, 'validatePhoto')) return discarded('inconclusive', evidence, now, placeId);
  const photos = [];
  try {
    for (const photo of Array.isArray(candidate.photos) ? candidate.photos : []) {
      const validation = await dependencies.validatePhoto(photo, { candidate });
      if (validation?.hasMenuText) return discarded('online_menu', { ...evidence, menu_source: 'google_menu_photo' }, now, placeId);
      if (validation?.usable && validation.kind === 'food') photos.push({ ...photo, validation });
      if (photos.length === 2) break;
    }
  } catch (error) {
    return discarded('inconclusive', { ...evidence, failed_step: 'photo_validation', error: safeError(error) }, now, placeId);
  }
  evidence.usable_photos = photos.length;
  evidence.preview_source = photos.length ? 'business_photos' : 'segment_inferred';

  return {
    qualified: true,
    stage: 'photos_ready',
    code: null,
    evidence: { ...evidence, menu_search_results: menuResults.length },
    photos,
    leadPatch: {
      business_name: businessName,
      phone,
      normalized_phone: phone,
      city: clean(candidate.city),
      state: clean(candidate.state).toUpperCase(),
      segment: clean(candidate.segment || candidate.primaryType),
      source: 'google_outreach',
      google_place_id: placeId,
      last_validated_at: now.toISOString(),
      discard_code: null,
      discard_details: {},
      stage: 'photos_ready'
    }
  };
}

export function isOnlineMenuResult(result = {}) {
  const url = clean(result.url || result.link);
  const text = `${clean(result.title)} ${clean(result.snippet || result.description)}`;
  if (!url && !text) return false;
  try {
    const parsed = new URL(url);
    if (ONLINE_MENU_HOSTS.test(parsed.hostname)) return true;
    if (/\.pdf$/i.test(parsed.pathname) || MENU_PATH.test(`${parsed.pathname}${parsed.search}${parsed.hash}`)) return true;
  } catch {
    if (/\.pdf(?:$|[?#])/i.test(url) || MENU_PATH.test(url)) return true;
  }
  return MENU_TEXT.test(text) && /\b(pre[çc]o|r\$|pedido|produto|item|comprar|escolha)\b/i.test(text);
}

function directMenuUrl(value) {
  const url = clean(value);
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ONLINE_MENU_HOSTS.test(parsed.hostname) || /\.pdf$/i.test(parsed.pathname) || MENU_PATH.test(`${parsed.pathname}${parsed.search}${parsed.hash}`);
  } catch {
    return MENU_PATH.test(url) || /\.pdf(?:$|[?#])/i.test(url);
  }
}

function latestActivity(candidate) {
  const values = [candidate.lastActivityAt, candidate.recentPostAt, candidate.recent_post_at];
  for (const review of Array.isArray(candidate.reviews) ? candidate.reviews : []) values.push(review.publishTime || review.relativePublishTimeDescription);
  return values.map(validDate).filter(Boolean).sort((a, b) => b - a)[0] || null;
}

function discarded(code, evidence, now, placeId) {
  return {
    qualified: false,
    stage: 'discarded',
    code,
    evidence,
    photos: [],
    leadPatch: {
      google_place_id: placeId || null,
      discard_code: code,
      discard_details: evidence,
      last_validated_at: now.toISOString(),
      stage: 'discarded'
    }
  };
}

function requiredFunction(value) { return typeof value === 'function'; }
function validDate(value) { const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
function positiveDays(value, fallback) { const days = Number(value); return Number.isFinite(days) && days > 0 ? days : fallback; }
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function safeError(error) { return clean(error?.message || 'Falha não identificada.').slice(0, 180); }
