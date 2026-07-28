const HELP_CATEGORIES = [
  'Todos',
  'Primeiros passos',
  'Cadastro e login',
  'Configuração da loja',
  'Cardápio e produtos',
  'Pedidos',
  'WhatsApp',
  'Pagamento online',
  'Mesas e QR Code',
  'Planos e assinatura',
  'Suporte'
];

const HELP_ARTICLES = [
  article('como-criar-conta', 'Como criar sua conta no TáPronto', 'Primeiros passos', 'Cadastre sua loja e comece o teste grátis sem cartão de crédito.', [
    'Acesse /cadastro e informe seus dados de responsável.',
    'Preencha nome da loja, telefone e endereço público do cardápio.',
    'Aceite os termos e clique em Criar Conta.',
    'Confirme o e-mail quando a ativação estiver habilitada.',
    'Entre no painel e siga o checklist de primeira configuração.'
  ], 'Use um e-mail que você acessa com frequência. Ele será usado para login, recuperação de senha e avisos importantes.'),
  article('confirmar-email', 'Como confirmar seu e-mail', 'Cadastro e login', 'Entenda a ativação da conta e o reenvio do link de confirmação.', [
    'Depois do cadastro, abra a caixa de entrada do e-mail informado.',
    'Procure a mensagem da equipe TáPronto.',
    'Clique no botão de confirmação da conta.',
    'Se não encontrar, verifique spam/lixo eletrônico.',
    'Use o botão Reenviar confirmação na tela de cadastro quando necessário.'
  ], 'A confirmação reduz spam e protege o painel contra contas falsas.'),
  article('recuperar-senha', 'Como recuperar sua senha', 'Cadastro e login', 'Receba um link seguro para criar uma nova senha.', [
    'Acesse app.taprontomenu.com.br.',
    'Clique em Esqueceu a senha?.',
    'Informe o e-mail cadastrado.',
    'Abra o link recebido no e-mail.',
    'Cadastre uma nova senha com pelo menos 8 caracteres.'
  ], 'Se o e-mail não chegar, confirme se o endereço digitado é o mesmo da conta.'),
  article('configurar-dados-loja', 'Como configurar os dados da loja', 'Configuração da loja', 'Atualize nome, descrição, endereço e informações exibidas ao cliente.', [
    'Entre no painel.',
    'Acesse Configurações da Loja.',
    'Abra Identidade da loja.',
    'Preencha nome, descrição, endereço e complemento.',
    'Clique em Salvar loja e abra o cardápio para conferir.'
  ], 'Esses dados aparecem antes do cliente finalizar o pedido.'),
  article('escolher-link-cardapio', 'Como escolher o link público do cardápio', 'Configuração da loja', 'Crie um endereço simples para divulgar sua loja.', [
    'No cadastro ou em Configurações da Loja, encontre o campo Caminho da loja.',
    'Use letras, números e no máximo um hífen entre palavras.',
    'Evite pontos, espaços, acentos e muitos símbolos.',
    'Confira se o endereço está disponível.',
    'Salve e divulgue o link.'
  ], 'Exemplo bom: napiolanches. Evite algo como l-s-k-burger se o nome puder ficar mais simples.'),
  article('abrir-fechar-loja', 'Como abrir ou fechar a loja', 'Configuração da loja', 'Controle quando o cardápio pode receber pedidos.', [
    'Acesse a aba Operação.',
    'Confira o card de status da loja.',
    'Clique em Iniciar operação para deixar online.',
    'Clique em Parar operação quando não quiser receber pedidos.',
    'O cliente verá aviso se a loja estiver fechada.'
  ], 'Use os horários de funcionamento para evitar pedidos fora do expediente.'),
  article('cadastrar-categoria', 'Como cadastrar uma categoria', 'Cardápio e produtos', 'Organize produtos por grupos como burgers, bebidas e sobremesas.', [
    'Acesse Cardápio.',
    'Entre na aba Categorias.',
    'Clique em Nova categoria.',
    'Informe nome, descrição e ordem de exibição.',
    'Salve e confira a lista atualizada.'
  ], 'Categorias claras ajudam o cliente a encontrar o que quer mais rápido.'),
  article('cadastrar-produto', 'Como cadastrar um produto', 'Cardápio e produtos', 'Crie itens com nome, preço, foto, descrição e disponibilidade.', [
    'Acesse Cardápio e abra Produtos.',
    'Clique em Novo produto.',
    'Escolha a categoria.',
    'Preencha nome, descrição e preço de venda.',
    'Envie uma foto bonita e marque se o produto está disponível.',
    'Salve e abra o cardápio público para conferir.'
  ], 'Fotos reais e descrições curtas costumam vender melhor.'),
  article('adicionar-foto-produto', 'Como adicionar foto ao produto', 'Cardápio e produtos', 'Use imagens para deixar seu cardápio mais profissional.', [
    'Abra o cadastro ou edição do produto.',
    'Clique no campo de imagem.',
    'Escolha uma foto nítida do produto.',
    'Aguarde o envio finalizar.',
    'Salve o produto.'
  ], 'Prefira fotos horizontais, bem iluminadas e sem texto por cima.'),
  article('configurar-adicionais', 'Como configurar adicionais', 'Cardápio e produtos', 'Permita extras como bacon, queijo, molhos e acompanhamentos.', [
    'Acesse Cardápio.',
    'Abra a aba Adicionais.',
    'Crie um grupo, por exemplo Extras.',
    'Cadastre opções com nome e valor.',
    'Vincule o adicional aos produtos desejados.'
  ], 'Adicionais aparecem no pedido apenas como nome e valor, deixando a cozinha entender rápido.'),
  article('receber-pedido', 'Como receber um pedido', 'Pedidos', 'Veja o pedido chegando no painel e acompanhe o preparo.', [
    'Deixe a loja aberta em Operação.',
    'Quando o cliente finalizar, o pedido aparece em Pedidos.',
    'Clique no card para ver itens, adicionais, entrega e pagamento.',
    'Mude o status conforme o andamento.',
    'Use impressão ou WhatsApp conforme seu plano.'
  ], 'A tela de pedidos atualiza automaticamente em curto intervalo.'),
  article('mudar-status-pedido', 'Como mudar o status de um pedido', 'Pedidos', 'Organize a fila por novo, aceito, preparando, pronto e entregue.', [
    'Abra a aba Pedidos.',
    'Clique no pedido desejado.',
    'Use o seletor de status no card.',
    'Escolha o novo status.',
    'A lista será atualizada sem precisar dar F5.'
  ], 'Manter status correto evita confusão entre balcão, cozinha e entrega.'),
  article('whatsapp-manual', 'Como usar WhatsApp manual', 'WhatsApp', 'Envie o pedido pelo WhatsApp quando seu plano usar envio manual.', [
    'Abra a aba Pedidos.',
    'Clique em Ver detalhes no pedido.',
    'Use o botão WhatsApp manual quando disponível.',
    'Confira a mensagem antes de enviar.',
    'Envie para o número cadastrado da loja.'
  ], 'No Teste grátis e Essencial, o recurso principal é WhatsApp manual.'),
  article('whatsapp-automatico', 'Como conectar WhatsApp automático', 'WhatsApp', 'Conecte o celular da loja por QR Code para notificações automáticas.', [
    'Acesse Integrações.',
    'Clique em Conectar WhatsApp.',
    'Escaneie o QR Code com o celular da loja.',
    'Mantenha o celular com internet.',
    'Use Testar mensagem para confirmar a conexão.'
  ], 'WhatsApp automático depende do plano e da configuração do provedor feita pela TáPronto.'),
  article('configurar-pix-online', 'Como configurar Pix online', 'Pagamento online', 'Conecte Abacate Pay para receber pagamento antes de enviar o pedido.', [
    'Acesse Integrações.',
    'Ative Pix online.',
    'Cole a API key da Abacate Pay.',
    'Cadastre a URL de webhook exibida no painel da Abacate Pay.',
    'Salve e teste um pedido de baixo valor.'
  ], 'Se preferir, solicite configuração assistida pela equipe TáPronto.'),
  article('como-funciona-pagamento-online', 'Como funciona o pagamento online', 'Pagamento online', 'Entenda quando o pedido é enviado para a loja.', [
    'O cliente monta a sacola e escolhe pagamento online.',
    'Ao confirmar, abre uma janela de pagamento da Abacate Pay.',
    'O pedido fica aguardando confirmação.',
    'Quando o pagamento é confirmado, o pedido é liberado para a loja.',
    'Depois disso, o sistema pode enviar a notificação no WhatsApp.'
  ], 'Se o pagamento não for confirmado, o pedido não deve entrar como pedido pago da operação.'),
  article('criar-mesas-qrcode', 'Como criar mesas e QR Codes', 'Mesas e QR Code', 'Gere mesas separadas por loja e imprima QR Codes.', [
    'Acesse Mesas.',
    'Clique em Criar mesa.',
    'O sistema gera códigos como mesa-1, mesa-2 por loja.',
    'Abra o QR Code da mesa.',
    'Imprima e coloque na mesa correspondente.'
  ], 'Duas lojas diferentes podem ter mesa-1. A mesma loja não pode duplicar a mesma mesa.'),
  article('trocar-plano', 'Como trocar de plano', 'Planos e assinatura', 'Veja limites, recursos e faça upgrade quando precisar.', [
    'Acesse Plano.',
    'Confira o plano atual, cobrança e limites.',
    'Clique em mudar plano ou regularizar pagamento.',
    'Revise o resumo do checkout.',
    'Conclua o pagamento para liberar o plano.'
  ], 'Downgrade não apaga dados, mas pode bloquear novas criações acima do limite.'),
  article('abrir-chamado-suporte', 'Como abrir um chamado de suporte', 'Suporte', 'Peça ajuda para a equipe TáPronto pelo painel.', [
    'Entre no painel.',
    'Acesse Suporte.',
    'Clique em Abrir chamado.',
    'Informe nome de contato, assunto, categoria e descrição.',
    'Acompanhe respostas no histórico de chamados.'
  ], 'Descreva o que você estava tentando fazer e, se possível, envie o texto do erro.'),
  article('acompanhar-chamado', 'Como acompanhar respostas do suporte', 'Suporte', 'Veja o histórico e responda a equipe sem perder contexto.', [
    'Acesse Suporte.',
    'Use os filtros de status para encontrar o chamado.',
    'Clique no chamado para abrir a conversa.',
    'Leia a resposta da equipe.',
    'Envie uma nova mensagem ou encerre o atendimento quando resolver.'
  ], 'Notas internas da equipe não aparecem para o lojista.')
];

