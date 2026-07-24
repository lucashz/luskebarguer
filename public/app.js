const state = {
  store: null,
  customer: null,
  categories: [],
  cart: loadCart(),
  query: '',
  activeCategory: 'all',
  customerChecked: false,
  isDemoMode: window.location.pathname === '/cardapio',
  savedAddressApplied: false,
  customizingItem: null,
  editingCartKey: null,
  closedStoreNoticeKey: null,
  orderSubmitting: false,
  paymentCheckout: null,
  paymentPollTimer: null,
  paymentPopup: null,
  favorites: loadFavorites(),
  coupon: null,
  diningTable: null,
  customerTab: null,
  customerTabs: []
};

const BOOTSTRAP_CACHE_KEY = 'cardapio_bootstrap_cache_v1';
const ACCOUNT_CACHE_KEY = 'customer_account_cache_v1';
const FAVORITES_KEY = 'customer_favorites_v1';
const THEME_DEFAULTS = {
  primaryColor: '#d71920',
  secondaryColor: '#1f1f1f',
  backgroundColor: '#f5f5f4',
  buttonColor: '#d71920',
  buttonTextColor: '#ffffff',
  selectionColor: '#d71920',
  selectionTextColor: '#ffffff'
};

const els = {
  storeNotFound: document.querySelector('#storeNotFound'),
  storeNotFoundMessage: document.querySelector('#storeNotFoundMessage'),
  storeCover: document.querySelector('#storeCover'),
  storeLogo: document.querySelector('#storeLogo'),
  storeStatus: document.querySelector('#storeStatus'),
  storeName: document.querySelector('#storeName'),
  storeDescription: document.querySelector('#storeDescription'),
  deliveryMeta: document.querySelector('#deliveryMeta'),
  minimumMeta: document.querySelector('#minimumMeta'),
  status: document.querySelector('#status'),
  menu: document.querySelector('#menu'),
  featured: document.querySelector('#featured'),
  favoritesStrip: document.querySelector('#favoritesStrip'),
  categoryNav: document.querySelector('#categoryNav'),
  searchInput: document.querySelector('#searchInput'),
  searchSuggestions: document.querySelector('#searchSuggestions'),
  customerOrdersLink: document.querySelector('#customerOrdersLink'),
  customerAccountLink: document.querySelector('#customerAccountLink'),
  customerLoginLink: document.querySelector('#customerLoginLink'),
  customerCreateAccountLink: document.querySelector('#customerCreateAccountLink'),
  customerLogoutButton: document.querySelector('#customerLogoutButton'),
  refreshButton: document.querySelector('#refreshButton'),
  checkoutButton: document.querySelector('#checkoutButton'),
  mobileBagButton: document.querySelector('#mobileBagButton'),
  mobileBagCount: document.querySelector('#mobileBagCount'),
  mobileBagTotal: document.querySelector('#mobileBagTotal'),
  clearCartButton: document.querySelector('#clearCartButton'),
  cartItems: document.querySelector('#cartItems'),
  cartSuggestions: document.querySelector('#cartSuggestions'),
  cartSubtotal: document.querySelector('#cartSubtotal'),
  cartDelivery: document.querySelector('#cartDelivery'),
  cartTotal: document.querySelector('#cartTotal'),
  checkoutDialog: document.querySelector('#checkoutDialog'),
  checkoutForm: document.querySelector('#checkoutForm'),
  checkoutReviewItems: document.querySelector('#checkoutReviewItems'),
  checkoutReviewSubtotal: document.querySelector('#checkoutReviewSubtotal'),
  checkoutReviewDelivery: document.querySelector('#checkoutReviewDelivery'),
  checkoutDiscountRow: document.querySelector('#checkoutDiscountRow'),
  checkoutReviewDiscount: document.querySelector('#checkoutReviewDiscount'),
  checkoutReviewTotal: document.querySelector('#checkoutReviewTotal'),
  checkoutConfirmSnapshot: document.querySelector('#checkoutConfirmSnapshot'),
  cancelCheckoutButton: document.querySelector('#cancelCheckoutButton'),
  confirmOrderButton: document.querySelector('#confirmOrderButton'),
  checkoutCustomerFieldset: document.querySelector('#checkoutCustomerFieldset'),
  checkoutCustomerSummary: document.querySelector('#checkoutCustomerSummary'),
  checkoutCustomerName: document.querySelector('#checkoutCustomerName'),
  checkoutCustomerPhone: document.querySelector('#checkoutCustomerPhone'),
  deliveryFeeHint: document.querySelector('#deliveryFeeHint'),
  checkoutFulfillmentFieldset: document.querySelector('#checkoutFulfillmentFieldset'),
  checkoutFulfillmentLegend: document.querySelector('#checkoutFulfillmentLegend'),
  fulfillmentMethodSelector: document.querySelector('#fulfillmentMethodSelector'),
  tableContext: document.querySelector('#tableContext'),
  paymentMethod: document.querySelector('#paymentMethod'),
  cashChangeField: document.querySelector('#cashChangeField'),
  couponCode: document.querySelector('#couponCode'),
  applyCouponButton: document.querySelector('#applyCouponButton'),
  couponFeedback: document.querySelector('#couponFeedback'),
  checkoutSuggestions: document.querySelector('#checkoutSuggestions'),
  accountPrefill: document.querySelector('#accountPrefill'),
  accountPrefillTitle: document.querySelector('#accountPrefillTitle'),
  accountPrefillText: document.querySelector('#accountPrefillText'),
  savedAddressSelect: document.querySelector('#savedAddressSelect'),
  editAddressButton: document.querySelector('#editAddressButton'),
  deleteSavedAddressButton: document.querySelector('#deleteSavedAddressButton'),
  productDialog: document.querySelector('#productDialog'),
  productForm: document.querySelector('#productForm'),
  productDialogTitle: document.querySelector('#productDialogTitle'),
  productDialogMedia: document.querySelector('#productDialogMedia'),
  productDialogDescription: document.querySelector('#productDialogDescription'),
  productModifierGroups: document.querySelector('#productModifierGroups'),
  productChoiceSummary: document.querySelector('#productChoiceSummary'),
  productDialogTotal: document.querySelector('#productDialogTotal'),
  productQuantity: document.querySelector('#productQuantity'),
  productQuantityMinus: document.querySelector('#productQuantityMinus'),
  productQuantityPlus: document.querySelector('#productQuantityPlus'),
  closedStoreDialog: document.querySelector('#closedStoreDialog'),
  closedStoreTitle: document.querySelector('#closedStoreTitle'),
  closedStoreText: document.querySelector('#closedStoreText'),
  closedStoreRefreshButton: document.querySelector('#closedStoreRefreshButton'),
  demoOrderDialog: document.querySelector('#demoOrderDialog'),
  demoOrderCode: document.querySelector('#demoOrderCode'),
  paymentCheckoutDialog: document.querySelector('#paymentCheckoutDialog'),
  paymentCheckoutStatus: document.querySelector('#paymentCheckoutStatus'),
  paymentCheckoutCode: document.querySelector('#paymentCheckoutCode'),
  paymentCheckoutTotal: document.querySelector('#paymentCheckoutTotal'),
  paymentCheckoutExpires: document.querySelector('#paymentCheckoutExpires'),
  paymentOpenButton: document.querySelector('#paymentOpenButton'),
  paymentCheckButton: document.querySelector('#paymentCheckButton'),
  paymentCancelButton: document.querySelector('#paymentCancelButton')
};

document.querySelector('#demoNotice')?.toggleAttribute('hidden', !state.isDemoMode);
document.body.classList.toggle('demo-mode', state.isDemoMode);

els.searchInput?.addEventListener('input', () => {
  state.query = els.searchInput.value.trim().toLowerCase();
  renderMenu();
});

els.refreshButton?.addEventListener('click', loadBootstrap);
els.customerLogoutButton?.addEventListener('click', logoutCustomer);
els.checkoutButton?.addEventListener('click', openCheckout);
els.mobileBagButton?.addEventListener('click', openCheckout);
els.featured?.addEventListener('wheel', scrollFeaturedWithWheel, { passive: false });
els.clearCartButton?.addEventListener('click', () => {
  state.cart = [];
  state.coupon = null;
  persistCart();
  renderCart();
});
els.applyCouponButton?.addEventListener('click', applyCoupon);

els.checkoutForm?.addEventListener('change', (event) => {
  if (event.target.name === 'fulfillment_method') {
    state.coupon = null;
    clearCouponFeedback();
    updateCheckoutDeliveryFields();
    renderCheckoutCustomerSection();
    renderCart();
    renderCheckoutReview();
  }
  if (['payment_method', 'street', 'number', 'neighborhood', 'city', 'postal_code', 'coupon_code', 'change_for'].includes(event.target.name)) {
    updatePaymentDetailsVisibility();
    renderCheckoutReview();
  }
});
els.checkoutForm?.addEventListener('input', (event) => {
  if (event.target.name === 'postal_code') {
    event.target.value = formatCep(event.target.value);
  }
  if (['street', 'number', 'neighborhood', 'city', 'postal_code', 'change_for'].includes(event.target.name)) {
    renderCheckoutReview();
  }
});
els.checkoutForm?.elements?.phone?.addEventListener('input', (event) => {
  event.target.value = formatPhone(event.target.value);
});

els.checkoutForm?.addEventListener('submit', submitOrder);
els.cancelCheckoutButton?.addEventListener('click', () => els.checkoutDialog?.close());
els.paymentOpenButton?.addEventListener('click', () => openPaymentPopup());
els.paymentCheckButton?.addEventListener('click', () => checkPaymentStatus({ manual: true }));
els.paymentCancelButton?.addEventListener('click', closePaymentCheckoutDialog);
els.paymentCheckoutDialog?.addEventListener('close', () => {
  if (state.paymentCheckout?.status !== 'paid') stopPaymentPolling();
});
window.addEventListener('message', handlePaymentWindowMessage);
els.productForm?.addEventListener('change', renderProductDialogTotal);
els.productForm?.addEventListener('input', renderProductDialogTotal);
els.productForm?.addEventListener('submit', submitProductCustomization);
els.productQuantityMinus?.addEventListener('click', () => changeProductDialogQuantity(-1));
els.productQuantityPlus?.addEventListener('click', () => changeProductDialogQuantity(1));
els.closedStoreRefreshButton?.addEventListener('click', () => {
  els.closedStoreDialog?.close();
  loadBootstrap();
});
configureStoreLinks();
els.savedAddressSelect?.addEventListener('change', () => {
  const address = selectedSavedAddress();
  applySavedCustomerAddress(address, { force: true });
  state.savedAddressApplied = true;
  renderAddressPrefillSummary(address, customerAddresses().length);
});
els.editAddressButton?.addEventListener('click', () => {
  clearAddressFields();
  state.savedAddressApplied = false;
  if (els.savedAddressSelect) els.savedAddressSelect.hidden = true;
  if (els.deleteSavedAddressButton) els.deleteSavedAddressButton.hidden = true;
  updatePrefillNotice('Informe outro endereço. Depois de enviar o pedido, ele ficará salvo na sua conta.');
  els.checkoutForm?.elements?.street?.focus();
});
els.deleteSavedAddressButton?.addEventListener('click', deleteSelectedSavedAddress);

renderCachedCustomer();
renderCheckoutCustomerSection();
renderCachedBootstrap();
resolveTableFromUrl().catch(() => {});
loadLoggedCustomer().catch(() => {});
loadBootstrap();
renderCart();

