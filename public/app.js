const state = {
  store: null,
  customer: null,
  categories: [],
  cart: loadCart(),
  query: '',
  activeCategory: 'all',
  customerChecked: false,
  savedAddressApplied: false
};

const BOOTSTRAP_CACHE_KEY = 'cardapio_bootstrap_cache_v1';

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
  categoryNav: document.querySelector('#categoryNav'),
  searchInput: document.querySelector('#searchInput'),
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
  checkoutReviewTotal: document.querySelector('#checkoutReviewTotal'),
  paymentMethod: document.querySelector('#paymentMethod'),
  accountPrefill: document.querySelector('#accountPrefill'),
  accountPrefillTitle: document.querySelector('#accountPrefillTitle'),
  accountPrefillText: document.querySelector('#accountPrefillText'),
  savedAddressSelect: document.querySelector('#savedAddressSelect'),
  editAddressButton: document.querySelector('#editAddressButton')
};

els.searchInput.addEventListener('input', () => {
  state.query = els.searchInput.value.trim().toLowerCase();
  renderMenu();
});

els.refreshButton.addEventListener('click', loadBootstrap);
els.checkoutButton.addEventListener('click', openCheckout);
els.mobileBagButton.addEventListener('click', openCheckout);
els.clearCartButton.addEventListener('click', () => {
  state.cart = [];
  persistCart();
  renderCart();
});

els.checkoutForm.addEventListener('change', (event) => {
  if (event.target.name === 'fulfillment_method') {
    updateCheckoutDeliveryFields();
    renderCart();
    renderCheckoutReview();
  }
});

els.checkoutForm.addEventListener('submit', submitOrder);
els.savedAddressSelect.addEventListener('change', () => {
  applySavedCustomerAddress(selectedSavedAddress());
  state.savedAddressApplied = true;
  updatePrefillNotice('Endereço selecionado. Confira os dados antes de enviar.');
});
els.editAddressButton.addEventListener('click', () => {
  clearAddressFields();
  state.savedAddressApplied = false;
  els.savedAddressSelect.hidden = true;
  updatePrefillNotice('Informe outro endereço. Depois de enviar o pedido, ele ficará salvo na sua conta.');
  els.checkoutForm.elements.street.focus();
});

renderCachedBootstrap();
loadBootstrap();
renderCart();