const state = {
  category: 'Todos',
  query: ''
};

const els = {
  search: document.querySelector('#helpSearch'),
  clearSearch: document.querySelector('#helpClearSearch'),
  categories: document.querySelector('#helpCategoryList'),
  featured: document.querySelector('#helpFeaturedGrid'),
  list: document.querySelector('#helpArticleList'),
  empty: document.querySelector('#helpEmpty'),
  title: document.querySelector('#helpResultsTitle'),
  count: document.querySelector('#helpResultsCount'),
  panel: document.querySelector('#helpArticlePanel'),
  detail: document.querySelector('#helpArticleDetail'),
  back: document.querySelector('#helpBackButton')
};

initHelp();

function article(slug, title, category, summary, steps, tip = '') {
  return { slug, title, category, summary, steps, tip };
}

function initHelp() {
  renderCategories();
  renderArticles();
  openHashArticle();

  els.search?.addEventListener('input', () => {
    state.query = normalizeText(els.search.value);
    renderArticles();
  });
  els.clearSearch?.addEventListener('click', () => {
    if (els.search) els.search.value = '';
    state.query = '';
    renderArticles();
    els.search?.focus();
  });
  els.back?.addEventListener('click', () => {
    history.pushState('', document.title, location.pathname);
    renderArticles();
  });
  window.addEventListener('hashchange', openHashArticle);
}