async function resolveTableFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('mesa') || params.get('table');
  if (!code) return;
  const data = await request(`/api/tables/resolve?table=${encodeURIComponent(code)}`);
  state.diningTable = data.table || null;
  state.customerTabs = Array.isArray(data.table?.open_tabs) ? data.table.open_tabs : [];
  state.customerTab = data.table?.open_tab || state.customerTabs[0] || null;
  updateDineInModes({ preferTableContext: true });
  renderTableContext();
  renderStore();
  renderCart();
}

async function loadBootstrap() {
  setStatus(state.categories.length ? 'Atualizando cardápio...' : 'Carregando cardápio...');
  try {
    const data = await request('/api/bootstrap');
    hideStoreNotFound();
    state.store = data.store || null;
    state.categories = data.categories || [];
    if (state.isDemoMode) applyDemoStoreHints();
    applyStoreTheme(state.store?.theme_settings);
    applyStoreIdentity(state.store);
    saveCachedBootstrap(data);
    render();
    setStatus(isStoreClosed() ? closedStoreMessage() : `${countItems(state.categories)} produtos disponiveis`);
    loadLoggedCustomer().catch(() => {});
  } catch (error) {
    if (isStoreNotFoundError(error)) {
      showStoreNotFound(error.message);
      return;
    }
    setStatus(state.categories.length ? `${countItems(state.categories)} produtos disponiveis` : error.message);
    if (!state.categories.length) renderEmptyState();
  }
}

function renderCachedBootstrap() {
  const cached = loadCachedBootstrap();
  if (!cached) return;
  state.store = cached.store || null;
  state.categories = cached.categories || [];
  if (state.isDemoMode) applyDemoStoreHints();
  applyStoreTheme(state.store?.theme_settings);
  applyStoreIdentity(state.store);
  render();
  setStatus(isStoreClosed() ? closedStoreMessage() : `${countItems(state.categories)} produtos disponiveis`);
}

function renderCachedCustomer() {
  const cached = loadAccountCache();
  if (!cached?.customer) return;
  state.customer = cached.customer;
  state.customerChecked = true;
  renderCustomerActions();
  renderCheckoutCustomerSection();
}

function render() {
  renderStore();
  renderCustomerActions();
  renderNav();
  renderSearchSuggestions();
  renderFavoritesStrip();
  renderFeatured();
  renderMenu();
  renderPaymentOptions();
  renderCart();
}

function renderStore() {
  const store = state.store || {};
  const name = store.name || 'TáPronto';
  els.storeName.textContent = name;
  els.storeLogo.textContent = '';
  els.storeLogo.style.backgroundImage = '';
  els.storeCover.style.backgroundImage = '';
  els.storeDescription.textContent = store.description || 'Escolha seus itens e envie o pedido pelo WhatsApp da loja.';
  els.storeStatus.textContent = !isStorePublished() ? 'Em configuração' : store.is_open === false ? 'Fechado agora' : 'Aberto agora';
  els.storeStatus.classList.toggle('closed', isStoreClosed());
  els.deliveryMeta.textContent = store.accepts_delivery === false ? 'Somente retirada' : `Entrega ${money(store.delivery_fee || 0)}`;
  els.minimumMeta.textContent = `Mínimo ${money(store.minimum_order || 0)}`;
  if (state.diningTable) {
    els.deliveryMeta.textContent = `Mesa: ${state.diningTable.name}`;
    els.minimumMeta.textContent = state.customerTab ? `Comanda: ${state.customerTab.name}` : 'Pedido entregue na mesa';
  }

  if (store.cover_url) {
    els.storeCover.style.backgroundImage = cssImageUrl(store.cover_url);
  }

  if (store.logo_url) {
    els.storeLogo.style.backgroundImage = cssImageUrl(store.logo_url);
  }

  handleStoreClosedState();
}

function renderTableContext() {
  if (!els.tableContext) return;
  const method = new FormData(els.checkoutForm).get('fulfillment_method') || 'delivery';
  const show = ['table', 'tab'].includes(method) && state.diningTable;
  els.tableContext.hidden = !show;
  if (!show) {
    els.tableContext.innerHTML = '';
    return;
  }
  const openTabs = state.customerTabs || [];
  const selectedTabId = state.customerTab?.id || '';
  const tabPicker = method === 'tab' && openTabs.length > 1
    ? `
      <label class="table-tab-picker">
        Escolha a comanda
        <select data-table-tab-select>
          ${openTabs.map((tab) => `
            <option value="${escapeAttribute(tab.id)}" ${tab.id === selectedTabId ? 'selected' : ''}>
              ${escapeHtml(tab.name)}${tab.customer_name ? ` - ${escapeHtml(tab.customer_name)}` : ''}
            </option>
          `).join('')}
        </select>
      </label>
    `
    : '';
  els.tableContext.innerHTML = `
    <strong>${method === 'tab' ? 'Comanda' : 'Mesa'}: ${escapeHtml(state.diningTable.name)}</strong>
    <p>${method === 'tab' && state.customerTab ? `Pedido in loco para ${escapeHtml(state.customerTab.name)}. Total atual: ${money(state.customerTab.current_total || 0)}.` : 'Pedido in loco identificado pelo QR Code. A equipe entregará os itens nesta mesa.'}</p>
    ${tabPicker}
  `;
  els.tableContext.querySelector('[data-table-tab-select]')?.addEventListener('change', (event) => {
    state.customerTab = openTabs.find((tab) => tab.id === event.target.value) || null;
    renderTableContext();
    renderCheckoutReview();
  });
}

function updateDineInModes(options = {}) {
  if (!els.checkoutForm) return;
  const tableRadio = els.checkoutForm.querySelector('input[name="fulfillment_method"][value="table"]');
  const tabRadio = els.checkoutForm.querySelector('input[name="fulfillment_method"][value="tab"]');
  const deliveryRadio = els.checkoutForm.querySelector('input[name="fulfillment_method"][value="delivery"]');
  if (tableRadio) {
    tableRadio.disabled = !state.diningTable;
    tableRadio.closest('label')?.classList.toggle('disabled-option', tableRadio.disabled);
    tableRadio.closest('label')?.setAttribute('title', tableRadio.disabled ? 'Acesse pelo QR Code da mesa.' : 'Pedido entregue nesta mesa.');
  }
  const openTabs = state.customerTabs || [];
  if (tabRadio) {
    tabRadio.disabled = !openTabs.length;
    tabRadio.closest('label')?.classList.toggle('disabled-option', tabRadio.disabled);
    tabRadio.closest('label')?.setAttribute('title', tabRadio.disabled ? 'Abra uma comanda para esta mesa no admin.' : 'Pedido adicionado à comanda aberta.');
  }
  if (!options.preferTableContext) return;
  const target = openTabs.length ? tabRadio : state.diningTable ? tableRadio : null;
  if (target) {
    target.checked = true;
  } else if ((tableRadio?.checked || tabRadio?.checked) && deliveryRadio) {
    deliveryRadio.checked = true;
  }
  renderDineInCheckoutMode();
}

function renderDineInCheckoutMode() {
  const method = new FormData(els.checkoutForm).get('fulfillment_method') || 'delivery';
  const isTableQr = Boolean(state.diningTable);
  els.checkoutFulfillmentFieldset?.classList.toggle('table-qr-checkout', isTableQr);
  if (els.fulfillmentMethodSelector) els.fulfillmentMethodSelector.hidden = isTableQr;
  if (els.checkoutFulfillmentLegend) {
    els.checkoutFulfillmentLegend.textContent = isTableQr
      ? 'Mesa identificada'
      : method === 'delivery'
        ? 'Entrega'
        : 'Como será o pedido';
  }
}

function applyStoreTheme(theme = {}) {
  const settings = { ...THEME_DEFAULTS, ...(theme || {}) };
  const variables = {
    primaryColor: '--color-primary',
    secondaryColor: '--color-secondary',
    backgroundColor: '--color-background',
    buttonColor: '--color-button',
    buttonTextColor: '--color-button-text',
    selectionColor: '--color-selection',
    selectionTextColor: '--color-selection-text'
  };
  Object.entries(variables).forEach(([key, variable]) => {
    document.documentElement.style.setProperty(variable, validThemeColor(settings[key]) ? settings[key] : THEME_DEFAULTS[key]);
  });
}

function applyStoreIdentity(store = {}) {
  const title = String(store.page_title || store.name || 'TáPronto').trim();
  document.title = title;
  applyFavicon(store.favicon_url);
}

function applyFavicon(url) {
  const safeUrl = safeImageUrl(url);
  if (!safeUrl) return;
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = safeUrl;
}

function validThemeColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || '').trim());
}

function renderNav() {
  const buttons = [
    navButton('all', 'Todos'),
    navButton('favorites', `Favoritos ${state.favorites.size ? `(${state.favorites.size})` : ''}`),
    ...state.categories.map((category) => navButton(category.id, category.name))
  ];
  els.categoryNav.replaceChildren(...buttons);
}

function navButton(id, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = state.activeCategory === id ? 'active' : '';
  button.addEventListener('click', () => {
    state.activeCategory = id;
    renderMenu();
    renderNav();
  });
  return button;
}

function renderFeatured() {
  const items = state.categories
    .flatMap((category) => category.items.map((item) => ({ ...item, categoryName: category.name })))
    .filter((item) => item.is_featured)
    .slice(0, 8);

  els.featured.hidden = items.length === 0;
  els.featured.replaceChildren(...items.map((item) => {
    const card = document.createElement('article');
    card.className = 'featured-product';
    if (isStoreClosed()) card.classList.add('disabled');
    card.innerHTML = `
      ${item.image_url ? `<img src="${escapeAttribute(item.image_url)}" alt="">` : '<div class="image-fallback"></div>'}
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${money(item.price)}</span>
      </div>
    `;
    card.addEventListener('click', () => startAddToCart(item));
    return card;
  }));
}

function renderFavoritesStrip() {
  const items = allProducts().filter((item) => state.favorites.has(item.id)).slice(0, 10);
  if (!els.favoritesStrip) return;
  els.favoritesStrip.hidden = items.length === 0;
  els.favoritesStrip.replaceChildren(...items.map((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'favorite-chip';
    button.innerHTML = `<span aria-hidden="true">&hearts;</span><strong>${escapeHtml(item.name)}</strong><small>${money(item.price)}</small>`;
    button.addEventListener('click', () => startAddToCart(item));
    return button;
  }));
}

function applyDemoStoreHints() {
  state.store = {
    ...(state.store || {}),
    is_open: true,
    demo_mode: true,
    name: state.store?.name || 'Vitrine Gourmet',
    description: state.store?.description || 'Hamburgueria artesanal de demonstração para testar o cardápio digital.',
    page_title: state.store?.page_title || 'Loja demonstração - TáPronto'
  };
}

function renderSearchSuggestions() {
  if (!els.searchSuggestions) return;
  const suggestions = [
    ...new Set(allProducts().flatMap((item) => [item.name, ...(item.tags || [])]).filter(Boolean))
  ].slice(0, 30);
  els.searchSuggestions.replaceChildren(...suggestions.map((value) => {
    const option = document.createElement('option');
    option.value = value;
    return option;
  }));
}

function scrollFeaturedWithWheel(event) {
  if (els.featured.hidden || els.featured.scrollWidth <= els.featured.clientWidth) return;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;
  event.preventDefault();
  els.featured.scrollLeft += delta;
}

