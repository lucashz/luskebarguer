const state = {
  store: null,
  customer: null,
  categories: [],
  cart: loadCart(),
  query: '',
  activeCategory: 'all',
  customerChecked: false,
  savedAddressApplied: false,
  customizingItem: null,
  editingCartKey: null,
  closedStoreNoticeKey: null,
  orderSubmitting: false,
  favorites: loadFavorites(),
  coupon: null
};

const BOOTSTRAP_CACHE_KEY = 'cardapio_bootstrap_cache_v1';
const ACCOUNT_CACHE_KEY = 'customer_account_cache_v1';
const FAVORITES_KEY = 'customer_favorites_v1';

const els = {
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
  customerLogoutButton: document.querySelector('#customerLogoutButton'),
  refreshButton: document.querySelector('#refreshButton'),
  checkoutButton: document.querySelector('#checkoutButton'),
  mobileBagButton: document.querySelector('#mobileBagButton'),
  mobileBagCount: document.querySelector('#mobileBagCount'),
  mobileBagTotal: document.querySelector('#mobileBagTotal'),
  clearCartButton: document.querySelector('#clearCartButton'),
  cartItems: document.querySelector('#cartItems'),
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
  paymentMethod: document.querySelector('#paymentMethod'),
  couponCode: document.querySelector('#couponCode'),
  applyCouponButton: document.querySelector('#applyCouponButton'),
  couponFeedback: document.querySelector('#couponFeedback'),
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
  productDialogTotal: document.querySelector('#productDialogTotal'),
  productQuantity: document.querySelector('#productQuantity'),
  productQuantityMinus: document.querySelector('#productQuantityMinus'),
  productQuantityPlus: document.querySelector('#productQuantityPlus'),
  closedStoreDialog: document.querySelector('#closedStoreDialog'),
  closedStoreTitle: document.querySelector('#closedStoreTitle'),
  closedStoreText: document.querySelector('#closedStoreText'),
  closedStoreRefreshButton: document.querySelector('#closedStoreRefreshButton')
};

els.searchInput.addEventListener('input', () => {
  state.query = els.searchInput.value.trim().toLowerCase();
  renderMenu();
});

els.refreshButton?.addEventListener('click', loadBootstrap);
els.customerLogoutButton.addEventListener('click', logoutCustomer);
els.checkoutButton.addEventListener('click', openCheckout);
els.mobileBagButton.addEventListener('click', openCheckout);
els.featured.addEventListener('wheel', scrollFeaturedWithWheel, { passive: false });
els.clearCartButton.addEventListener('click', () => {
  state.cart = [];
  state.coupon = null;
  persistCart();
  renderCart();
});
els.applyCouponButton?.addEventListener('click', applyCoupon);

els.checkoutForm.addEventListener('change', (event) => {
  if (event.target.name === 'fulfillment_method') {
    state.coupon = null;
    clearCouponFeedback();
    updateCheckoutDeliveryFields();
    renderCart();
    renderCheckoutReview();
  }
  if (['payment_method', 'street', 'number', 'neighborhood', 'city', 'coupon_code'].includes(event.target.name)) {
    renderCheckoutReview();
  }
});
els.checkoutForm.addEventListener('input', (event) => {
  if (['street', 'number', 'neighborhood', 'city'].includes(event.target.name)) {
    renderCheckoutReview();
  }
});
els.checkoutForm.elements.phone?.addEventListener('input', (event) => {
  event.target.value = formatPhone(event.target.value);
});

els.checkoutForm.addEventListener('submit', submitOrder);
els.cancelCheckoutButton?.addEventListener('click', () => els.checkoutDialog.close());
els.productForm.addEventListener('change', renderProductDialogTotal);
els.productForm.addEventListener('input', renderProductDialogTotal);
els.productForm.addEventListener('submit', submitProductCustomization);
els.productQuantityMinus.addEventListener('click', () => changeProductDialogQuantity(-1));
els.productQuantityPlus.addEventListener('click', () => changeProductDialogQuantity(1));
els.closedStoreRefreshButton?.addEventListener('click', () => {
  els.closedStoreDialog.close();
  loadBootstrap();
});
els.savedAddressSelect.addEventListener('change', () => {
  const address = selectedSavedAddress();
  applySavedCustomerAddress(address, { force: true });
  state.savedAddressApplied = true;
  renderAddressPrefillSummary(address, customerAddresses().length);
});
els.editAddressButton.addEventListener('click', () => {
  clearAddressFields();
  state.savedAddressApplied = false;
  els.savedAddressSelect.hidden = true;
  els.deleteSavedAddressButton.hidden = true;
  updatePrefillNotice('Informe outro endereço. Depois de enviar o pedido, ele ficará salvo na sua conta.');
  els.checkoutForm.elements.street.focus();
});
els.deleteSavedAddressButton.addEventListener('click', deleteSelectedSavedAddress);

