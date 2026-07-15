const menuButton = document.querySelector('#homeMenuButton');
const nav = document.querySelector('#homeNav');
const homePlans = document.querySelector('#homePlans');
const homeSlides = [...document.querySelectorAll('[data-home-slide]')];
const homeSlideControls = [...document.querySelectorAll('[data-home-slide-control]')];
let homeSlideIndex = 0;
let homeSlideTimer = null;

menuButton?.addEventListener('click', () => {
  const open = nav?.classList.toggle('open') || false;
  menuButton.setAttribute('aria-expanded', String(open));
});

nav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuButton?.setAttribute('aria-expanded', 'false');
  });
});

initHomeCarousel();
loadHomePlans().catch(() => {});

function initHomeCarousel() {
  if (homeSlides.length < 2 || homeSlideControls.length < 2) return;
  homeSlideControls.forEach((button) => {
    button.addEventListener('click', () => {
      showHomeSlide(Number(button.dataset.homeSlideControl || 0));
      restartHomeSlideTimer();
    });
  });

  const carousel = document.querySelector('.clean-system-carousel');
  carousel?.addEventListener('mouseenter', stopHomeSlideTimer);
  carousel?.addEventListener('mouseleave', startHomeSlideTimer);
  waitForHomeSlideImages().then(startHomeSlideTimer);
}

function showHomeSlide(index) {
  homeSlideIndex = (index + homeSlides.length) % homeSlides.length;
  homeSlides.forEach((slide, currentIndex) => {
    slide.classList.toggle('is-active', currentIndex === homeSlideIndex);
  });
  homeSlideControls.forEach((button, currentIndex) => {
    button.classList.toggle('is-active', currentIndex === homeSlideIndex);
  });
}

function startHomeSlideTimer() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  if (homeSlideTimer || homeSlides.length < 2) return;
  homeSlideTimer = window.setInterval(() => {
    showHomeSlide(homeSlideIndex + 1);
  }, 5200);
}

function stopHomeSlideTimer() {
  if (!homeSlideTimer) return;
  window.clearInterval(homeSlideTimer);
  homeSlideTimer = null;
}

function restartHomeSlideTimer() {
  stopHomeSlideTimer();
  startHomeSlideTimer();
}

function waitForHomeSlideImages() {
  const images = homeSlides.map((slide) => slide.querySelector('img')).filter(Boolean);
  if (!images.length || images.every((image) => image.complete)) return Promise.resolve();
  return Promise.allSettled(images.map((image) => new Promise((resolve) => {
    image.addEventListener('load', resolve, { once: true });
    image.addEventListener('error', resolve, { once: true });
  })));
}

async function loadHomePlans() {
  if (!homePlans) return;
  try {
    const response = await fetch('/api/portal/plans');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os planos.');
    const plans = Array.isArray(data.plans) ? data.plans : [];
    const paidPlans = plans.filter((plan) => !isFreeTrialPlan(plan));
    if (!paidPlans.length) {
      renderEmptyPlans('Nenhum plano ativo foi encontrado.');
      return;
    }
    homePlans.innerHTML = paidPlans.slice(0, 4).map(renderHomePlan).join('');
  } catch (error) {
    renderEmptyPlans(error.message || 'Não foi possível carregar os planos agora.');
  }
}

function isFreeTrialPlan(plan) {
  const code = String(plan?.code || '').toLowerCase();
  const name = String(plan?.name || '').toLowerCase();
  const price = Number(plan?.monthly_price || 0);
  return price <= 0 || code.includes('trial') || code.includes('teste') || name.includes('teste') || name.includes('grátis') || name.includes('gratis');
}

function renderHomePlan(plan, index) {
  const price = Number(plan.monthly_price || 0);
  const features = homePlanHighlights(plan).map((feature) => `<li>${escapeHtml(feature)}</li>`).join('');
  const featured = /professional|profissional/i.test(`${plan.code || ''} ${plan.name || ''}`);
  const audience = planAudience(plan, index);
  const daily = planDailyPrice(plan);
  return `
    <article class="${featured ? 'featured' : ''}">
      <span>${featured ? 'Mais escolhido' : 'Plano'}</span>
      <strong>${escapeHtml(plan.name || 'Plano')}</strong>
      <p class="clean-plan-price">${price > 0 ? formatMoney(price) + '/mês' : 'Sob consulta'}</p>
      <p class="clean-plan-audience">${escapeHtml(audience)}</p>
      <p>${escapeHtml(plan.description || 'Para publicar o cardápio, receber pedidos e organizar a operação.')}</p>
      ${daily ? `<p class="clean-plan-daily">${escapeHtml(daily)}</p>` : ''}
      <ul>${features || '<li>Cardápio digital</li><li>Painel administrativo</li>'}</ul>
      <small class="clean-plan-commission">Sem comissão por pedido</small>
      <a href="/cadastro?plan=${encodeURIComponent(plan.code || '')}">Contratar</a>
    </article>
  `;
}

function homePlanHighlights(plan) {
  const code = String(plan?.code || '').toLowerCase();
  if (code.includes('premium')) {
    return [
      'Produtos e pedidos ilimitados',
      'Automação WhatsApp',
      'Fidelidade e sugestões no carrinho',
      'Domínio personalizado e suporte prioritário'
    ];
  }
  if (code.includes('professional')) {
    return [
      'Até 100 produtos',
      'Pedidos ilimitados',
      'Mesas, comandas e QR Code',
      'Cupons, KDS e relatórios completos'
    ];
  }
  if (code.includes('essential')) {
    return [
      'Até 25 produtos',
      'Até 150 pedidos/mês',
      '1 usuário administrativo',
      'Cardápio, pedidos e WhatsApp manual'
    ];
  }
  return (plan.features || []).slice(0, 4).map((feature) => {
    const limit = feature.limit_value === null || feature.limit_value === undefined ? '' : ` até ${feature.limit_value}`;
    return `${feature.name || feature.code}${limit}`;
  });
}

function planDailyPrice(plan) {
  const code = String(plan?.code || '').toLowerCase();
  if (code.includes('essential')) return 'Menos de R$ 1,70 por dia';
  if (code.includes('professional')) return 'Menos de R$ 3 por dia';
  if (code.includes('premium')) return 'Menos de R$ 5 por dia';
  return '';
}

function planAudience(plan, index) {
  const text = `${plan?.name || ''} ${plan?.code || ''}`.toLowerCase();
  if (text.includes('premium')) return 'Para operação avançada e crescimento.';
  if (text.includes('prof')) return 'Para salão, equipe e rotina completa.';
  if (text.includes('essencial')) return 'Para começar enxuto, com controle.';
  return index === 0 ? 'Para publicar seu primeiro cardápio.' : 'Para restaurantes em crescimento.';
}

function renderEmptyPlans(message) {
  homePlans.innerHTML = `
    <article>
      <span>Planos</span>
      <strong>Consulte as opções</strong>
      <p>${escapeHtml(message)}</p>
      <a href="/cadastro">Criar conta</a>
    </article>
  `;
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
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