function isStoreClosed() {
  return !isStorePublished() || state.store?.is_open === false;
}

function isStorePublished() {
  return state.store?.onboarding_completed === true;
}

function closedStoreMessage() {
  return isStorePublished()
    ? 'Loja fechada no momento. Pedidos pausados.'
    : 'Cardápio em configuração. Pedidos ainda não liberados.';
}

function handleStoreClosedState() {
  document.body.classList.toggle('store-closed', isStoreClosed());
  if (isStoreClosed()) {
    showClosedStoreDialog();
    return;
  }
  state.closedStoreNoticeKey = null;
  if (els.closedStoreDialog?.open) els.closedStoreDialog.close();
}

function showClosedStoreDialog(force = false) {
  if (!els.closedStoreDialog) return;
  const store = state.store || {};
  const noticeKey = store.updated_at || store.id || 'closed';
  if (!force && state.closedStoreNoticeKey === noticeKey) return;
  state.closedStoreNoticeKey = noticeKey;
  if (!isStorePublished()) {
    els.closedStoreTitle.textContent = `${store.name || 'Este cardápio'} ainda está em configuração.`;
    els.closedStoreText.textContent = 'A loja ainda não publicou o cardápio. Você pode visualizar os produtos, mas pedidos não estão liberados.';
    if (!els.closedStoreDialog.open) els.closedStoreDialog.showModal();
    return;
  }
  els.closedStoreTitle.textContent = `${store.name || 'A loja'} está fechada agora.`;
  const nextOpen = nextOpenText(store.business_hours);
  els.closedStoreText.textContent = nextOpen
    ? `Você pode montar sua sacola para conferir depois. Próxima abertura: ${nextOpen}.`
    : 'Você pode montar sua sacola para conferir depois, mas novos pedidos estão pausados até a loja iniciar a operação.';
  if (!els.closedStoreDialog.open) els.closedStoreDialog.showModal();
}

function nextOpenText(hours = {}) {
  const keys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const labels = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const now = new Date();
  for (let offset = 0; offset < 7; offset += 1) {
    const index = (now.getDay() + offset) % 7;
    const day = hours?.[keys[index]];
    if (!day || day.closed || !day.open) continue;
    const prefix = offset === 0 ? 'hoje' : offset === 1 ? 'amanhã' : labels[index];
    return `${prefix} às ${day.open}`;
  }
  return '';
}

function renderMenu() {
  const sections = visibleCategories().map((category) => {
    const items = category.items.filter(matchesQuery);
    const section = document.createElement('section');
    section.className = 'product-section';
    section.innerHTML = `
      <div class="section-title">
        <h2>${escapeHtml(category.name)}</h2>
        <p>${escapeHtml(category.description || '')}</p>
      </div>
    `;

    const list = document.createElement('div');
    list.className = 'product-list';
    list.replaceChildren(...items.map(productRow));
    section.append(list);
    return section;
  }).filter((section) => section.querySelectorAll('.product-row').length > 0 || !state.query);

  els.menu.replaceChildren(...sections);
}

function productRow(item) {
  const row = document.createElement('article');
  row.className = 'product-row';
  const storeClosed = isStoreClosed();
  const isFavorite = state.favorites.has(item.id);
  row.innerHTML = `
    <div class="product-info">
      <h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.description || '')}</p>
      <strong>${money(item.price)}</strong>
      <div class="tags">${(item.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
    </div>
    <button class="favorite-button ${isFavorite ? 'active' : ''}" type="button" aria-pressed="${isFavorite ? 'true' : 'false'}" aria-label="${isFavorite ? 'Remover dos favoritos' : 'Favoritar'} ${escapeAttribute(item.name)}">${favoriteIcon(isFavorite)}</button>
    <button class="add-product" type="button" aria-label="Adicionar ${escapeAttribute(item.name)}" ${storeClosed ? 'disabled' : ''}>
      ${item.image_url ? `<img src="${escapeAttribute(item.image_url)}" alt="">` : '<span>+</span>'}
      <b>${storeClosed ? 'Fechado' : '+'}</b>
    </button>
  `;
  row.querySelector('.favorite-button').addEventListener('click', (event) => {
    event.stopPropagation();
    toggleFavorite(item.id);
  });
  row.querySelector('.add-product').addEventListener('click', () => startAddToCart(item));
  return row;
}

function favoriteIcon(active) {
  return active ? '&hearts;' : '&#9825;';
}

function toggleFavorite(itemId) {
  const item = allProducts().find((product) => product.id === itemId);
  if (state.favorites.has(itemId)) {
    state.favorites.delete(itemId);
    setStatus(item ? `${item.name} removido dos favoritos.` : 'Produto removido dos favoritos.');
  } else {
    state.favorites.add(itemId);
    setStatus(item ? `${item.name} salvo nos favoritos.` : 'Produto salvo nos favoritos.');
  }
  if (!persistFavorites()) {
    setStatus('Favorito atualizado nesta sessão. Seu navegador bloqueou o salvamento permanente.');
  }
  renderNav();
  renderFavoritesStrip();
  renderMenu();
}

function renderCart() {
  if (state.cart.length === 0) {
    els.cartItems.innerHTML = '<p class="muted">Sua sacola está vazia.</p>';
  } else {
    els.cartItems.replaceChildren(...state.cart.map(cartRow));
  }

  const totals = cartTotals();
  const quantity = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  els.cartSubtotal.textContent = money(totals.subtotal);
  els.cartDelivery.textContent = money(totals.deliveryFee);
  els.cartTotal.textContent = money(totals.total);
  els.mobileBagCount.textContent = `${quantity} ${quantity === 1 ? 'item' : 'itens'}`;
  els.mobileBagTotal.textContent = money(totals.total);
  els.mobileBagButton.classList.toggle('visible', quantity > 0);
  els.checkoutButton.disabled = quantity === 0 || isStoreClosed();
  els.mobileBagButton.disabled = isStoreClosed();
  renderCartSuggestions();
  renderCheckoutReview();
}

function renderCartSuggestions() {
  const suggestions = cartSuggestions();
  renderSuggestionBox(els.cartSuggestions, suggestions, suggestionTitle(suggestions, 'Combine com seu pedido'));
  renderSuggestionBox(els.checkoutSuggestions, suggestions, 'Que tal adicionar também?');
}

