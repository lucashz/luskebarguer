const planContainers = [
  document.querySelector('#portalPlans')
].filter(Boolean);
const signupForm = document.querySelector('#signupForm');
const signupProgress = document.querySelector('#signupProgress');
const slugInput = document.querySelector('#signupSlug');
const slugStatus = document.querySelector('#slugStatus');
const signupMessage = document.querySelector('#signupMessage');
const signupSubmitButton = document.querySelector('#signupSubmitButton');
let signupActivationEmail = '';
const portalResetPasswordForm = document.querySelector('#portalResetPasswordForm');
const portalActivationButton = document.querySelector('#portalActivationButton');
const onboardingChecklist = document.querySelector('#onboardingChecklist');
const onboardingProgress = document.querySelector('#onboardingProgress');
const onboardingPublishButton = document.querySelector('#onboardingPublishButton');
const onboardingMessage = document.querySelector('#onboardingMessage');
const inviteAcceptForm = document.querySelector('#inviteAcceptForm');

initPortal();

async function initPortal() {
  if (planContainers.length) await loadPlans();
  if (signupForm) initSignup();
  if (portalResetPasswordForm) await initPasswordReset();
  if (portalActivationButton) await initAccountActivation();
  if (onboardingChecklist) {
    setupAdminStoreHomeLinks().catch(() => {});
    await loadOnboarding();
  }
  if (inviteAcceptForm) await initInviteAccept();
}

async function loadPlans() {
  try {
    const data = await request('/api/portal/plans');
    const plans = data.plans || [];
    for (const container of planContainers) {
      container.innerHTML = plans.map((plan, index) => renderPlan(plan, index)).join('');
    }
    const params = new URLSearchParams(location.search);
    const selected = params.get('plan') || plans[0]?.code || 'essential';
    const input = document.querySelector(`input[name="plan_code"][value="${cssEscape(selected)}"]`);
    if (input) input.checked = true;
  } catch (error) {
    for (const container of planContainers) {
      container.innerHTML = `<article class="portal-plan-card"><p>${escapeHtml(error.message || 'Não foi possível carregar os planos.')}</p></article>`;
    }
  }
}

function initSignup() {
  const businessName = signupForm.elements.business_name;
  initSignupProgress();
  businessName?.addEventListener('input', () => {
    if (!slugInput || slugInput.dataset.touched === 'true') return;
    slugInput.value = slugify(businessName.value);
    validateSlugSoon();
  });
  slugInput?.addEventListener('input', () => {
    slugInput.dataset.touched = 'true';
    slugInput.value = slugify(slugInput.value);
    validateSlugSoon();
  });
  signupForm.addEventListener('submit', submitSignup);
}

function initSignupProgress() {
  if (!signupForm || !signupProgress) return;
  signupForm.addEventListener('focusin', (event) => {
    const step = event.target.closest('[data-signup-step]')?.dataset.signupStep;
    if (step) setSignupProgress(step);
  });
  signupForm.addEventListener('input', updateSignupProgressState);
  signupForm.addEventListener('change', updateSignupProgressState);
  document.addEventListener('scroll', markVisibleSignupStep, { passive: true });
  updateSignupProgressState();
  markVisibleSignupStep();
}

function markVisibleSignupStep() {
  if (!signupForm || !signupProgress) return;
  const steps = [...signupForm.querySelectorAll('[data-signup-step]')];
  const current = steps
    .map((section) => ({ section, top: Math.abs(section.getBoundingClientRect().top - 120) }))
    .sort((a, b) => a.top - b.top)[0]?.section?.dataset.signupStep;
  if (current) setSignupProgress(current);
}

function updateSignupProgressState() {
  if (!signupProgress) return;
  const completed = {
    owner: ['owner_name', 'owner_phone', 'owner_email', 'password', 'confirm_password']
      .every((name) => String(signupForm.elements[name]?.value || '').trim()),
    business: ['business_name', 'business_type']
      .every((name) => String(signupForm.elements[name]?.value || '').trim()),
    publish: Boolean(String(signupForm.elements.slug?.value || '').trim() && signupForm.elements.accept_terms?.checked)
  };
  signupProgress.querySelectorAll('[data-signup-progress]').forEach((item) => {
    item.classList.toggle('done', Boolean(completed[item.dataset.signupProgress]));
  });
}

function setSignupProgress(step) {
  if (!signupProgress) return;
  signupProgress.querySelectorAll('[data-signup-progress]').forEach((item) => {
    item.classList.toggle('active', item.dataset.signupProgress === step);
  });
}