function renderCategories() {
  if (!els.categories) return;
  els.categories.innerHTML = HELP_CATEGORIES.map((category) => {
    const count = category === 'Todos'
      ? HELP_ARTICLES.length
      : HELP_ARTICLES.filter((articleItem) => articleItem.category === category).length;
    return `<button class="${category === state.category ? 'is-active' : ''}" type="button" data-help-category="${escapeAttribute(category)}">${escapeHtml(category)} <span>${count}</span></button>`;
  }).join('');

  els.categories.querySelectorAll('[data-help-category]').forEach((button) => {
    button.addEventListener('click', () => {
      state.category = button.dataset.helpCategory || 'Todos';
      renderCategories();
      renderArticles();
    });
  });
}

function renderArticles() {
  const filtered = getFilteredArticles();
  const featured = filtered.slice(0, 3);
  if (els.title) els.title.textContent = state.category === 'Todos' && !state.query ? 'Artigos populares' : 'Resultados encontrados';
  if (els.count) els.count.textContent = `${filtered.length} artigo${filtered.length === 1 ? '' : 's'}`;
  if (els.empty) els.empty.hidden = filtered.length > 0;

  if (els.featured) {
    els.featured.innerHTML = featured.map((articleItem) => `
      <button class="help-featured-card" type="button" data-help-open="${escapeAttribute(articleItem.slug)}">
        <strong>${escapeHtml(articleItem.title)}</strong>
        <p>${escapeHtml(articleItem.summary)}</p>
      </button>
    `).join('');
  }

  if (els.list) {
    els.list.innerHTML = filtered.map((articleItem) => `
      <button class="help-article-card" type="button" data-help-open="${escapeAttribute(articleItem.slug)}">
        <span class="help-article-icon" aria-hidden="true">${escapeHtml(categoryIcon(articleItem.category))}</span>
        <span>
          <strong>${escapeHtml(articleItem.title)}</strong>
          <p>${escapeHtml(articleItem.summary)}</p>
        </span>
        <span class="help-article-category">${escapeHtml(articleItem.category)}</span>
      </button>
    `).join('');
  }

  document.querySelectorAll('[data-help-open]').forEach((button) => {
    button.addEventListener('click', () => openArticle(button.dataset.helpOpen || ''));
  });

  showArticleList();
}