function renderSuggestionBox(container, suggestions, title) {
  if (!container) return;
  container.hidden = suggestions.length === 0;
  if (!suggestions.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <div class="cart-suggestions-head">
      <strong>${escapeHtml(title)}</strong>
    </div>
    <div class="cart-suggestion-list">
      ${suggestions.map((item) => `
        <button type="button" data-suggest-item="${escapeAttribute(item.id)}">
          <span class="cart-suggestion-copy">
            <strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(item.suggestion_reason || 'Boa pedida para completar')}</small>
            <em>${money(item.price)}</em>
          </span>
          <b>Adicionar</b>
        </button>
      `).join('')}
    </div>
  `;
  container.querySelectorAll('[data-suggest-item]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = findProductById(button.dataset.suggestItem);
      if (item) startAddToCart(item);
    });
  });
}

function cartSuggestions() {
  if (!state.cart.length || isStoreClosed()) return [];
  const cartIds = new Set(state.cart.map((item) => String(item.id)));
  const cartCategories = new Set(state.cart.map((item) => productCategoryId(item.id)).filter(Boolean));
  const cartProfile = cartFlavorProfile(state.cart);
  return allAvailableProducts()
    .filter((item) => !cartIds.has(String(item.id)))
    .map((item) => decorateSuggestion(item, cartProfile, cartCategories))
    .sort((a, b) => b.suggestion_score - a.suggestion_score || a.suggestion_bucket.localeCompare(b.suggestion_bucket) || Number(a.price || 0) - Number(b.price || 0))
    .filter(uniqueSuggestionBucket())
    .slice(0, 3);
}

function decorateSuggestion(item, cartProfile, cartCategories) {
  const kind = productKind(item);
  const sameCategory = cartCategories.has(productCategoryId(item.id));
  const average = cartAveragePrice();
  let score = item.is_featured ? 4 : 0;
  let reason = 'Boa pedida para completar';
  let bucket = kind;

  if (cartProfile.hasMain && kind === 'drink') {
    score += 9;
    reason = 'Bebida para acompanhar';
    bucket = 'drink';
  } else if (cartProfile.hasMain && kind === 'side') {
    score += 8;
    reason = 'Acompanhamento que combina';
    bucket = 'side';
  } else if (cartProfile.hasSavory && kind === 'dessert') {
    score += 7;
    reason = 'Para fechar com doce';
    bucket = 'dessert';
  } else if (cartProfile.hasDrink && ['burger', 'pizza', 'main', 'snack'].includes(kind)) {
    score += 6;
    reason = 'Vai bem com a bebida';
    bucket = 'main-after-drink';
  } else if (sameCategory) {
    score += 4;
    reason = 'Da mesma seção que você escolheu';
    bucket = `same-${productCategoryId(item.id)}`;
  }

  if (Number(item.price || 0) <= average) score += 2;
  if (hasAnyText(item, ['combo', 'duplo', 'familia', 'família', 'promocao', 'promoção'])) {
    score += 2;
    reason = 'Oferta boa para aumentar o pedido';
  }
  if (hasAnyText(item, ['mais vendido', 'favorito', 'especial', 'chef'])) {
    score += 2;
    reason = 'Favorito da casa';
  }

  return {
    ...item,
    suggestion_score: score,
    suggestion_reason: reason,
    suggestion_bucket: bucket
  };
}

function uniqueSuggestionBucket() {
  const used = new Set();
  return (item) => {
    const bucket = item.suggestion_bucket || 'general';
    if (used.has(bucket)) return false;
    used.add(bucket);
    return true;
  };
}

function suggestionTitle(suggestions, fallback) {
  const reasons = new Set(suggestions.map((item) => item.suggestion_reason));
  if (reasons.has('Bebida para acompanhar')) return 'Seu pedido pede uma bebida';
  if (reasons.has('Acompanhamento que combina')) return 'Complete a experiência';
  if (reasons.has('Para fechar com doce')) return 'Finalize com algo doce';
  return fallback;
}

function suggestionSubtitle(suggestions) {
  const labels = suggestions.map((item) => item.suggestion_reason).filter(Boolean);
  return labels.length ? labels.slice(0, 2).join(' + ') : 'Escolhas rápidas';
}

function cartFlavorProfile(items) {
  const kinds = new Set(items.map(productKind));
  return {
    hasMain: [...kinds].some((kind) => ['burger', 'pizza', 'main', 'snack'].includes(kind)),
    hasSavory: [...kinds].some((kind) => !['drink', 'dessert'].includes(kind)),
    hasDrink: kinds.has('drink')
  };
}

function productKind(item) {
  const explicitType = productTypeFromTags(item.tags || []);
  if (explicitType) return explicitType;
  const text = suggestionSearchText(item);
  if (/(bebida|refrigerante|refri|suco|limonada|agua|água|cha|chá|drink|coca|guarana|guaraná|pink lemonade)/i.test(text)) return 'drink';
  if (/(sobremesa|doce|brownie|pudim|sorvete|milk.?shake|cookie|bolo|torta|acai|açaí)/i.test(text)) return 'dessert';
  if (/(batata|frita|porcao|porção|onion|anel|mandioca|nugget|bacon jam|molho|maionese|extra)/i.test(text)) return 'side';
  if (/(hamb[uú]rguer|burger|smash|x-|lanche|sanduiche|sanduíche|hot dog)/i.test(text)) return 'burger';
  if (/(pizza|esfiha|calzone)/i.test(text)) return 'pizza';
  if (/(combo|prato|marmita|executivo)/i.test(text)) return 'main';
  return 'snack';
}

function productTypeFromTags(tags = []) {
  const type = (tags || [])
    .map((tag) => String(tag || '').trim().toLowerCase())
    .find((tag) => tag.startsWith('tipo:'))
    ?.replace('tipo:', '');
  return ['burger', 'pizza', 'main', 'side', 'drink', 'dessert'].includes(type) ? type : '';
}

function hasAnyText(item, terms = []) {
  const text = suggestionSearchText(item);
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function suggestionSearchText(item) {
  return [
    item.name,
    item.description,
    productCategoryName(item.id),
    ...(item.tags || [])
  ].filter(Boolean).join(' ').toLowerCase();
}

function allAvailableProducts() {
  return state.categories.flatMap((category) => (category.items || [])
    .filter((item) => item.is_active !== false && item.is_available !== false));
}

function productCategoryId(itemId) {
  const category = state.categories.find((entry) => (entry.items || []).some((item) => String(item.id) === String(itemId)));
  return category?.id || null;
}

function productCategoryName(itemId) {
  const category = state.categories.find((entry) => (entry.items || []).some((item) => String(item.id) === String(itemId)));
  return category?.name || '';
}

function cartAveragePrice() {
  const items = state.cart.filter((item) => Number(item.price || 0) > 0);
  if (!items.length) return Number.POSITIVE_INFINITY;
  return items.reduce((sum, item) => sum + Number(item.price || 0), 0) / items.length;
}

function cartRow(item) {
  const row = document.createElement('div');
  row.className = 'bag-row';
  row.innerHTML = `
    <div>
      <strong>${escapeHtml(item.name)}</strong>
      <p>${money(item.price)} cada${item.modifiers?.length ? ` - ${item.modifiers.map(modifierText).map(escapeHtml).join(', ')}` : ''}</p>
      ${item.notes ? `<p>Obs: ${escapeHtml(item.notes)}</p>` : ''}
    </div>
    <div class="qty">
      <button type="button" aria-label="Diminuir">-</button>
      <span>${item.quantity}</span>
      <button type="button" aria-label="Aumentar">+</button>
    </div>
  `;
  const [minus, plus] = row.querySelectorAll('button');
  minus.addEventListener('click', () => changeCartQuantity(item.key, -1));
  plus.addEventListener('click', () => changeCartQuantity(item.key, 1));
  return row;
}

function startAddToCart(item) {
  if (isStoreClosed()) {
    showClosedStoreDialog(true);
    return;
  }
  openProductDialog(item);
}

function addToCart(item) {
  state.coupon = null;
  clearCouponFeedback();
  const key = item.key || cartItemKey(item.id, item.modifier_ids || [], item.notes || '');
  const existing = state.cart.find((entry) => entry.key === key);
  if (existing) {
    existing.quantity += Number(item.quantity || 1);
  } else {
    state.cart.push({
      ...item,
      key,
      id: item.id,
      name: item.name,
      price: Number(item.price || 0),
      quantity: item.quantity || 1,
      modifier_ids: item.modifier_ids || [],
      modifiers: item.modifiers || [],
      notes: item.notes || ''
    });
  }
  persistCart();
  renderCart();
}

function changeCartQuantity(key, delta) {
  state.coupon = null;
  clearCouponFeedback();
  const item = state.cart.find((entry) => entry.key === key);
  if (!item) return;
  item.quantity += delta;
  state.cart = state.cart.filter((entry) => entry.quantity > 0);
  persistCart();
  renderCart();
}

function replaceCartItem(oldKey, item) {
  state.coupon = null;
  clearCouponFeedback();
  const nextItem = {
    ...item,
    key: cartItemKey(item.id, item.modifier_ids || [], item.notes || ''),
    price: Number(item.price || 0),
    quantity: item.quantity || 1,
    modifier_ids: item.modifier_ids || [],
    modifiers: item.modifiers || [],
    notes: item.notes || ''
  };
  state.cart = state.cart.filter((entry) => entry.key !== oldKey);
  const existing = state.cart.find((entry) => entry.key === nextItem.key);
  if (existing) {
    existing.quantity += nextItem.quantity;
  } else {
    state.cart.push(nextItem);
  }
  persistCart();
  renderCart();
  renderCheckoutReview();
}

function openProductDialog(item, options = {}) {
  state.customizingItem = item;
  state.editingCartKey = options.cartKey || null;
  els.productForm.reset();
  els.productQuantity.value = String(options.quantity || 1);
  els.productDialogTitle.textContent = item.name;
  els.productDialogDescription.textContent = item.image_url ? '' : (item.description || 'Confira o item antes de adicionar a sacola.');
  els.productDialogDescription.hidden = Boolean(item.image_url);
  renderProductDialogMedia(item);
  els.productModifierGroups.replaceChildren(...(item.modifier_groups || []).map(modifierGroupFieldset));
  if (options.modifierIds?.length) {
    const selectedIds = new Set(options.modifierIds);
    els.productForm.querySelectorAll('input[name^="modifier_"]').forEach((input) => {
      input.checked = selectedIds.has(input.value);
    });
  }
  if (options.notes) {
    els.productForm.elements.notes.value = options.notes;
  }
  els.productForm.querySelector('button.primary-button.wide').textContent = state.editingCartKey ? 'Salvar item' : 'Adicionar a sacola';
  renderProductDialogTotal();
  els.productDialog.showModal();
}

function editCartItem(key) {
  const cartItem = state.cart.find((entry) => entry.key === key);
  if (!cartItem) return;
  const product = findProductById(cartItem.id);
  if (!product) {
    setStatus('Não foi possível editar este item agora.');
    return;
  }
  openProductDialog(product, {
    cartKey: key,
    quantity: cartItem.quantity,
    modifierIds: cartItem.modifier_ids || [],
    notes: cartItem.notes || ''
  });
}

function renderProductDialogMedia(item) {
  const description = item.description || '';
  els.productDialogMedia.classList.toggle('has-image', Boolean(item.image_url));
  if (item.image_url) {
    els.productDialogMedia.innerHTML = `
      <img src="${escapeAttribute(item.image_url)}" alt="${escapeAttribute(item.name)}">
      ${description ? `<div class="product-dialog-caption">${escapeHtml(description)}</div>` : ''}
    `;
    return;
  }
  els.productDialogMedia.innerHTML = `
    <div class="product-dialog-fallback">${escapeHtml((item.name || 'P').slice(0, 1).toUpperCase())}</div>
    ${description ? `<div class="product-dialog-caption fallback-caption">${escapeHtml(description)}</div>` : ''}
  `;
}

function changeProductDialogQuantity(delta) {
  const current = Number.parseInt(els.productQuantity.value, 10) || 1;
  els.productQuantity.value = String(Math.min(99, Math.max(1, current + delta)));
  renderProductDialogTotal();
}

function modifierGroupFieldset(group) {
  const fieldset = document.createElement('fieldset');
  const type = Number(group.max_choices || 1) === 1 ? 'radio' : 'checkbox';
  const required = group.is_required || Number(group.min_choices || 0) > 0;
  const options = (group.modifiers || []).filter((modifier) => modifier.is_available !== false);
  const min = Math.max(0, Number(group.min_choices || 0));
  const max = Math.max(1, Number(group.max_choices || 1));
  fieldset.className = `modifier-group ${required ? 'is-required' : ''}`;
  fieldset.dataset.groupId = group.id;
  fieldset.dataset.minChoices = min;
  fieldset.dataset.maxChoices = max;
  fieldset.innerHTML = `
    <legend>
      <span>${required ? 'Obrigatório' : 'Opcional'}</span>
      ${escapeHtml(group.name)}
    </legend>
    <div class="modifier-group-meta">
      <p>${escapeHtml(group.description || modifierInstructionText(group))}</p>
      <strong data-modifier-counter>${required ? `0/${Math.max(1, min)}` : `0/${max}`}</strong>
      ${!required && type === 'radio' ? '<button class="modifier-clear-button" type="button" data-clear-modifier-group>Remover escolha</button>' : ''}
    </div>
    <p class="modifier-validation" data-modifier-validation hidden></p>
    <div class="modifier-options">
      ${options.map((modifier) => `
        <label>
          <input type="${type}" name="modifier_${escapeAttribute(group.id)}" value="${escapeAttribute(modifier.id)}" ${required && type === 'radio' ? 'required' : ''}>
          <span>${escapeHtml(modifier.name)}</span>
          <strong>${Number(modifier.price_delta || 0) > 0 ? `+ ${money(modifier.price_delta)}` : ''}</strong>
        </label>
      `).join('')}
    </div>
  `;

  fieldset.querySelector('[data-clear-modifier-group]')?.addEventListener('click', () => {
    fieldset.querySelectorAll('input[name^="modifier_"]').forEach((input) => {
      input.checked = false;
    });
    updateModifierGroupState(fieldset, group);
    renderProductDialogTotal();
  });

  fieldset.querySelectorAll('input[name^="modifier_"]').forEach((input) => {
    input.addEventListener('change', () => {
      enforceModifierLimit(fieldset);
      updateModifierGroupState(fieldset, group);
      renderProductDialogTotal();
    });
  });

  if (!required && type === 'radio') {
    fieldset.querySelectorAll('input[type="radio"]').forEach((input) => {
      input.addEventListener('pointerdown', () => {
        input.dataset.wasChecked = String(input.checked);
      });
      input.addEventListener('click', () => {
        if (input.dataset.wasChecked === 'true') {
          input.checked = false;
          updateModifierGroupState(fieldset, group);
          renderProductDialogTotal();
        }
        delete input.dataset.wasChecked;
      });
    });
  }

  updateModifierGroupState(fieldset, group);
  return fieldset;
}

function modifierInstructionText(group) {
  const min = Number(group.min_choices || 0);
  const max = Number(group.max_choices || 1);
  if (group.is_required || min > 0) {
    return max === 1 ? 'Escolha uma opção para continuar.' : `Escolha de ${Math.max(1, min)} a ${max} opções.`;
  }
  return max === 1 ? 'Escolha uma opção se quiser.' : `Escolha até ${max} opções.`;
}

function enforceModifierLimit(fieldset) {
  const max = Number(fieldset.dataset.maxChoices || 1);
  const checked = [...fieldset.querySelectorAll('input[name^="modifier_"]:checked')];
  if (max > 0 && checked.length > max) {
    checked.at(-1).checked = false;
    setStatus(`Escolha no máximo ${max} opção(ões).`);
  }
}

function updateModifierGroupState(fieldset, group) {
  const checked = [...fieldset.querySelectorAll('input[name^="modifier_"]:checked')];
  const min = Number(fieldset.dataset.minChoices || 0);
  const max = Number(fieldset.dataset.maxChoices || 1);
  const required = group.is_required || min > 0;
  const counter = fieldset.querySelector('[data-modifier-counter]');
  const validation = fieldset.querySelector('[data-modifier-validation]');
  if (counter) counter.textContent = required ? `${checked.length}/${Math.max(1, min)}` : `${checked.length}/${max}`;
  const invalid = required && checked.length < Math.max(1, min);
  fieldset.classList.toggle('is-invalid', invalid);
  if (validation) {
    validation.hidden = !invalid;
    validation.textContent = invalid ? `Escolha ${Math.max(1, min)} opção(ões) em "${group.name}".` : '';
  }
}

function submitProductCustomization(event) {
  event.preventDefault();
  const item = state.customizingItem;
  if (!item) return;

  const selected = selectedProductModifiers();
  if (!selected) return;
  const notes = String(new FormData(els.productForm).get('notes') || '').trim();
  const quantity = Math.min(99, Math.max(1, Number.parseInt(new FormData(els.productForm).get('quantity'), 10) || 1));
  const price = Number(item.price || 0) + selected.reduce((sum, modifier) => sum + Number(modifier.price_delta || 0), 0);
  const cartItem = {
    id: item.id,
    name: item.name,
    price,
    quantity,
    modifier_ids: selected.map((modifier) => modifier.id),
    modifiers: selected,
    notes
  };
  if (state.editingCartKey) {
    replaceCartItem(state.editingCartKey, cartItem);
  } else {
    addToCart(cartItem);
  }
  state.editingCartKey = null;
  els.productDialog.close();
}

function selectedProductModifiers() {
  const item = state.customizingItem;
  const selectedIds = new Set([...els.productForm.querySelectorAll('input[name^="modifier_"]:checked')].map((input) => input.value));
  const selected = [];

  for (const group of item.modifier_groups || []) {
    const groupSelected = (group.modifiers || []).filter((modifier) => selectedIds.has(modifier.id));
    const min = Number(group.min_choices || 0);
    const max = Number(group.max_choices || 0);
    if ((group.is_required || min > 0) && groupSelected.length < Math.max(1, min)) {
      setStatus(`Escolha ${group.name}.`);
      const fieldset = els.productForm.querySelector(`[data-group-id="${escapeAttribute(group.id)}"]`);
      fieldset?.classList.add('is-invalid');
      fieldset?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return null;
    }
    if (max > 0 && groupSelected.length > max) {
      setStatus(`Escolha no máximo ${max} opção(ões) em ${group.name}.`);
      return null;
    }
    selected.push(...groupSelected.map((modifier) => ({
      id: modifier.id,
      group_id: group.id,
      group_name: group.name,
      name: modifier.name,
      price_delta: Number(modifier.price_delta || 0)
    })));
  }

  return selected;
}

function renderProductDialogTotal() {
  if (!state.customizingItem) return;
  const selected = [...els.productForm.querySelectorAll('input[name^="modifier_"]:checked')]
    .map((input) => findModifier(input.value))
    .filter(Boolean);
  const quantity = Math.min(99, Math.max(1, Number.parseInt(els.productQuantity.value, 10) || 1));
  if (String(quantity) !== els.productQuantity.value) els.productQuantity.value = String(quantity);
  const unitTotal = Number(state.customizingItem.price || 0) + selected.reduce((sum, modifier) => sum + Number(modifier.price_delta || 0), 0);
  const total = unitTotal * quantity;
  els.productDialogTotal.textContent = money(total);
  renderProductChoiceSummary(selected, quantity, unitTotal, total);
}

function renderProductChoiceSummary(selected, quantity, unitTotal, total) {
  if (!els.productChoiceSummary || !state.customizingItem) return;
  const grouped = new Map();
  for (const modifier of selected) {
    const groupName = modifier.group_name || 'Adicionais';
    if (!grouped.has(groupName)) grouped.set(groupName, []);
    grouped.get(groupName).push(modifier);
  }
  els.productChoiceSummary.hidden = false;
  els.productChoiceSummary.innerHTML = `
    <div>
      <p class="eyebrow">Resumo do item</p>
      <h3>${escapeHtml(state.customizingItem.name)}</h3>
      <small>${quantity}x ${money(unitTotal)} cada</small>
    </div>
    <div class="product-choice-list">
      ${grouped.size ? [...grouped.entries()].map(([groupName, modifiers]) => `
        <article>
          <strong>${escapeHtml(groupName)}</strong>
          ${modifiers.map((modifier) => `<span>${escapeHtml(modifier.name)}${Number(modifier.price_delta || 0) > 0 ? ` + ${money(modifier.price_delta)}` : ''}</span>`).join('')}
        </article>
      `).join('') : '<p>Nenhuma opção selecionada ainda.</p>'}
    </div>
    <strong class="product-choice-total">${money(total)}</strong>
  `;
}

function findModifier(modifierId) {
  return (state.customizingItem?.modifier_groups || [])
    .flatMap((group) => group.modifiers || [])
    .find((modifier) => modifier.id === modifierId);
}

function cartItemKey(id, modifierIds, notes) {
  return [id, [...modifierIds].sort().join(','), notes.trim()].join('|');
}

async function openCheckout() {
  if (!els.checkoutDialog || !els.checkoutForm) {
    setStatus('Checkout indisponível no momento. Atualize a página e tente novamente.');
    return;
  }
  if (isStoreClosed()) {
    showClosedStoreDialog(true);
    return;
  }
  if (state.cart.length === 0) {
    setStatus('Adicione algum produto antes de continuar.');
    return;
  }
  if (!state.customerChecked) {
    await loadLoggedCustomer();
  }
  updateDineInModes({ preferTableContext: true });
  prefillCheckoutFromCustomer();
  updateCheckoutDeliveryFields();
  updatePaymentDetailsVisibility();
  renderCheckoutReview();
  if (typeof els.checkoutDialog.showModal === 'function') {
    els.checkoutDialog.showModal();
  } else {
    setStatus('Seu navegador não abriu o checkout. Atualize a página e tente novamente.');
  }
}

function renderCheckoutReview() {
  if (!els.checkoutReviewItems) return;
  if (state.cart.length === 0) {
    els.checkoutReviewItems.innerHTML = '<p class="muted">Sua sacola está vazia.</p>';
  } else {
    els.checkoutReviewItems.replaceChildren(...state.cart.map((item) => {
      const row = document.createElement('div');
      row.className = 'checkout-review-row';
      const total = Number(item.price || 0) * Number(item.quantity || 0);
      row.innerHTML = `
        <div>
          <div class="checkout-review-title">
            <strong>${item.quantity}x ${escapeHtml(item.name)}</strong>
          </div>
          <p>${money(item.price)} cada${item.modifiers?.length ? ` - ${item.modifiers.map(modifierText).map(escapeHtml).join(', ')}` : ''}</p>
          ${item.notes ? `<p>Obs: ${escapeHtml(item.notes)}</p>` : ''}
        </div>
        <div class="checkout-review-side">
          <button class="text-button mini-edit-button" type="button" data-edit-cart-item="${escapeAttribute(item.key)}">Editar</button>
          <span>${money(total)}</span>
        </div>
      `;
      row.querySelector('[data-edit-cart-item]').addEventListener('click', () => editCartItem(item.key));
      return row;
    }));
  }

  const totals = cartTotals();
  els.checkoutReviewSubtotal.textContent = money(totals.subtotal);
  els.checkoutReviewDelivery.textContent = money(totals.deliveryFee);
  els.checkoutDiscountRow.hidden = !totals.discount;
  els.checkoutReviewDiscount.textContent = `- ${money(totals.discount)}`;
  els.checkoutReviewTotal.textContent = money(totals.total);
  renderCheckoutSnapshot(totals);
}

async function submitOrder(event) {
  event.preventDefault();
  if (state.orderSubmitting) return;
  if (!els.checkoutForm) {
    setStatus('Checkout indisponível no momento. Atualize a página e tente novamente.');
    return;
  }
  if (isStoreClosed()) {
    showClosedStoreDialog(true);
    return;
  }
  syncLoggedCustomerFields();
  const data = new FormData(els.checkoutForm);
  const selectedMethod = data.get('fulfillment_method');
  const method = selectedMethod === 'table' && state.customerTab ? 'tab' : selectedMethod;
  if (method === 'tab' && !state.customerTab && state.customerTabs.length) {
    state.customerTab = state.customerTabs[0];
  }
  const selectedAddress = method === 'delivery' && state.savedAddressApplied ? selectedSavedAddress() : null;
  if (selectedAddress) {
    applySavedCustomerAddress(selectedAddress, { force: true });
  }
  const normalizedData = new FormData(els.checkoutForm);
  const customer = checkoutCustomerFromState(normalizedData);
  if (!validateCheckoutData(normalizedData, method, customer)) return;
  const payload = {
    customer,
    fulfillment_method: method,
    dining_table_id: ['table', 'tab'].includes(method) ? state.diningTable?.id : null,
    customer_tab_id: method === 'tab' ? state.customerTab?.id : null,
    address: method === 'delivery' ? {
      label: normalizedData.get('label') || selectedAddress?.label || 'Casa',
      postal_code: normalizedData.get('postal_code') || selectedAddress?.postal_code,
      street: normalizedData.get('street') || selectedAddress?.street,
      number: normalizedData.get('number') || selectedAddress?.number,
      neighborhood: normalizedData.get('neighborhood') || selectedAddress?.neighborhood,
      city: normalizedData.get('city') || selectedAddress?.city,
      complement: normalizedData.get('complement') || selectedAddress?.complement,
      reference: normalizedData.get('reference') || selectedAddress?.reference
    } : null,
    payment_method: method === 'tab' ? 'Pagamento no fechamento' : checkoutPaymentMethod(normalizedData.get('payment_method')),
    payment_details: paymentDetailsFromForm(normalizedData),
    coupon_code: state.coupon?.code || normalizedData.get('coupon_code') || '',
    notes: normalizedData.get('notes'),
    items: state.cart.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      modifier_ids: item.modifier_ids || [],
      notes: item.notes || ''
    }))
  };

  if (state.isDemoMode) {
    await simulateDemoOrder();
    return;
  }

  const isOnlineCheckout = isOnlineCheckoutPayment(payload.payment_method);
  const popup = isOnlineCheckout ? openPaymentPopup({ blank: true }) : null;

  try {
    setOrderSubmitting(true);
    const result = await request(isOnlineCheckout ? '/api/orders/checkout' : '/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const checkoutUrl = result.payment?.pix?.checkout_url || result.payment?.card?.checkout_url || result.payment?.checkout_url || '';
    if (checkoutUrl) {
      openPaymentCheckoutDialog(result, checkoutUrl, popup);
      return;
    }

    if (result.payment?.pix || result.payment?.card) {
      openPaymentCheckoutDialog(result, storePageUrl('pagamento', `pedido=${encodeURIComponent(result.order.public_code)}`), popup);
      return;
    }

    popup?.close?.();
    finishCreatedOrder(result);
    if (result.whatsapp_url) {
      window.open(result.whatsapp_url, '_blank', 'noopener');
    }
  } catch (error) {
    popup?.close?.();
    setStatus(error.message || 'Não foi possível enviar o pedido agora.');
  } finally {
    setOrderSubmitting(false);
  }
}

function finishCreatedOrder(result = {}) {
  state.cart = [];
  state.coupon = null;
  clearCouponFeedback();
  persistCart();
  renderCart();
  els.checkoutDialog?.close();
  setStatus(`Pedido ${result.order?.public_code || ''} criado.`.trim());
}

function openPaymentCheckoutDialog(result, checkoutUrl, popup = null) {
  const order = result.order || {};
  const payment = result.payment?.pix || result.payment?.card || result.payment || {};
  state.paymentCheckout = {
    code: order.public_code,
    total: Number(order.total || 0),
    checkoutUrl,
    expiresAt: payment.expires_at || order.payment_expires_at || '',
    status: payment.status || order.financial_status || 'pending',
    popup
  };
  state.paymentPopup = popup || state.paymentPopup;
  renderPaymentCheckoutDialog('pending');
  els.checkoutDialog?.close();
  if (typeof els.paymentCheckoutDialog?.showModal === 'function' && !els.paymentCheckoutDialog.open) {
    els.paymentCheckoutDialog.showModal();
  }
  openPaymentPopup();
  startPaymentPolling();
}

function renderPaymentCheckoutDialog(status = state.paymentCheckout?.status || 'pending') {
  const checkout = state.paymentCheckout;
  if (!checkout) return;
  if (els.paymentCheckoutCode) els.paymentCheckoutCode.textContent = checkout.code ? `#${checkout.code}` : '-';
  if (els.paymentCheckoutTotal) els.paymentCheckoutTotal.textContent = money(checkout.total);
  if (els.paymentCheckoutExpires) {
    els.paymentCheckoutExpires.textContent = checkout.expiresAt
      ? new Date(checkout.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : '-';
  }
  const copy = paymentCheckoutCopy(status);
  if (els.paymentCheckoutStatus) {
    els.paymentCheckoutStatus.className = `payment-checkout-status status-${status}`;
    els.paymentCheckoutStatus.innerHTML = `<strong>${escapeHtml(copy.title)}</strong><p>${escapeHtml(copy.text)}</p>`;
  }
  if (els.paymentOpenButton) els.paymentOpenButton.disabled = status === 'paid' || !checkout.checkoutUrl;
  if (els.paymentCheckButton) els.paymentCheckButton.disabled = status === 'paid';
}

function paymentCheckoutCopy(status) {
  if (status === 'paid') {
    return {
      title: 'Pagamento confirmado.',
      text: 'Seu pedido foi enviado para a loja. Você já pode acompanhar o preparo.'
    };
  }
  if (status === 'expired') {
    return {
      title: 'Pagamento expirado.',
      text: 'Gere um novo pedido para abrir outro checkout seguro.'
    };
  }
  if (status === 'failed' || status === 'cancelled') {
    return {
      title: 'Pagamento não concluído.',
      text: 'O pedido ainda não foi enviado para a loja. Tente novamente ou escolha outra forma de pagamento.'
    };
  }
  return {
    title: 'Seu pedido foi reservado.',
    text: 'Finalize o pagamento para enviar o pedido para a loja.'
  };
}

function openPaymentPopup(options = {}) {
  const checkout = state.paymentCheckout || {};
  const width = 480;
  const height = 720;
  const left = Math.max(0, Math.round((window.screen.width - width) / 2));
  const top = Math.max(0, Math.round((window.screen.height - height) / 2));
  const features = `popup=yes,width=${width},height=${height},left=${left},top=${top}`;
  if (options.blank) {
    state.paymentPopup = window.open('about:blank', 'abacatepay_checkout', features);
    if (state.paymentPopup) {
      try {
        state.paymentPopup.document.write('<p style="font-family:Arial,sans-serif;padding:24px">Preparando pagamento seguro...</p>');
      } catch (_) {
        // Alguns navegadores restringem acesso mesmo em popup criado pelo clique.
      }
    }
    return state.paymentPopup;
  }
  if (!checkout.checkoutUrl) return null;
  try {
    if (state.paymentPopup && !state.paymentPopup.closed) {
      state.paymentPopup.location.href = checkout.checkoutUrl;
      state.paymentPopup.focus();
      return state.paymentPopup;
    }
  } catch (_) {
    // Se o navegador bloquear acesso ao popup, abre uma nova janela segura.
  }
  state.paymentPopup = window.open(checkout.checkoutUrl, 'abacatepay_checkout', features);
  if (!state.paymentPopup) {
    setStatus('O navegador bloqueou o popup de pagamento. Clique em "Abrir pagamento".');
  }
  return state.paymentPopup;
}

function startPaymentPolling() {
  stopPaymentPolling();
  state.paymentPollTimer = window.setInterval(() => checkPaymentStatus(), 4000);
  window.setTimeout(() => checkPaymentStatus(), 1200);
}

function stopPaymentPolling() {
  if (state.paymentPollTimer) {
    window.clearInterval(state.paymentPollTimer);
    state.paymentPollTimer = null;
  }
}

async function checkPaymentStatus(options = {}) {
  const checkout = state.paymentCheckout;
  if (!checkout?.code) return;
  if (options.manual) setStatus('Verificando pagamento...');
  try {
    const data = await request(`/api/payments/order?code=${encodeURIComponent(checkout.code)}`);
    const status = data.payment?.status || data.order?.financial_status || 'pending';
    checkout.status = status;
    checkout.expiresAt = data.payment?.expires_at || data.order?.payment_expires_at || checkout.expiresAt;
    renderPaymentCheckoutDialog(status);
    if (status === 'paid') {
      stopPaymentPolling();
      try {
        state.paymentPopup?.close?.();
      } catch (_) {
        // O checkout externo pode impedir o fechamento programático em alguns navegadores.
      }
      finishCreatedOrder({ order: data.order });
      setStatus(`Pagamento confirmado. Pedido #${data.order.public_code} enviado para a loja.`);
      const whatsappUrl = data.payment?.whatsapp_url || '';
      if (whatsappUrl) window.open(whatsappUrl, '_blank', 'noopener');
      window.setTimeout(() => closePaymentCheckoutDialog(), 1400);
    } else if (['expired', 'failed', 'cancelled'].includes(status)) {
      stopPaymentPolling();
      setStatus(paymentCheckoutCopy(status).text);
    } else if (options.manual) {
      setStatus('Pagamento ainda não confirmado. Aguarde alguns segundos e verifique novamente.');
    }
  } catch (error) {
    if (options.manual) setStatus(error.message || 'Não foi possível verificar o pagamento agora.');
  }
}

function handlePaymentWindowMessage(event) {
  if (event.origin !== window.location.origin) return;
  const data = event.data || {};
  if (data.type !== 'tapronto:payment-status' || data.status !== 'paid') return;
  const checkout = state.paymentCheckout;
  const code = data.code || data.order?.public_code || '';
  if (checkout?.code && code && checkout.code !== code) return;
  stopPaymentPolling();
  if (checkout) checkout.status = 'paid';
  renderPaymentCheckoutDialog('paid');
  finishCreatedOrder({ order: data.order || { public_code: code } });
  setStatus(`Pagamento confirmado. Pedido #${code} enviado para a loja.`);
  window.setTimeout(() => closePaymentCheckoutDialog(), 1200);
}

function closePaymentCheckoutDialog() {
  stopPaymentPolling();
  if (els.paymentCheckoutDialog?.open) els.paymentCheckoutDialog.close();
}

async function applyCoupon() {
  const code = els.couponCode.value.trim();
  if (!code) {
    state.coupon = null;
    clearCouponFeedback();
    renderCart();
    return;
  }
  const totals = cartTotals({ ignoreCoupon: true });
  const form = els.checkoutForm ? new FormData(els.checkoutForm) : new FormData();
  const customer = checkoutCustomerFromState(form);
  try {
    const data = await request('/api/coupons/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        subtotal: totals.subtotal,
        delivery_fee: totals.deliveryFee,
        phone: customer.phone,
        items: state.cart.map((item) => ({
          id: item.id,
          quantity: item.quantity
        }))
      })
    });
    state.coupon = data.coupon;
    els.couponFeedback.hidden = false;
    els.couponFeedback.textContent = `${data.coupon.code} aplicado: - ${money(data.coupon.discount)}.`;
    els.couponFeedback.classList.remove('error');
    renderCart();
  } catch (error) {
    state.coupon = null;
    els.couponFeedback.hidden = false;
    els.couponFeedback.textContent = error.message || 'Cupom inválido.';
    els.couponFeedback.classList.add('error');
    renderCart();
  }
}