async function initPasswordReset() {
  const params = new URLSearchParams(location.search);
  const token = params.get('token') || '';
  const intro = document.querySelector('#resetIntro');
  const emailInput = document.querySelector('#resetEmail');
  const message = document.querySelector('#portalResetPasswordMessage');
  const button = document.querySelector('#portalResetPasswordButton');

  if (!/^[a-f0-9]{32,128}$/i.test(token)) {
    if (intro) intro.textContent = 'Link de recuperação inválido.';
    portalResetPasswordForm.hidden = true;
    return;
  }

  try {
    const data = await request(`/api/portal/password-reset/${encodeURIComponent(token)}`);
    if (emailInput) emailInput.value = data.reset?.email || '';
    if (intro) intro.textContent = `Link válido até ${formatDateTime(data.reset?.expires_at)}.`;
  } catch (error) {
    if (intro) intro.textContent = error.message || 'Link inválido ou expirado.';
    portalResetPasswordForm.hidden = true;
    return;
  }

  portalResetPasswordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(portalResetPasswordForm);
    if (message) message.textContent = '';
    if (button) {
      button.disabled = true;
      button.textContent = 'Salvando...';
    }
    try {
      const data = await request(`/api/portal/password-reset/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: form.get('password'),
          confirm_password: form.get('confirm_password')
        })
      });
      if (message) message.textContent = data.message || 'Senha redefinida com sucesso.';
      setTimeout(() => {
        location.href = '/painel';
      }, 800);
    } catch (error) {
      if (message) message.textContent = error.message || 'Não foi possível redefinir a senha.';
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Salvar nova senha';
      }
    }
  });
}

let slugTimer = null;
function validateSlugSoon() {
  clearTimeout(slugTimer);
  slugTimer = setTimeout(validateSlug, 350);
}

async function validateSlug() {
  if (!slugInput || !slugStatus) return;
  const slug = slugInput.value.trim();
  if (!slug) {
    slugStatus.textContent = 'Escolha um endereço fácil de lembrar.';
    slugStatus.className = 'muted';
    return;
  }
  try {
    const data = await request(`/api/portal/slug?slug=${encodeURIComponent(slug)}`);
    slugInput.value = data.slug || slug;
    slugStatus.textContent = data.available ? 'Endereço disponível.' : data.reason || 'Endereço indisponível.';
    slugStatus.className = data.available ? 'slug-ok' : 'slug-error';
  } catch (error) {
    slugStatus.textContent = error.message || 'Não foi possível validar o endereço.';
    slugStatus.className = 'slug-error';
  }
}

async function submitSignup(event) {
  event.preventDefault();
  await validateSlug();
  const form = new FormData(signupForm);
  const payload = {
    plan_code: 'trial',
    accept_terms: form.get('accept_terms') === 'on',
    marketing_opt_in: form.get('marketing_opt_in') === 'on',
    owner: {
      name: form.get('owner_name'),
      email: form.get('owner_email'),
      phone: form.get('owner_phone'),
      password: form.get('password'),
      confirm_password: form.get('confirm_password')
    },
    business: {
      name: form.get('business_name'),
      display_name: form.get('business_name'),
      type: form.get('business_type'),
      city: form.get('city'),
      state: form.get('state'),
      address: form.get('address'),
      document: form.get('document'),
      phone: form.get('business_phone') || form.get('owner_phone'),
      slug: form.get('slug')
    }
  };
  setSignupLoading(true);
  try {
    const data = await request('/api/portal/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (data.needs_activation) {
      signupActivationEmail = String(payload.owner.email || '').trim();
      signupMessage.textContent = data.message || 'Conta criada. Confira seu e-mail para ativar o acesso.';
      renderSignupActivationActions();
      signupForm.classList.add('signup-created');
      setSignupLoading(false);
      if (signupSubmitButton) {
        signupSubmitButton.disabled = true;
        signupSubmitButton.textContent = 'Aguardando ativação por e-mail';
      }
      return;
    }
    signupMessage.textContent = 'Conta criada. Abrindo onboarding...';
    location.href = data.redirect || '/painel';
  } catch (error) {
    signupMessage.textContent = error.message || 'Não foi possível criar a conta.';
    setSignupLoading(false);
  }
}

function setSignupLoading(isLoading) {
  if (signupSubmitButton) {
    signupSubmitButton.disabled = isLoading;
    signupSubmitButton.textContent = isLoading ? 'Criando...' : 'Criar loja';
  }
}

function renderSignupActivationActions() {
  if (!signupMessage || document.querySelector('#resendActivationButton')) return;
  const actions = document.createElement('div');
  actions.className = 'portal-activation-actions';
  actions.innerHTML = `
    <span>O link expira em 24 horas. Confira também a caixa de spam ou lixo eletrônico.</span>
    <button class="portal-button small ghost" id="resendActivationButton" type="button">Reenviar confirmação</button>
  `;
  signupMessage.insertAdjacentElement('afterend', actions);
  actions.querySelector('#resendActivationButton')?.addEventListener('click', (event) => {
    resendSignupActivationEmail(event.currentTarget);
  });
}

async function resendSignupActivationEmail(button) {
  const email = signupActivationEmail || String(signupForm?.elements.owner_email?.value || '').trim();
  const originalText = button?.textContent || 'Reenviar confirmação';
  if (!email) {
    if (signupMessage) signupMessage.textContent = 'Informe o e-mail da conta para reenviar a confirmação.';
    return;
  }
  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Reenviando...';
    }
    const data = await request('/api/portal/resend-activation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (signupMessage) signupMessage.textContent = data.message || 'Enviamos um novo link de ativação.';
  } catch (error) {
    if (signupMessage) signupMessage.textContent = error.message || 'Não foi possível reenviar a confirmação agora.';
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

async function initAccountActivation() {
  const params = new URLSearchParams(location.search);
  const token = params.get('token') || '';
  const intro = document.querySelector('#activationIntro');
  const message = document.querySelector('#portalActivationMessage');
  if (!/^[a-f0-9]{32,128}$/i.test(token)) {
    if (intro) intro.textContent = 'Link de ativação inválido.';
    portalActivationButton.disabled = true;
    return;
  }
  try {
    const data = await request(`/api/portal/activate/${encodeURIComponent(token)}`);
    if (intro) {
      const email = data.activation?.email ? ` para ${data.activation.email}` : '';
      intro.textContent = `Link válido${email}. Clique no botão abaixo para liberar o painel.`;
    }
    portalActivationButton.disabled = false;
  } catch (error) {
    if (intro) intro.textContent = error.message || 'Link inválido ou expirado.';
    portalActivationButton.disabled = true;
    return;
  }
  portalActivationButton.addEventListener('click', async () => {
    portalActivationButton.disabled = true;
    portalActivationButton.textContent = 'Ativando...';
    if (message) message.textContent = '';
    try {
      const data = await request(`/api/portal/activate/${encodeURIComponent(token)}`, { method: 'POST' });
      if (message) message.textContent = data.message || 'Conta ativada com sucesso.';
      setTimeout(() => {
        location.href = data.redirect || '/painel';
      }, 500);
    } catch (error) {
      if (message) message.textContent = error.message || 'Não foi possível ativar a conta.';
      portalActivationButton.disabled = false;
      portalActivationButton.textContent = 'Ativar e entrar';
    }
  });
}

async function loadOnboarding() {
  try {
    const data = await request('/api/admin/onboarding');
    renderOnboarding(data);
  } catch (error) {
    onboardingChecklist.innerHTML = `
      <article class="onboarding-empty">
        <strong>Entre para continuar</strong>
        <span>${escapeHtml(error.message || 'Sua sessão expirou.')}</span>
        <a class="portal-button small" href="/entrar">Entrar</a>
      </article>
    `;
    if (onboardingMessage) onboardingMessage.textContent = 'Faça login para ver seu checklist.';
  }
}

async function setupAdminStoreHomeLinks() {
  const links = document.querySelectorAll('[data-admin-store-home]');
  if (!links.length) return;
  const data = await request('/api/admin/me');
  const store = data.admin?.active_store || data.admin?.stores?.[0] || null;
  const href = store?.public_url || (store?.slug ? '/' + store.slug : '/cardapio');
  links.forEach((link) => {
    link.href = href;
  });
}

function renderOnboarding(data) {
  if (onboardingProgress) onboardingProgress.textContent = `${data.percent || 0}%`;
  if (onboardingMessage) {
    onboardingMessage.textContent = data.can_publish
      ? 'Tudo pronto para publicar o cardápio.'
      : `Faltam: ${(data.blockers || []).join(', ') || 'alguns passos'}.`;
  }
  onboardingChecklist.innerHTML = (data.steps || []).map((step) => `
    <button class="onboarding-task ${step.completed ? 'done' : ''}" data-step="${escapeAttribute(step.key)}" type="button">
      <strong>${escapeHtml(step.title)}</strong>
      <span>${escapeHtml(step.completed ? 'Concluído' : step.description)}</span>
    </button>
  `).join('');
  onboardingChecklist.querySelectorAll('[data-step]').forEach((button) => {
    button.addEventListener('click', () => markOnboardingStep(button.dataset.step));
  });
  if (onboardingPublishButton) {
    onboardingPublishButton.disabled = !data.can_publish || data.progress?.is_completed;
    onboardingPublishButton.textContent = data.progress?.is_completed ? 'Cardápio publicado' : 'Publicar cardápio';
    onboardingPublishButton.onclick = publishOnboarding;
  }
}

async function markOnboardingStep(step) {
  if (!step) return;
  const data = await request('/api/admin/onboarding', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed_steps: [step], current_step: step })
  });
  renderOnboarding(data);
}

async function publishOnboarding() {
  if (!onboardingPublishButton) return;
  onboardingPublishButton.disabled = true;
  onboardingPublishButton.textContent = 'Publicando...';
  try {
    const data = await request('/api/admin/onboarding/publish', { method: 'POST' });
    renderOnboarding(data);
    if (onboardingMessage) onboardingMessage.textContent = 'Cardápio publicado e pronto para receber pedidos.';
  } catch (error) {
    if (onboardingMessage) onboardingMessage.textContent = error.message || 'Não foi possível publicar.';
    onboardingPublishButton.disabled = false;
    onboardingPublishButton.textContent = 'Publicar cardápio';
  }
}

async function initInviteAccept() {
  const params = new URLSearchParams(location.search);
  const token = params.get('token') || '';
  const intro = document.querySelector('#inviteIntro');
  const message = document.querySelector('#inviteMessage');
  const nameInput = document.querySelector('#inviteName');
  const emailInput = document.querySelector('#inviteEmail');
  const button = document.querySelector('#inviteAcceptButton');
  if (!token) {
    if (message) message.textContent = 'Convite não informado.';
    button.disabled = true;
    return;
  }
  try {
    const data = await request(`/api/portal/invitations/${encodeURIComponent(token)}`);
    if (intro) intro.textContent = `Convite para ${roleLabel(data.invitation.role)}.`;
    if (nameInput) nameInput.value = data.invitation.name || '';
    if (emailInput) emailInput.value = data.invitation.email || '';
  } catch (error) {
    if (message) message.textContent = error.message || 'Convite inválido.';
    button.disabled = true;
    return;
  }
  inviteAcceptForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(inviteAcceptForm);
    button.disabled = true;
    button.textContent = 'Criando...';
    if (message) message.textContent = '';
    try {
      await request(`/api/portal/invitations/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          password: form.get('password'),
          confirm_password: form.get('confirm_password')
        })
      });
      location.href = '/painel';
    } catch (error) {
      if (message) message.textContent = error.message || 'Não foi possível aceitar o convite.';
      button.disabled = false;
      button.textContent = 'Criar acesso';
    }
  });
}