async function loadBootstrap() {
  setStatus(state.categories.length ? 'Atualizando cardapio...' : 'Carregando cardapio...');
  try {
    const data = await request('/api/bootstrap');
    state.store = data.store || null;
    state.categories = data.categories || [];
    saveCachedBootstrap(data);
    render();
    setStatus(`${countItems(state.categories)} produtos disponiveis`);
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
  setStatus(`${countItems(state.categories)} produtos disponiveis`);
}

function render() {
  renderStore();
  renderNav();
  renderFeatured();
  renderMenu();
  renderPaymentOptions();
  renderCart();
}

function renderStore() {
  const store = state.store || {};
  const name = store.name || 'Cardapio digital';
  els.storeName.textContent = name;
  els.storeLogo.textContent = name.slice(0, 1).toUpperCase();
  els.storeDescription.textContent = store.description || 'Escolha seus itens e envie o pedido pelo WhatsApp da loja.';
  els.storeStatus.textContent = store.is_open === false ? 'Fechado agora' : 'Aberto agora';
  els.deliveryMeta.textContent = store.accepts_delivery === false ? 'Somente retirada' : `Entrega ${money(store.delivery_fee || 0)}`;
  els.minimumMeta.textContent = `Minimo ${money(store.minimum_order || 0)}`;

  if (store.cover_url) {
    els.storeCover.style.backgroundImage = `url("${store.cover_url}")`;
  }

  if (store.logo_url) {
    els.storeLogo.style.backgroundImage = `url("${store.logo_url}")`;
    els.storeLogo.textContent = '';
  }
}

function renderNav() {
  const buttons = [
    navButton('all', 'Todos'),
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

  els.featured.replaceChildren(...items.map((item) => {
    const card = document.createElement('article');
    card.className = 'featured-product';
    card.innerHTML = `
      ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="">` : '<div class="image-fallback"></div>'}
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${money(item.price)}</span>
      </div>
    `;
    card.addEventListener('click', () => addToCart(item));
    return card;
  }));
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
  row.innerHTML = `
    <div class="product-info">
      <h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.description || '')}</p>
      <strong>${money(item.price)}</strong>
      <div class="tags">${(item.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
    </div>
    <button class="add-product" type="button" aria-label="Adicionar ${escapeHtml(item.name)}">
      ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="">` : '<span>+</span>'}
      <b>+</b>
    </button>
  `;
  row.querySelector('button').addEventListener('click', () => addToCart(item));
  return row;
}

function renderCart() {
  if (state.cart.length === 0) {
    els.cartItems.innerHTML = '<p class="muted">Sua sacola esta vazia.</p>';
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
  renderCheckoutReview();
}

function cartRow(item) {
  const row = document.createElement('div');
  row.className = 'bag-row';
  row.innerHTML = `
    <div>
      <strong>${escapeHtml(item.name)}</strong>
      <p>${money(item.price)} cada</p>
    </div>
    <div class="qty">
      <button type="button" aria-label="Diminuir">-</button>
      <span>${item.quantity}</span>
      <button type="button" aria-label="Aumentar">+</button>
    </div>
  `;
  const [minus, plus] = row.querySelectorAll('button');
  minus.addEventListener('click', () => changeCartQuantity(item.id, -1));
  plus.addEventListener('click', () => changeCartQuantity(item.id, 1));
  return row;
}

function addToCart(item) {
  const existing = state.cart.find((entry) => entry.id === item.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({
      id: item.id,
      name: item.name,
      price: Number(item.price || 0),
      quantity: 1
    });
  }
  persistCart();
  renderCart();
}

function changeCartQuantity(id, delta) {
  const item = state.cart.find((entry) => entry.id === id);
  if (!item) return;
  item.quantity += delta;
  state.cart = state.cart.filter((entry) => entry.quantity > 0);
  persistCart();
  renderCart();
}

async function openCheckout() {
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
    els.checkoutReviewItems.innerHTML = '<p class="muted">Sua sacola esta vazia.</p>';
  } else {
    els.checkoutReviewItems.replaceChildren(...state.cart.map((item) => {
      const row = document.createElement('div');
      row.className = 'checkout-review-row';
      const total = Number(item.price || 0) * Number(item.quantity || 0);
      row.innerHTML = `
        <div>
          <strong>${item.quantity}x ${escapeHtml(item.name)}</strong>
          <p>${money(item.price)} cada</p>
        </div>
        <span>${money(total)}</span>
      `;
      return row;
    }));
  }

  const totals = cartTotals();
  els.checkoutReviewSubtotal.textContent = money(totals.subtotal);
  els.checkoutReviewDelivery.textContent = money(totals.deliveryFee);
  els.checkoutReviewTotal.textContent = money(totals.total);
}

async function submitOrder(event) {
  event.preventDefault();
  const data = new FormData(els.checkoutForm);
  const method = data.get('fulfillment_method');
  const payload = {
    customer: {
      name: data.get('name'),
      phone: data.get('phone'),
      email: data.get('email')
    },
    fulfillment_method: method,
    address: method === 'delivery' ? {
      street: data.get('street'),
      number: data.get('number'),
      neighborhood: data.get('neighborhood'),
      city: data.get('city'),
      complement: data.get('complement'),
      reference: data.get('reference')
    } : null,
    payment_method: data.get('payment_method'),
    notes: data.get('notes'),
    items: state.cart.map((item) => ({ id: item.id, quantity: item.quantity }))
  };

  const result = await request('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  state.cart = [];
  persistCart();
  renderCart();
  els.checkoutDialog.close();
  setStatus(`Pedido ${result.order.public_code} criado.`);

  if (result.whatsapp_url) {
    window.open(result.whatsapp_url, '_blank', 'noopener');
  }
}

function renderPaymentOptions() {
  const methods = state.store?.payment_methods?.length ? state.store.payment_methods : ['Pix', 'Cartao na entrega', 'Dinheiro'];
  els.paymentMethod.replaceChildren(...methods.map((method) => {
    const option = document.createElement('option');
    option.value = method;
    option.textContent = method;
    return option;
  }));
}

function updateCheckoutDeliveryFields() {
  const method = new FormData(els.checkoutForm).get('fulfillment_method');
  ['street', 'number', 'neighborhood', 'city', 'complement', 'reference'].forEach((name) => {
    const field = els.checkoutForm.elements[name];
    field.disabled = method === 'pickup';
  });
  ['street', 'neighborhood', 'city'].forEach((name) => {
    els.checkoutForm.elements[name].required = method !== 'pickup';
  });
}

async function loadLoggedCustomer() {
  state.customerChecked = true;
  try {
    const data = await request('/api/customer/me');
    state.customer = data.customer || null;
  } catch {
    state.customer = null;
  }
}

function prefillCheckoutFromCustomer() {
  if (!state.customer) {
    els.accountPrefill.hidden = true;
    return;
  }

  setIfEmpty(els.checkoutForm.elements.name, state.customer.name);
  setIfEmpty(els.checkoutForm.elements.phone, state.customer.phone);
  setIfEmpty(els.checkoutForm.elements.email, state.customer.email);

  const addresses = customerAddresses();
  const hasAddress = addresses.length > 0;
  els.accountPrefill.hidden = false;
  els.editAddressButton.hidden = !hasAddress;
  els.accountPrefillTitle.textContent = `Olá, ${state.customer.name}`;
  renderSavedAddressOptions(addresses);

  if (hasAddress && !state.savedAddressApplied) {
    applySavedCustomerAddress(addresses[0]);
    state.savedAddressApplied = true;
    updatePrefillNotice(addresses.length > 1
      ? 'Dados da conta carregados. Escolha qual endereço salvo deseja usar neste pedido.'
      : 'Dados da conta e endereço salvo já foram aplicados. Clique em “Informar outro” se quiser entregar em outro local.');
  } else if (hasAddress) {
    updatePrefillNotice(addresses.length > 1
      ? 'Escolha um endereço salvo ou informe outro para este pedido.'
      : 'Endereço salvo aplicado. Você pode informar outro se quiser.');
  } else {
    updatePrefillNotice('Dados da conta carregados. Cadastre um endereço neste pedido ou em Minha conta.');
  }
}

function renderSavedAddressOptions(addresses) {
  els.savedAddressSelect.hidden = addresses.length <= 1;
  els.savedAddressSelect.replaceChildren(...addresses.map((address) => {
    const option = document.createElement('option');
    option.value = address.id;
    option.textContent = addressLabel(address);
    return option;
  }));
}

function selectedSavedAddress() {
  const addresses = customerAddresses();
  return addresses.find((address) => address.id === els.savedAddressSelect.value) || addresses[0] || null;
}

function customerAddresses() {
  if (Array.isArray(state.customer?.addresses) && state.customer.addresses.length > 0) {
    return state.customer.addresses;
  }
  return state.customer?.address ? [state.customer.address] : [];
}

function applySavedCustomerAddress(address = selectedSavedAddress()) {
  if (!address) return;
  setValue(els.checkoutForm.elements.street, address.street);
  setValue(els.checkoutForm.elements.number, address.number);
  setValue(els.checkoutForm.elements.neighborhood, address.neighborhood);
  setValue(els.checkoutForm.elements.city, address.city);
  setValue(els.checkoutForm.elements.complement, address.complement);
  setValue(els.checkoutForm.elements.reference, address.reference);
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

function clearAddressFields() {
  ['street', 'number', 'neighborhood', 'city', 'complement', 'reference'].forEach((name) => {
    setValue(els.checkoutForm.elements[name], '');
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
  return state.categories
    .filter((category) => state.activeCategory === 'all' || category.id === state.activeCategory)
    .map((category) => ({ ...category, items: category.items || [] }));
}

function matchesQuery(item) {
  if (!state.query) return true;
  return [item.name, item.description, ...(item.tags || [])].join(' ').toLowerCase().includes(state.query);
}

function cartTotals() {
  const subtotal = state.cart.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0);
  const method = new FormData(els.checkoutForm).get('fulfillment_method') || 'delivery';
  const deliveryFee = method === 'pickup' ? 0 : Number(state.store?.delivery_fee || 0);
  return { subtotal, deliveryFee, total: subtotal + deliveryFee };
}

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem('cart') || '[]');
  } catch {
    return [];
  }
}

function persistCart() {
  localStorage.setItem('cart', JSON.stringify(state.cart));
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