function clearCouponFeedback() {
  if (els.couponCode) els.couponCode.value = '';
  if (els.couponFeedback) {
    els.couponFeedback.hidden = true;
    els.couponFeedback.textContent = '';
    els.couponFeedback.classList.remove('error');
  }
}

function renderCheckoutSnapshot(totals) {
  if (!els.checkoutConfirmSnapshot) return;
  const method = new FormData(els.checkoutForm).get('fulfillment_method') || 'delivery';
  const origin = checkoutOriginText(method);
  const address = method === 'delivery'
    ? [els.checkoutForm.elements.street.value, els.checkoutForm.elements.number.value, els.checkoutForm.elements.neighborhood.value, els.checkoutForm.elements.city.value].filter(Boolean).join(', ')
    : origin;
  const payment = method === 'tab' ? 'Pagamento no fechamento' : (els.paymentMethod.value || 'Pagamento não selecionado');
  const changeFor = new FormData(els.checkoutForm).get('change_for');
  els.checkoutConfirmSnapshot.innerHTML = `
    <div><strong>Como será</strong><span>${escapeHtml(address || 'Endereço será conferido acima.')}</span></div>
    <div><strong>Pagamento</strong><span>${escapeHtml(payment)}</span></div>
    ${isCashPayment(payment) && changeFor ? `<div><strong>Troco</strong><span>Para ${money(parseMoneyInput(changeFor))}</span></div>` : ''}
    <div><strong>Subtotal</strong><span>${money(totals.subtotal)}</span></div>
    <div><strong>Entrega</strong><span>${money(totals.deliveryFee)}</span></div>
    ${totals.discount ? `<div><strong>Desconto</strong><span>- ${money(totals.discount)}</span></div>` : ''}
    <div><strong>Total final</strong><span>${money(totals.total)}</span></div>
  `;
}