renderCachedCustomer();
renderCheckoutCustomerSection();
renderCachedBootstrap();
loadLoggedCustomer().catch(() => {});
loadBootstrap();
renderCart();

async function loadBootstrap() {
  setStatus(state.categories.length ? 'Atualizando cardápio...' : 'Carregando cardápio...');
  try {
    const data = await request('/api/bootstrap');
    state.store = data.store || null;
    state.categories = data.categories || [];
    saveCachedBootstrap(data);
    render();
    setStatus(isStoreClosed() ? 'Loja fechada no momento. Pedidos pausados.' : `${countItems(state.categories)} produtos disponiveis`);
    loadLoggedCustomer().catch(() => {});
  } catch (error) {
    setStatus(state.categories.length ? `${countItems(state.categories)} produtos disponiveis` : error.message);
    if (!state.categories.length) renderEmptyState();
  }
}

function renderCachedBootstrap() {
  const cached = loadCachedBootstrap();
  if (!cached) return;
  state.store = cached.store || null;
  state.categories = cached.categories || [];
  render();
  setStatus(isStoreClosed() ? 'Loja fechada no momento. Pedidos pausados.' : `${countItems(state.categories)} produtos disponiveis`);
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
  const name = store.name || 'Cardápio digital';
  els.storeName.textContent = name;
  els.storeLogo.textContent = '';
  els.storeLogo.style.backgroundImage = '';
  els.storeDescription.textContent = store.description || 'Escolha seus itens e envie o pedido pelo WhatsApp da loja.';
  els.storeStatus.textContent = store.is_open === false ? 'Fechado agora' : 'Aberto agora';
  els.storeStatus.classList.toggle('closed', store.is_open === false);
  els.deliveryMeta.textContent = store.accepts_delivery === false ? 'Somente retirada' : `Entrega ${money(store.delivery_fee || 0)}`;
  els.minimumMeta.textContent = `Mínimo ${money(store.minimum_order || 0)}`;

  if (store.cover_url) {
    els.storeCover.style.backgroundImage = `url("${store.cover_url}")`;
  }

  if (store.logo_url) {
    els.storeLogo.style.backgroundImage = `url("${store.logo_url}")`;
  }

  handleStoreClosedState();
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
      ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="">` : '<div class="image-fallback"></div>'}
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
    button.innerHTML = `<span>♥</span><strong>${escapeHtml(item.name)}</strong><small>${money(item.price)}</small>`;
    button.addEventListener('click', () => startAddToCart(item));
    return button;
  }));
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
  return state.store?.is_open === false;
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
  row.innerHTML = `
    <div class="product-info">
      <h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.description || '')}</p>
      <strong>${money(item.price)}</strong>
      <div class="tags">${(item.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
    </div>
    <button class="favorite-button ${state.favorites.has(item.id) ? 'active' : ''}" type="button" aria-label="Favoritar ${escapeHtml(item.name)}">${state.favorites.has(item.id) ? '♥' : '♡'}</button>
    <button class="add-product" type="button" aria-label="Adicionar ${escapeHtml(item.name)}" ${storeClosed ? 'disabled' : ''}>
      ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="">` : '<span>+</span>'}
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

function toggleFavorite(itemId) {
  if (state.favorites.has(itemId)) {
    state.favorites.delete(itemId);
    setStatus('Produto removido dos favoritos.');
  } else {
    state.favorites.add(itemId);
    setStatus('Produto salvo nos favoritos.');
  }
  persistFavorites();
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
  renderCheckoutReview();
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
  els.productDialogDescription.textContent = item.description || 'Confira o item antes de adicionar a sacola.';
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
  if (item.image_url) {
    els.productDialogMedia.innerHTML = `<img src="${escapeAttribute(item.image_url)}" alt="${escapeAttribute(item.name)}">`;
    return;
  }
  els.productDialogMedia.innerHTML = `<div class="product-dialog-fallback">${escapeHtml((item.name || 'P').slice(0, 1).toUpperCase())}</div>`;
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
  fieldset.className = `modifier-group ${required ? 'is-required' : ''}`;
  fieldset.dataset.groupId = group.id;
  fieldset.dataset.minChoices = group.min_choices || 0;
  fieldset.dataset.maxChoices = group.max_choices || 1;
  fieldset.innerHTML = `
    <legend><span>${required ? 'Obrigatório' : 'Opcional'}</span>${escapeHtml(group.name)}</legend>
    <div class="modifier-group-meta">
      <p>${required ? `Escolha pelo menos ${group.min_choices || 1}` : 'Escolha se quiser'}${Number(group.max_choices || 0) > 1 ? `, até ${group.max_choices}` : ''}</p>
      ${!required && type === 'radio' ? '<button class="modifier-clear-button" type="button" data-clear-modifier-group>Remover escolha</button>' : ''}
    </div>
    <div class="modifier-options">
      ${(group.modifiers || []).map((modifier) => `
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
    renderProductDialogTotal();
  });

  if (!required && type === 'radio') {
    fieldset.querySelectorAll('input[type="radio"]').forEach((input) => {
      input.addEventListener('pointerdown', () => {
        input.dataset.wasChecked = String(input.checked);
      });
      input.addEventListener('click', () => {
        if (input.dataset.wasChecked === 'true') {
          input.checked = false;
          renderProductDialogTotal();
        }
        delete input.dataset.wasChecked;
      });
    });
  }

  return fieldset;
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
  prefillCheckoutFromCustomer();
  updateCheckoutDeliveryFields();
  renderCheckoutReview();
  els.checkoutDialog.showModal();
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
            <button class="text-button mini-edit-button" type="button" data-edit-cart-item="${escapeAttribute(item.key)}">Editar</button>
          </div>
          <p>${money(item.price)} cada${item.modifiers?.length ? ` - ${item.modifiers.map(modifierText).map(escapeHtml).join(', ')}` : ''}</p>
          ${item.notes ? `<p>Obs: ${escapeHtml(item.notes)}</p>` : ''}
        </div>
        <span>${money(total)}</span>
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
  if (isStoreClosed()) {
    showClosedStoreDialog(true);
    return;
  }
  syncLoggedCustomerFields();
  const data = new FormData(els.checkoutForm);
  const method = data.get('fulfillment_method');
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
    address: method === 'delivery' ? {
      label: normalizedData.get('label') || selectedAddress?.label || 'Casa',
      street: normalizedData.get('street') || selectedAddress?.street,
      number: normalizedData.get('number') || selectedAddress?.number,
      neighborhood: normalizedData.get('neighborhood') || selectedAddress?.neighborhood,
      city: normalizedData.get('city') || selectedAddress?.city,
      complement: normalizedData.get('complement') || selectedAddress?.complement,
      reference: normalizedData.get('reference') || selectedAddress?.reference
    } : null,
    payment_method: normalizedData.get('payment_method'),
    coupon_code: state.coupon?.code || normalizedData.get('coupon_code') || '',
    notes: normalizedData.get('notes'),
    items: state.cart.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      modifier_ids: item.modifier_ids || [],
      notes: item.notes || ''
    }))
  };

  try {
    setOrderSubmitting(true);
    const result = await request('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    state.cart = [];
    state.coupon = null;
    clearCouponFeedback();
    persistCart();
    renderCart();
    els.checkoutDialog.close();
    setStatus(`Pedido ${result.order.public_code} criado.`);

    if (result.whatsapp_url) {
      window.open(result.whatsapp_url, '_blank', 'noopener');
    }
  } catch (error) {
    setStatus(error.message || 'Não foi possível enviar o pedido agora.');
  } finally {
    setOrderSubmitting(false);
  }
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
  try {
    const data = await request('/api/coupons/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        subtotal: totals.subtotal,
        delivery_fee: totals.deliveryFee
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
  const address = method === 'delivery'
    ? [els.checkoutForm.elements.street.value, els.checkoutForm.elements.number.value, els.checkoutForm.elements.neighborhood.value, els.checkoutForm.elements.city.value].filter(Boolean).join(', ')
    : 'Retirada no balcão';
  const payment = els.paymentMethod.value || 'Pagamento não selecionado';
  els.checkoutConfirmSnapshot.innerHTML = `
    <div><strong>Entrega</strong><span>${escapeHtml(address || 'Endereço será conferido acima.')}</span></div>
    <div><strong>Pagamento</strong><span>${escapeHtml(payment)}</span></div>
    <div><strong>Total final</strong><span>${money(totals.total)}</span></div>
  `;
}

function renderPaymentOptions() {
  const methods = state.store?.payment_methods?.length ? state.store.payment_methods : ['Pix', 'Cartão na entrega', 'Dinheiro'];
  els.paymentMethod.replaceChildren(...methods.map((method) => {
    const option = document.createElement('option');
    option.value = method;
    option.textContent = method;
    return option;
  }));
}

function updateCheckoutDeliveryFields() {
  const method = new FormData(els.checkoutForm).get('fulfillment_method');
  ['label', 'street', 'number', 'neighborhood', 'city', 'complement', 'reference'].forEach((name) => {
    const field = els.checkoutForm.elements[name];
    field.disabled = method === 'pickup';
  });
  ['street', 'number', 'neighborhood', 'city'].forEach((name) => {
    els.checkoutForm.elements[name].required = method !== 'pickup';
  });
}

function validateCheckoutData(data, method, customer = checkoutCustomerFromState(data)) {
  const phone = onlyDigits(customer.phone);
  if (!isValidBrazilianPhone(phone)) {
    return focusCheckoutField('phone', 'Informe um telefone válido com DDD. Exemplo: (11) 99999-9999.');
  }

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
  await request('/api/customer/logout', { method: 'POST' });
  state.customer = null;
  state.customerChecked = true;
  state.savedAddressApplied = false;
  clearAccountCache();
  els.accountPrefill.hidden = true;
  els.deleteSavedAddressButton.hidden = true;
  renderCheckoutCustomerSection();
  renderCustomerActions();
  setStatus('Você saiu da conta.');
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
  localStorage.removeItem(ACCOUNT_CACHE_KEY);
}

function renderCustomerActions() {
  if (!els.customerLogoutButton) return;
  els.customerLogoutButton.hidden = !state.customer;
}

function prefillCheckoutFromCustomer() {
  if (!state.customer) {
    els.accountPrefill.hidden = true;
    renderCheckoutCustomerSection();
    return;
  }

  syncLoggedCustomerFields();
  renderCheckoutCustomerSection();

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
  els.checkoutCustomerSummary.hidden = !isLogged;
  els.checkoutCustomerName.textContent = state.customer?.name || 'Cliente';
  els.checkoutCustomerPhone.textContent = state.customer?.phone ? formatPhone(state.customer.phone) : 'Telefone não informado';

  ['name', 'phone'].forEach((name) => {
    const field = els.checkoutForm.elements[name];
    if (!field) return;
    field.hidden = isLogged;
    field.disabled = isLogged;
    field.required = !isLogged;
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
    name: data.get('name'),
    phone: data.get('phone'),
    email: null
  };
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
  setAddressField('street', address.street, force);
  setAddressField('number', address.number, force);
  setAddressField('neighborhood', address.neighborhood, force);
  setAddressField('city', address.city, force);
  setAddressField('complement', address.complement, force);
  setAddressField('reference', address.reference, force);
  els.savedAddressSelect.value = address.id || addressKey(address);
  clearCheckoutValidity();
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
  return `${modifier.group_name ? `${modifier.group_name}: ` : ''}${modifier.name}`;
}

function clearAddressFields() {
  ['label', 'street', 'number', 'neighborhood', 'city', 'complement', 'reference'].forEach((name) => {
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
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : '';
    throw new Error(detail || data.error || 'Falha na requisicao.');
  }
  return data;
}

function loadCachedBootstrap() {
  try {
    const cached = JSON.parse(localStorage.getItem(BOOTSTRAP_CACHE_KEY) || 'null');
    if (!cached || !Array.isArray(cached.categories)) return null;
    return cached;
  } catch {
    return null;
  }
}

function saveCachedBootstrap(data) {
  try {
    localStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify({
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
  const deliveryFee = method === 'pickup' ? 0 : Number(state.store?.delivery_fee || 0);
  const discount = options.ignoreCoupon ? 0 : Math.min(subtotal + deliveryFee, Number(state.coupon?.discount || 0));
  return { subtotal, deliveryFee, discount, total: subtotal + deliveryFee - discount };
}

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem('cart') || '[]').map((item) => ({
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
  localStorage.setItem('cart', JSON.stringify(state.cart));
}

function loadFavorites() {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function persistFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]));
}

function renderEmptyState() {
  els.featured.replaceChildren();
  els.menu.innerHTML = '<section class="empty-state"><h2>Configure o Supabase</h2><p>Rode o schema atualizado em supabase/schema.sql e confira o arquivo .env.</p></section>';
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