function roleLabel(role) {
  return ({
    admin: 'administrador',
    waiter: 'garçom',
    attendant: 'atendimento',
    delivery: 'entrega',
    kitchen: 'cozinha'
  })[role] || 'equipe';
}

function renderPlan(plan) {
  const price = Number(plan.monthly_price || 0);
  const features = portalPlanHighlights(plan).map((feature) => `<li>${escapeHtml(feature)}</li>`).join('');
  const isTrial = isTrialPlan(plan);
  return `
    <article class="portal-plan-card">
      <p class="eyebrow">${isTrial ? 'Teste grátis' : /professional|profissional/i.test(`${plan.code} ${plan.name}`) ? 'Mais escolhido' : 'Plano'}</p>
      <h3>${escapeHtml(plan.name)}</h3>
      <strong>${price > 0 ? formatMoney(price) + '/mês' : 'R$ 0 no teste'}</strong>
      <p>${escapeHtml(plan.description || '')}</p>
      <ul>${features}</ul>
      <a class="portal-button small" href="/cadastro">Começar teste</a>
    </article>
  `;
}

function isTrialPlan(plan) {
  const code = String(plan?.code || '').toLowerCase();
  const name = String(plan?.name || '').toLowerCase();
  return Number(plan?.monthly_price || 0) <= 0 || code.includes('trial') || name.includes('teste');
}

function portalPlanHighlights(plan) {
  const code = String(plan?.code || '').toLowerCase();
  if (code.includes('trial')) return ['Até 10 produtos', 'Até 3 categorias', 'Até 30 pedidos', '1 usuário'];
  if (code.includes('essential')) return ['Até 25 produtos', 'Até 150 pedidos/mês', '1 usuário', 'WhatsApp manual'];
  if (code.includes('professional')) return ['Até 100 produtos', 'Pedidos ilimitados', 'Até 5 usuários', 'Mesas, cupons, KDS e relatórios'];
  if (code.includes('premium')) return ['Produtos ilimitados', 'Automação WhatsApp', 'Fidelidade e domínio próprio', 'Suporte prioritário'];
  return (plan.features || []).slice(0, 4).map((feature) => {
    const limit = feature.limit_value === null || feature.limit_value === undefined ? '' : ` até ${feature.limit_value}`;
    return `${feature.name || feature.code}${limit}`;
  });
}

async function request(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Erro na solicitação.');
  return data;
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b([a-z0-9])[\s._-]+(?=[a-z0-9]\b)/g, '$1')
    .replace(/\b([a-z0-9])[\s._-]+(?=[a-z0-9]\b)/g, '$1')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
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

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
}