function renderPaymentOptions() {
  const methods = state.store?.payment_methods?.length ? [...state.store.payment_methods] : ['Pix', 'Cartão', 'Dinheiro'];
  if (state.store?.integration_settings?.pix?.enabled && !methods.some((method) => isPixOnlinePayment(method))) {
    methods.unshift('Pix online');
  }
  if (state.store?.integration_settings?.card?.enabled && !methods.includes('Cartão online')) {
    methods.push('Cartão online');
  }
  els.paymentMethod.replaceChildren(...methods.map((method) => {
    const option = document.createElement('option');
    option.value = method;
    option.textContent = method;
    return option;
  }));
  updatePaymentDetailsVisibility();
}

function updateCheckoutDeliveryFields() {
  const method = new FormData(els.checkoutForm).get('fulfillment_method');
  if (method === 'table' && !state.diningTable) {
    setStatus('Para pedir na mesa, acesse o QR Code da mesa.');
  }
  if (method === 'tab' && (!state.diningTable || !(state.customerTab || state.customerTabs.length))) {
    setStatus('Para pedir na comanda, a mesa precisa ter uma comanda aberta.');
  }
  ['label', 'postal_code', 'street', 'number', 'neighborhood', 'city', 'complement', 'reference'].forEach((name) => {
    const field = els.checkoutForm.elements[name];
    field.disabled = method !== 'delivery';
  });
  document.querySelectorAll('.delivery-address-field').forEach((element) => {
    element.hidden = method !== 'delivery';
  });
  ['street', 'number', 'neighborhood', 'city'].forEach((name) => {
    els.checkoutForm.elements[name].required = method === 'delivery';
  });
  renderDineInCheckoutMode();
  renderTableContext();
  updateDeliveryFeeHint();
}