function getFilteredArticles() {
  return HELP_ARTICLES.filter((articleItem) => {
    const matchesCategory = state.category === 'Todos' || articleItem.category === state.category;
    const haystack = normalizeText(`${articleItem.title} ${articleItem.category} ${articleItem.summary} ${articleItem.steps.join(' ')}`);
    const matchesQuery = !state.query || haystack.includes(state.query);
    return matchesCategory && matchesQuery;
  });
}

function openHashArticle() {
  const slug = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (slug) openArticle(slug, false);
}

function openArticle(slug, updateHash = true) {
  const articleItem = HELP_ARTICLES.find((item) => item.slug === slug);
  if (!articleItem || !els.panel || !els.detail) return;
  if (updateHash) history.pushState('', document.title, `#${articleItem.slug}`);
  hideArticleList();
  const related = HELP_ARTICLES
    .filter((item) => item.category === articleItem.category && item.slug !== articleItem.slug)
    .slice(0, 4);
  els.detail.innerHTML = `
    <p class="help-eyebrow">${escapeHtml(articleItem.category)}</p>
    <h1>${escapeHtml(articleItem.title)}</h1>
    <div class="article-meta">
      <span>Guia rápido</span>
      <span>${articleItem.steps.length} passos</span>
    </div>
    <p>${escapeHtml(articleItem.summary)}</p>
    <ol>
      ${articleItem.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}
    </ol>
    ${articleItem.tip ? `<strong class="help-tip">Dica: ${escapeHtml(articleItem.tip)}</strong>` : ''}
    ${related.length ? `
      <h2>Artigos relacionados</h2>
      <div class="help-related">
        ${related.map((item) => `<button type="button" data-help-open="${escapeAttribute(item.slug)}">${escapeHtml(item.title)}</button>`).join('')}
      </div>
    ` : ''}
  `;
  els.panel.hidden = false;
  if (els.title) els.title.textContent = 'Artigo selecionado';
  if (els.count) els.count.textContent = articleItem.category;
  els.panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
  els.panel.querySelectorAll('[data-help-open]').forEach((button) => {
    button.addEventListener('click', () => openArticle(button.dataset.helpOpen || ''));
  });
}

function hideArticleList() {
  if (els.featured) els.featured.hidden = true;
  if (els.list) els.list.hidden = true;
  if (els.empty) els.empty.hidden = true;
}

function showArticleList() {
  if (els.panel) els.panel.hidden = true;
  if (els.featured) els.featured.hidden = false;
  if (els.list) els.list.hidden = false;
}

function categoryIcon(category) {
  const icons = {
    'Primeiros passos': '1',
    'Cadastro e login': '@',
    'Configuração da loja': 'L',
    'Cardápio e produtos': 'P',
    Pedidos: '#',
    WhatsApp: 'W',
    'Pagamento online': '$',
    'Mesas e QR Code': 'QR',
    'Planos e assinatura': 'R$',
    Suporte: '?'
  };
  return icons[category] || 'i';
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}