function validateCheckoutData(data, method, customer = checkoutCustomerFromState(data)) {
  const phone = onlyDigits(customer.phone);
  if (['delivery', 'pickup'].includes(method) && !isValidBrazilianPhone(phone)) {
    return focusCheckoutField('phone', 'Informe um telefone válido com DDD. Exemplo: (11) 99999-9999.');
  }
  if (!['table', 'tab'].includes(method) && !String(customer.name || '').trim()) return focusCheckoutField('name', 'Informe o nome do cliente.');
  if (method === 'table' && !state.diningTable) return focusCheckoutField('notes', 'Acesse pelo QR Code da mesa para fazer pedido na mesa.');
  if (method === 'tab' && !state.customerTab && !state.customerTabs.length) return focusCheckoutField('notes', 'Esta mesa não possui comanda aberta.');

  if (method === 'delivery') {
    const labels = {
      street: 'rua ou avenida',
      number: 'número',
      neighborhood: 'bairro',
      city: 'cidade'
    };
    const missing = Object.keys(labels).find((name) => !String(data.get(name) || '').trim());
    if (missing) {
      return focusCheckoutField(missing, `Informe ${labels[missing]} para entrega.`);
    }
  }

  const payment = data.get('payment_method');
  if (isCashPayment(payment)) {
    const changeFor = parseMoneyInput(data.get('change_for'));
    const total = cartTotals().total;
    if (changeFor > 0 && changeFor < total) {
      return focusCheckoutField('change_for', 'O valor do troco precisa ser maior ou igual ao total do pedido.');
    }
  }

  return true;
}

function focusCheckoutField(name, message) {
  const field = els.checkoutForm.elements[name];
  if (field && !field.disabled) {
    field.focus();
    field.setCustomValidity(message);
    field.reportValidity();
    setTimeout(() => field.setCustomValidity(''), 700);
  }
  setStatus(message);
  return false;
}

async function loadLoggedCustomer() {
  state.customerChecked = true;
  try {
    const data = await request('/api/customer/me');
    state.customer = data.customer || null;
    saveAccountCache();
  } catch {
    state.customer = null;
    clearAccountCache();
  }
  renderCustomerActions();
  renderCheckoutCustomerSection();
}

async function logoutCustomer() {
  try {
    await request('/api/customer/logout', { method: 'POST' });
  } catch (error) {
    console.warn('Falha ao encerrar sessão do cliente:', error.message || error);
  } finally {
    state.customer = null;
    state.customerChecked = true;
    state.savedAddressApplied = false;
    clearAccountCache();
    if (els.accountPrefill) els.accountPrefill.hidden = true;
    if (els.deleteSavedAddressButton) els.deleteSavedAddressButton.hidden = true;
    renderCheckoutCustomerSection();
    renderCustomerActions();
    setStatus('Você saiu da conta.');
  }
}

function saveAccountCache() {
  try {
    localStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify({
      customer: state.customer,
      saved_at: new Date().toISOString()
    }));
  } catch {
    // Cache visual do cliente.
  }
}

function loadAccountCache() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNT_CACHE_KEY) || 'null');
  } catch {
    return null;
  }
}

function clearAccountCache() {
  try {
    localStorage.removeItem(ACCOUNT_CACHE_KEY);
  } catch {
    // Sem ação: cache local é opcional.
  }
}

async function simulateDemoOrder() {
  try {
    setOrderSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    const publicCode = `DEMO-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    state.cart = [];
    state.coupon = null;
    clearCouponFeedback();
    persistCart();
    renderCart();
    els.checkoutDialog.close();
    setStatus(`Pedido ${publicCode} simulado. Crie sua conta para receber pedidos reais.`);
    if (els.demoOrderCode) els.demoOrderCode.textContent = publicCode;
    if (els.demoOrderDialog?.showModal) els.demoOrderDialog.showModal();
  } finally {
    setOrderSubmitting(false);
  }
}

function renderCustomerActions() {
  const isLogged = Boolean(state.customer);
  if (els.customerOrdersLink) els.customerOrdersLink.hidden = !isLogged;
  if (els.customerAccountLink) els.customerAccountLink.hidden = !isLogged;
  if (els.customerLoginLink) els.customerLoginLink.hidden = isLogged;
  if (els.customerCreateAccountLink) els.customerCreateAccountLink.hidden = isLogged;
  if (els.customerLogoutButton) els.customerLogoutButton.hidden = !isLogged;
}

function prefillCheckoutFromCustomer() {
  if (!state.customer) {
    els.accountPrefill.hidden = true;
    renderCheckoutCustomerSection();
    return;
  }

  syncLoggedCustomerFields();
  renderCheckoutCustomerSection();

  const method = new FormData(els.checkoutForm).get('fulfillment_method') || 'delivery';
  if (['table', 'tab'].includes(method)) {
    els.accountPrefill.hidden = true;
    els.deleteSavedAddressButton.hidden = true;
    return;
  }

  const addresses = customerAddresses();
  const hasAddress = addresses.length > 0;
  const hasPersistedAddress = addresses.some((address) => address.id);
  els.accountPrefill.hidden = false;
  els.editAddressButton.hidden = !hasAddress;
  els.deleteSavedAddressButton.hidden = !hasPersistedAddress;
  renderSavedAddressOptions(addresses);

  if (hasAddress && !state.savedAddressApplied) {
    applySavedCustomerAddress(addresses[0], { force: true });
    state.savedAddressApplied = true;
    renderAddressPrefillSummary(addresses[0], addresses.length);
  } else if (hasAddress) {
    renderAddressPrefillSummary(selectedSavedAddress(), addresses.length);
  } else {
    els.accountPrefillTitle.textContent = `Olá, ${state.customer.name}`;
    updatePrefillNotice('Dados da conta carregados. Cadastre um endereço neste pedido ou em Minha conta.');
  }
}

function syncLoggedCustomerFields() {
  if (!state.customer) return;
  setValue(els.checkoutForm.elements.name, state.customer.name || '');
  setValue(els.checkoutForm.elements.phone, formatPhone(state.customer.phone || ''));
}

function renderCheckoutCustomerSection() {
  const isLogged = Boolean(state.customer);
  const method = new FormData(els.checkoutForm).get('fulfillment_method') || 'delivery';
  const phoneRequired = ['delivery', 'pickup'].includes(method);
  const nameRequired = !['table', 'tab'].includes(method);
  els.checkoutCustomerSummary.hidden = !isLogged;
  els.checkoutCustomerName.textContent = state.customer?.name || 'Cliente';
  els.checkoutCustomerPhone.textContent = state.customer?.phone ? formatPhone(state.customer.phone) : 'Telefone não informado';

  ['name', 'phone'].forEach((name) => {
    const field = els.checkoutForm.elements[name];
    if (!field) return;
    field.hidden = isLogged;
    field.disabled = isLogged;
    field.required = !isLogged && (name === 'name' ? nameRequired : phoneRequired);
    if (name === 'name') field.placeholder = nameRequired ? 'Nome completo' : 'Nome opcional';
    if (name === 'phone') field.placeholder = phoneRequired ? 'Telefone com DDD' : 'Telefone opcional';
    field.classList.toggle('readonly-field', isLogged);
  });
}

function checkoutCustomerFromState(data) {
  if (state.customer) {
    return {
      name: state.customer.name || data.get('name'),
      phone: state.customer.phone || data.get('phone'),
      email: state.customer.email || null
    };
  }

  return {
    name: data.get('name') || (state.diningTable ? `Cliente ${state.diningTable.name}` : 'Cliente'),
    phone: data.get('phone'),
    email: null
  };
}

function checkoutOriginText(method) {
  if (method === 'delivery') return 'Delivery';
  if (method === 'pickup') return 'Retirada no estabelecimento';
  if (method === 'counter') return 'Pedido no balcão';
  if (method === 'table') return state.diningTable ? `Mesa ${state.diningTable.name}` : 'Mesa';
  if (method === 'tab') return state.customerTab ? `Comanda ${state.customerTab.name}` : 'Comanda';
  return 'Pedido';
}

function setOrderSubmitting(isSubmitting) {
  state.orderSubmitting = isSubmitting;
  if (els.confirmOrderButton) {
    els.confirmOrderButton.disabled = isSubmitting;
    els.confirmOrderButton.textContent = isSubmitting ? 'Enviando pedido...' : 'Confirmar pedido';
  }
  if (els.cancelCheckoutButton) els.cancelCheckoutButton.disabled = isSubmitting;
  if (els.checkoutButton) els.checkoutButton.disabled = isSubmitting || state.cart.length === 0 || isStoreClosed();
  if (els.mobileBagButton) els.mobileBagButton.disabled = isSubmitting || state.cart.length === 0 || isStoreClosed();
}

function renderSavedAddressOptions(addresses) {
  els.savedAddressSelect.hidden = addresses.length <= 1;
  els.deleteSavedAddressButton.hidden = !addresses.some((address) => address.id);
  els.savedAddressSelect.replaceChildren(...addresses.map((address) => {
    const option = document.createElement('option');
    option.value = address.id || addressKey(address);
    option.textContent = addressLabel(address);
    return option;
  }));
  const current = customerAddresses().find((address) => addressKey(address) === addressKeyFromForm());
  if (current) els.savedAddressSelect.value = current.id || addressKey(current);
}

function selectedSavedAddress() {
  const addresses = customerAddresses();
  const selectedValue = els.savedAddressSelect.value;
  return addresses.find((address) => (address.id || addressKey(address)) === selectedValue) || addresses[0] || null;
}

function renderAddressPrefillSummary(address, count = 1) {
  els.accountPrefillTitle.textContent = count > 1 ? 'Escolha o endereço de entrega' : 'Endereço de entrega';
  updatePrefillNotice(address ? addressLabel(address) : 'Nenhum endereço selecionado.');
}

function customerAddresses() {
  if (Array.isArray(state.customer?.addresses) && state.customer.addresses.length > 0) {
    return state.customer.addresses;
  }
  return state.customer?.address ? [state.customer.address] : [];
}

async function deleteSelectedSavedAddress() {
  const address = selectedSavedAddress();
  if (!address?.id) return;
  if (!confirm('Excluir este endereço salvo?')) return;

  const data = await request(`/api/customer/addresses/${address.id}`, { method: 'DELETE' });
  state.customer = data.customer || null;
  saveAccountCache();
  state.savedAddressApplied = false;

  const addresses = customerAddresses();
  renderSavedAddressOptions(addresses);

  if (addresses.length) {
    applySavedCustomerAddress(addresses[0], { force: true });
    state.savedAddressApplied = true;
    updatePrefillNotice(addresses.length > 1
      ? 'Endereço excluído. Escolha outro endereço salvo para este pedido.'
      : 'Endereço excluído. O endereço restante foi aplicado ao pedido.');
  } else {
    clearAddressFields();
    els.editAddressButton.hidden = true;
    els.deleteSavedAddressButton.hidden = true;
    updatePrefillNotice('Endereço excluído. Informe abaixo um novo endereço para entrega.');
  }

  renderCustomerActions();
}

function applySavedCustomerAddress(address = selectedSavedAddress(), options = {}) {
  if (!address) return;
  const force = options.force === true;
  setAddressField('label', address.label || 'Casa', force);
  setAddressField('postal_code', address.postal_code, force);
  setAddressField('street', address.street, force);
  setAddressField('number', address.number, force);
  setAddressField('neighborhood', address.neighborhood, force);
  setAddressField('city', address.city, force);
  setAddressField('complement', address.complement, force);
  setAddressField('reference', address.reference, force);
  els.savedAddressSelect.value = address.id || addressKey(address);
  clearCheckoutValidity();
  renderCheckoutReview();
}

function addressLabel(address) {
  return [
    address.label && address.label !== 'Principal' ? address.label : null,
    address.street,
    address.number,
    address.neighborhood,
    address.city
  ].filter(Boolean).join(' - ');
}

function modifierText(modifier) {
  const price = Number(modifier.price_delta || 0);
  return `${modifier.name || 'Adicional'}${price > 0 ? ` (+ ${money(price)})` : ''}`;
}

function clearAddressFields() {
  ['label', 'postal_code', 'street', 'number', 'neighborhood', 'city', 'complement', 'reference'].forEach((name) => {
    setValue(els.checkoutForm.elements[name], '');
  });
  clearCheckoutValidity();
}

function setAddressField(name, value, force) {
  const field = els.checkoutForm.elements[name];
  if (!field) return;
  if (force || !field.value) field.value = value ?? '';
}

function clearCheckoutValidity() {
  [...els.checkoutForm.elements].forEach((field) => {
    if (typeof field.setCustomValidity === 'function') field.setCustomValidity('');
  });
}

function addressKey(address = {}) {
  return [
    address.street,
    address.postal_code,
    address.number,
    address.neighborhood,
    address.city,
    address.complement,
    address.reference
  ].map((value) => String(value || '').trim().toLowerCase()).join('|');
}

function addressKeyFromForm() {
  return addressKey({
    street: els.checkoutForm.elements.street.value,
    postal_code: els.checkoutForm.elements.postal_code.value,
    number: els.checkoutForm.elements.number.value,
    neighborhood: els.checkoutForm.elements.neighborhood.value,
    city: els.checkoutForm.elements.city.value,
    complement: els.checkoutForm.elements.complement.value,
    reference: els.checkoutForm.elements.reference.value
  });
}

function updatePrefillNotice(message) {
  els.accountPrefillText.textContent = message;
}

function setIfEmpty(field, value) {
  if (field && !field.value && value) field.value = value;
}

function setValue(field, value) {
  if (field) field.value = value ?? '';
}

function formatPhone(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatCep(value) {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function isValidBrazilianPhone(digits) {
  if (!/^\d{10,11}$/.test(digits)) return false;
  const ddd = Number(digits.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  if (digits.length === 11 && digits[2] !== '9') return false;
  return true;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

async function request(url, options = {}) {
  const response = await fetch(storeApiUrl(url), options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : '';
    const error = new Error(detail || data.error || 'Falha na requisicao.');
    error.status = response.status;
    error.code = data.code || data.error_code || '';
    throw error;
  }
  return data;
}

function storeApiUrl(url) {
  if (!String(url || '').startsWith('/api/')) return url;
  const slug = currentStoreSlug();
  if (!slug) return url;
  const parsed = new URL(url, window.location.origin);
  if (!parsed.searchParams.has('store')) parsed.searchParams.set('store', slug);
  return `${parsed.pathname}${parsed.search}`;
}

function storePageUrl(page, query = '') {
  const slug = currentStoreSlug();
  const base = slug ? `/${slug}/${page}` : `/${page}`;
  return query ? `${base}?${query}` : base;
}

function configureStoreLinks() {
  const slug = currentStoreSlug();
  if (!slug) return;
  if (els.customerOrdersLink) els.customerOrdersLink.href = `/${slug}/pedidos`;
  if (els.customerAccountLink) els.customerAccountLink.href = `/${slug}/conta`;
  if (els.customerLoginLink) els.customerLoginLink.href = `/${slug}/conta`;
  if (els.customerCreateAccountLink) els.customerCreateAccountLink.href = `/${slug}/conta`;
}

function currentStoreSlug() {
  const firstSegment = window.location.pathname.split('/').filter(Boolean)[0] || '';
  if (!firstSegment || ['admin', 'cozinha', 'pagamento', 'conta', 'cliente', 'pedidos'].includes(firstSegment)) return '';
  return firstSegment;
}

function loadCachedBootstrap() {
  try {
    const cached = JSON.parse(localStorage.getItem(scopedStorageKey(BOOTSTRAP_CACHE_KEY)) || 'null');
    if (!cached || !Array.isArray(cached.categories)) return null;
    return cached;
  } catch {
    return null;
  }
}

function saveCachedBootstrap(data) {
  try {
    localStorage.setItem(scopedStorageKey(BOOTSTRAP_CACHE_KEY), JSON.stringify({
      store: data.store || null,
      categories: data.categories || [],
      saved_at: new Date().toISOString()
    }));
  } catch {
    // Cache local e apenas uma melhoria de velocidade.
  }
}

function visibleCategories() {
  if (state.activeCategory === 'favorites') {
    return state.categories
      .map((category) => ({
        ...category,
        items: (category.items || []).filter((item) => state.favorites.has(item.id))
      }))
      .filter((category) => category.items.length > 0);
  }
  return state.categories
    .filter((category) => state.activeCategory === 'all' || category.id === state.activeCategory)
    .map((category) => ({ ...category, items: category.items || [] }));
}

function allProducts() {
  return state.categories.flatMap((category) => category.items || []);
}

function findProductById(id) {
  return allProducts().find((item) => item.id === id);
}

function matchesQuery(item) {
  if (!state.query) return true;
  return [item.name, item.description, ...(item.tags || [])].join(' ').toLowerCase().includes(state.query);
}

function cartTotals(options = {}) {
  const subtotal = state.cart.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0);
  const method = new FormData(els.checkoutForm).get('fulfillment_method') || 'delivery';
  const deliveryFee = method === 'delivery' ? deliveryFeeForNeighborhood(els.checkoutForm.elements.neighborhood?.value) : 0;
  const discount = options.ignoreCoupon ? 0 : Math.min(subtotal + deliveryFee, Number(state.coupon?.discount || 0));
  updateDeliveryFeeHint(deliveryFee);
  return { subtotal, deliveryFee, discount, total: subtotal + deliveryFee - discount };
}

function deliveryFeeForNeighborhood(neighborhood) {
  const fallback = Number(state.store?.delivery_fee || 0);
  const rules = state.store?.delivery_neighborhood_fees && typeof state.store.delivery_neighborhood_fees === 'object'
    ? state.store.delivery_neighborhood_fees
    : {};
  const normalized = normalizeText(neighborhood);
  if (!normalized) return fallback;
  const match = Object.entries(rules).find(([name]) => normalizeText(name) === normalized);
  return match ? Number(match[1] || 0) : fallback;
}

function updateDeliveryFeeHint(currentFee = deliveryFeeForNeighborhood(els.checkoutForm.elements.neighborhood?.value)) {
  if (!els.deliveryFeeHint) return;
  const method = new FormData(els.checkoutForm).get('fulfillment_method') || 'delivery';
  if (method !== 'delivery') {
    els.deliveryFeeHint.textContent = `${checkoutOriginText(method)} não tem taxa de entrega.`;
    return;
  }
  const neighborhood = els.checkoutForm.elements.neighborhood?.value?.trim();
  els.deliveryFeeHint.textContent = neighborhood
    ? `Entrega para ${neighborhood}: ${money(currentFee)}.`
    : 'A taxa de entrega será calculada pelo bairro.';
}

function updatePaymentDetailsVisibility() {
  if (!els.cashChangeField) return;
  const method = new FormData(els.checkoutForm).get('fulfillment_method') || 'delivery';
  const payment = els.paymentMethod?.value || '';
  els.cashChangeField.hidden = method === 'tab' || !isCashPayment(payment);
  els.checkoutForm.elements.change_for.required = false;
  if (method === 'tab' || !isCashPayment(payment)) setValue(els.checkoutForm.elements.change_for, '');
}

function paymentDetailsFromForm(data) {
  const payment = data.get('payment_method');
  if (!isCashPayment(payment)) return {};
  return {
    change_for: parseMoneyInput(data.get('change_for'))
  };
}

function isCashPayment(value) {
  return normalizeText(value).includes('dinheiro');
}

function isGenericOnlinePayment(value) {
  return normalizeText(value) === 'pagamento online';
}

function isPixOnlinePayment(value) {
  const normalized = normalizeText(value);
  return isGenericOnlinePayment(value) || (normalized.includes('pix') && normalized.includes('online'));
}

function isOnlineCheckoutPayment(value) {
  const normalized = normalizeText(value);
  return isPixOnlinePayment(value) || (normalized.includes('cartao') && normalized.includes('online'));
}

function checkoutPaymentMethod(value) {
  if (isGenericOnlinePayment(value) && state.store?.integration_settings?.pix?.enabled) return 'Pix online';
  return value || '';
}

function parseMoneyInput(value) {
  const normalized = String(value || '').replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  return Number.parseFloat(normalized) || 0;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(scopedStorageKey('cart')) || '[]').map((item) => ({
      ...item,
      key: item.key || cartItemKey(item.id, item.modifier_ids || [], item.notes || ''),
      modifier_ids: item.modifier_ids || [],
      modifiers: item.modifiers || [],
      notes: item.notes || ''
    }));
  } catch {
    return [];
  }
}

function persistCart() {
  try {
    localStorage.setItem(scopedStorageKey('cart'), JSON.stringify(state.cart));
    return true;
  } catch {
    setStatus('Sua sacola foi atualizada nesta sessão. O navegador bloqueou o salvamento permanente.');
    return false;
  }
}

function scopedStorageKey(base) {
  const slug = currentStoreSlug() || 'default';
  return `${base}:${slug}`;
}

function loadFavorites() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function persistFavorites() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]));
    return true;
  } catch {
    return false;
  }
}

function renderEmptyState() {
  els.featured.replaceChildren();
  els.menu.innerHTML = '<section class="empty-state"><h2>Configure o banco local</h2><p>Confira o DATABASE_URL, rode as migrations do Prisma e reinicie o servidor.</p></section>';
}

function isStoreNotFoundError(error) {
  return error?.status === 404 || ['STORE_NOT_FOUND', 'STORE_INACTIVE'].includes(error?.code);
}

function showStoreNotFound(message) {
  document.body.classList.add('store-unavailable');
  if (els.storeNotFound) els.storeNotFound.hidden = false;
  if (els.storeNotFoundMessage) {
    els.storeNotFoundMessage.textContent = message || 'Confira se o link está correto ou fale com o estabelecimento para confirmar o endereço do cardápio.';
  }
  setStatus('Loja não encontrada.');
}

function hideStoreNotFound() {
  document.body.classList.remove('store-unavailable');
  if (els.storeNotFound) els.storeNotFound.hidden = true;
}

function countItems(categories) {
  return categories.reduce((sum, category) => sum + (category.items || []).length, 0);
}

function setStatus(message) {
  els.status.textContent = message;
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

function cssImageUrl(value) {
  const url = safeImageUrl(value).replace(/["\\\n\r]/g, '');
  return url ? `url("${url}")` : '';
}

function safeImageUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(text)) return text;
  try {
    const url = new URL(text, window.location.origin);
    if (['http:', 'https:', 'blob:'].includes(url.protocol)) return url.href;
  } catch {
    return '';
  }
  return '';
}



