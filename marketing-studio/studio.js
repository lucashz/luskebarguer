const $ = (selector) => document.querySelector(selector);
const production = location.pathname === '/marketing' || location.pathname.startsWith('/marketing/');
const basePath = production ? '/marketing' : '';
if (production && window.parent !== window && new URLSearchParams(location.search).get('embedded') === '1') document.body.classList.add('embedded');
if (document.body.classList.contains('embedded') && new URLSearchParams(location.search).get('view') === 'profile') { document.body.classList.add('profile-only'); document.querySelector('#profilePanel').open = true; }
let activationToken = new URLSearchParams(location.hash.slice(1)).get('activate') || '';
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let state; let csrf = ''; let selectedPost = ''; let selectedVersion = ''; let busy = false; let dirty = false;
let canvaStatus = { configured: false, connected: false };
const referenceSelection = new Set();
const imageUrl = (id) => `${basePath}/api/assets/${encodeURIComponent(id)}`;
function message(text, error = false) { $('#status').textContent = text; $('#status').classList.toggle('error', error); }
async function api(url, method = 'GET', data) {
  const response = await fetch(basePath + url, { method, headers: { 'Content-Type': 'application/json', 'X-Studio-Csrf': csrf }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const result = await response.json();
  if (response.status === 401 && document.body.classList.contains('embedded')) window.parent.postMessage({ type: 'clinic-session-expired' }, location.origin);
  if (!response.ok) throw Object.assign(new Error(result.error || 'Não foi possível concluir.'), { status: response.status });
  return result;
}
function current() {
  const post = state?.posts.find((post) => post.id === selectedPost);
  return { post, version: post?.versions.find((version) => version.id === selectedVersion) };
}
async function saveDirty() {
  if (!dirty) return;
  const { post, version } = current();
  await api('/api/caption', 'PUT', { postId: post.id, versionId: version.id, caption: $('#caption').value }); dirty = false;
}
async function loadProfile() {
  if (!production) return;
  const profile = await api('/api/profile');
  $('#profilePanel').hidden = false;
  $('#profileForm').elements.displayName.value = profile.displayName;
  $('#profileForm').elements.email.value = profile.email;
  $('#profileAccount').textContent = `Usuário: ${profile.username} · ${profile.role === 'admin' ? 'Administrador' : 'Editor'}`;
  $('#passwordNotice').textContent = profile.sharedClinicPassword ? 'Esta senha também é usada no sistema da clínica. Após a alteração, entre novamente no marketing.' : 'A senha é exclusiva desta conta de marketing. Após a alteração, entre novamente.';
  $('#profilePhoto').hidden = !profile.hasPhoto;
  if (profile.hasPhoto) $('#profilePhoto').src = `${basePath}/api/profile/photo?t=${Date.now()}`;
  else $('#profilePhoto').removeAttribute('src');
}
async function uploadProfilePhoto(file) {
  if (file.size > 2 * 1024 * 1024) throw new Error('Envie uma foto de até 2 MB.');
  const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
  await api('/api/profile/photo', 'PUT', { base64 }); await loadProfile(); window.parent.postMessage({ type: 'clinic-profile-updated' }, location.origin); message('Foto atualizada.');
}
async function action(fn, pending = 'Salvando…') {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button, input, textarea, select').forEach((el) => { el.disabled = true; });
  message(pending);
  try { await fn(); }
  catch (error) { if (production && error.status === 401) { $('#loginPanel').hidden = false; $('#workspace').hidden = true; $('#logout').hidden = true; state = null; } message(error.message, true); }
  finally { busy = false; document.querySelectorAll('button, input, textarea, select').forEach((el) => { el.disabled = false; }); if (state) $('#generateCaption').disabled = !state.captionReady; applyCanvaControls(); }
}
function populateBrand() {
  for (const [key, value] of Object.entries(state.brand)) if ($('#brandForm').elements[key]) $('#brandForm').elements[key].value = value;
}
async function refresh() {
  state = await api('/api/studio'); csrf = state.csrf;
  $('#workspace').hidden = false;
  $('#loginPanel').hidden = true; $('#logout').hidden = !production;
  $('#organization').textContent = state.brand.name || state.organization;
  $('#usage').textContent = `Este mês: ${state.usage.images}/${state.usage.limits.images} tentativas de imagem · ${state.usage.captions}/${state.usage.limits.captions} de legenda`;
  $('#providerHint').textContent = state.provider === 'local' ? 'Composição local, sem custo de IA. Usa a primeira referência selecionada. Ajustes disponíveis: “clarear” e “escurecer”.' : 'Uma imagem por pedido. A geração pode levar alguns minutos. Os ajustes “clarear” e “escurecer” são locais, sem custo de IA.';
  const references = state.assets.filter((asset) => asset.kind === 'reference');
  $('#references').innerHTML = references.length ? references.map((asset) => `<label class="reference"><input type="checkbox" value="${asset.id}" ${referenceSelection.has(asset.id) ? 'checked' : ''}><img src="${imageUrl(asset.id)}" alt="${esc(asset.name)}"><span>${esc(asset.name)}</span></label>`).join('') : '<p class="hint">Sua biblioteca começa aqui. Envie uma referência ou crie apenas com o assunto.</p>';
  const logoValue = $('#logoSelect').value || state.brand.logoId;
  $('#logoSelect').innerHTML = '<option value="">Sem logo</option>' + references.map((asset) => `<option value="${asset.id}">${esc(asset.name)}</option>`).join(''); $('#logoSelect').value = logoValue;
  $('#history').innerHTML = state.posts.length ? state.posts.map((post) => `<button type="button" data-post="${post.id}" aria-pressed="${post.id === selectedPost}"><img src="${imageUrl(post.versions.at(-1).assetId)}" alt="${esc(post.subject)}" loading="lazy"><span>${esc(post.subject)}</span><small>${post.versions.length} versão(ões) · ${esc(post.format)}</small></button>`).join('') : '<p class="hint">Seus posts e versões ficarão salvos aqui.</p>';
  renderEditor();
  await refreshCanva();
}
async function refreshCanva() {
  if (!production) { $('#canvaStatus').textContent = 'A conexão com o Canva fica disponível em produção.'; applyCanvaControls(); return; }
  canvaStatus = await api('/api/canva/status');
  applyCanvaControls();
  $('#canvaStatus').textContent = canvaStatus.connected ? 'Conta Canva conectada. Pesquise seus designs e escolha uma referência.' : canvaStatus.configured ? 'Conecte sua conta Canva para pesquisar seus designs.' : 'Integração Canva aguardando as credenciais do aplicativo.';
}
function applyCanvaControls() {
  $('#connectCanva').hidden = canvaStatus.connected;
  $('#connectCanva').disabled = busy || !production || !canvaStatus.configured;
  $('#searchCanva').disabled = busy || !canvaStatus.connected;
  $('#canvaSearch').disabled = busy || !canvaStatus.connected;
}
function renderEditor() {
  const { post, version } = current();
  $('#editor').hidden = !version; $('#emptyPreview').hidden = Boolean(version);
  if (!version) return;
  $('#previewTitle').textContent = post.subject;
  $('#preview').src = imageUrl(version.assetId);
  $('#versions').innerHTML = post.versions.map((item, i) => `<option value="${item.id}" ${item.id === version.id ? 'selected' : ''}>Versão ${i + 1}${item.adjustment ? ` · ${esc(item.adjustment.slice(0, 40))}` : ' · Original'}</option>`).join('');
  $('#download').href = `${imageUrl(version.assetId)}?download`;
  $('#caption').value = version.caption; dirty = false;
  $('#generateCaption').disabled = !state.captionReady;
  $('#generateCaption').title = state.captionReady ? '' : 'Configure a chave do provedor para gerar legendas pela imagem.';
}
async function generate(data) {
  // Keep the same key if the browser loses the response. Only explicit actions call this function.
  const signature = JSON.stringify(data);
  const stored = JSON.parse(sessionStorage.getItem('studio-request') || 'null');
  const request = stored?.signature === signature ? stored : { signature, key: crypto.randomUUID() };
  sessionStorage.setItem('studio-request', JSON.stringify(request));
  let result = await api('/api/generate', 'POST', { ...data, key: request.key });
  if (result.job) {
    const key = result.job;
    for (let attempt = 0; attempt < 150; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const job = await api(`/api/jobs/${encodeURIComponent(key)}`);
      if (job.status === 'failed') { sessionStorage.removeItem('studio-request'); throw new Error(job.error); }
      if (job.status === 'done') { result = job.result; break; }
    }
    if (result.job) throw new Error('A geração continua registrada. Confira o histórico antes de reenviar.');
  }
  sessionStorage.removeItem('studio-request');
  selectedPost = result.postId; selectedVersion = result.versionId;
  await refresh();
  message(data.kind === 'caption' ? 'Legenda pronta. Revise antes de publicar.' : 'Imagem pronta. Você pode ajustar ou preparar a legenda.');
  return result;
}
$('#brandForm').addEventListener('submit', (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); action(async () => { await saveDirty(); await api('/api/brand', 'PUT', data); await refresh(); populateBrand(); $('#brandPanel').open = false; message('Identidade salva.'); }); });
$('#references').addEventListener('change', (event) => {
  const checkbox = event.target;
  if (checkbox.checked && referenceSelection.size >= 3) { checkbox.checked = false; message('Selecione até 3 referências.', true); return; }
  checkbox.checked ? referenceSelection.add(checkbox.value) : referenceSelection.delete(checkbox.value);
});
$('#connectCanva').addEventListener('click', () => {
  const popup = window.open('about:blank', 'canva-connect', 'width=720,height=780');
  action(async () => {
    const result = await api('/api/canva/connect', 'POST', {});
    if (popup) popup.location = result.url; else location.href = result.url;
    for (let attempt = 0; attempt < 120 && !canvaStatus.connected; attempt++) { await new Promise(resolve => setTimeout(resolve, 2000)); await refreshCanva(); }
    if (canvaStatus.connected) { if (popup && !popup.closed) popup.close(); message('Conta Canva conectada. Faça sua pesquisa.'); }
  }, 'Abrindo o Canva…');
});
$('#searchCanva').addEventListener('click', () => action(async () => {
  const term = $('#canvaSearch').value.trim() || $('#createForm').elements.subject.value.trim();
  if (!term) throw new Error('Digite um assunto para pesquisar no Canva.');
  const result = await api(`/api/canva/search?q=${encodeURIComponent(term)}`);
  $('#canvaResults').innerHTML = result.items.length ? result.items.map(item => `<article class="library-item"><img src="${basePath}/api/canva/thumb/${encodeURIComponent(item.id)}" alt="${esc(item.title)}" loading="lazy"><strong title="${esc(item.title)}">${esc(item.title)}</strong><button type="button" data-canva-id="${esc(item.id)}" data-canva-title="${esc(item.title)}">Usar referência</button>${item.editUrl ? `<a href="${esc(item.editUrl)}" target="_blank" rel="noopener noreferrer">Abrir no Canva</a>` : ''}</article>`).join('') : '<p class="hint">Nenhum design da sua conta corresponde a essa pesquisa.</p>';
  message(`${result.items.length} designs encontrados na sua conta Canva.`);
}, 'Pesquisando no Canva…'));
$('#canvaResults').addEventListener('click', event => {
  const button = event.target.closest('[data-canva-id]'); if (!button) return;
  action(async () => {
    if (referenceSelection.size >= 3) throw new Error('Selecione até 3 referências.');
    const asset = await api('/api/canva/import', 'POST', { id: button.dataset.canvaId, title: button.dataset.canvaTitle });
    referenceSelection.add(asset.id); await refresh();
    const checkbox = $(`#references input[value="${asset.id}"]`); if (checkbox) checkbox.checked = true;
    message('Design do Canva adicionado e selecionado como referência.');
  }, 'Importando referência do Canva…');
});
$('#addReferenceUrl').addEventListener('click', () => action(async () => {
  if (referenceSelection.size >= 3) throw new Error('Selecione até 3 referências.');
  const url = $('#referenceUrl').value.trim(); if (!url) throw new Error('Cole o link direto de uma imagem.');
  const asset = await api('/api/references/url', 'POST', { url });
  referenceSelection.add(asset.id); $('#referenceUrl').value = ''; await refresh();
  const checkbox = $(`#references input[value="${asset.id}"]`); if (checkbox) checkbox.checked = true;
  message('Imagem do link adicionada e selecionada como referência.');
}, 'Importando imagem do link…'));
$('#upload').addEventListener('change', (event) => {
  const file = event.target.files[0]; if (!file) return;
  action(async () => {
    await saveDirty();
    if (referenceSelection.size >= 3) throw new Error('Selecione até 3 referências antes de enviar outra imagem.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Envie uma imagem de até 5 MB.');
    const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
    const asset = await api('/api/references', 'POST', { name: file.name, base64 });
    referenceSelection.add(asset.id); await refresh();
    message('Imagem adicionada e selecionada como referência.');
  });
});
$('#createForm').addEventListener('submit', (event) => {
  event.preventDefault(); const fields = Object.fromEntries(new FormData(event.currentTarget));
  action(async () => {
    await saveDirty();
    const image = await generate({ kind: 'image', ...fields, referenceIds: [...referenceSelection] });
    try { await generate({ kind: 'caption', postId: image.postId, versionId: image.versionId }); }
    catch (error) { throw new Error(`A imagem foi criada, mas a descrição falhou: ${error.message}`); }
  }, 'Gerando imagem e descrição…');
});
$('#adjustForm').addEventListener('submit', (event) => {
  event.preventDefault(); const adjustment = event.currentTarget.elements.adjustment.value;
  action(async () => { await saveDirty(); await generate({ kind: 'image', postId: selectedPost, versionId: selectedVersion, adjustment }); }, 'Criando uma nova versão…');
});
$('#generateCaption').addEventListener('click', () => action(async () => { await saveDirty(); await generate({ kind: 'caption', postId: selectedPost, versionId: selectedVersion }); }, 'Lendo a imagem e preparando a legenda…'));
$('#caption').addEventListener('input', () => { dirty = true; });
$('#captionForm').addEventListener('submit', (event) => { event.preventDefault(); action(async () => { await saveDirty(); message('Legenda salva. A imagem continua a mesma.'); }); });
$('#copyCaption').addEventListener('click', () => action(async () => { await navigator.clipboard.writeText($('#caption').value); message('Legenda copiada.'); }));
$('#history').addEventListener('click', (event) => { const button = event.target.closest('[data-post]'); if (!button) return; action(async () => { await saveDirty(); selectedPost = button.dataset.post; selectedVersion = state.posts.find((post) => post.id === selectedPost).versions.at(-1).id; await refresh(); message('Publicação carregada.'); }); });
$('#versions').addEventListener('change', (event) => { const next = event.target.value; action(async () => { await saveDirty(); selectedVersion = next; renderEditor(); message('Versão carregada.'); }); });
window.addEventListener('beforeunload', (event) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
$('#loginForm').addEventListener('submit', (event) => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
  action(async () => { const result = await api('/api/login', 'POST', data); csrf = result.csrf; $('#loginForm').reset(); await refresh(); await loadProfile(); populateBrand(); $('#brandPanel').open = !state.brand.name; message('Escolha um assunto para começar.'); });
});
$('#profileForm').addEventListener('submit', event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); action(async () => { await api('/api/profile', 'PUT', data); await loadProfile(); window.parent.postMessage({ type: 'clinic-profile-updated' }, location.origin); message('Perfil atualizado.'); }); });
$('#profilePhotoUpload').addEventListener('change', event => { const file = event.target.files[0]; if (file) action(() => uploadProfilePhoto(file)); });
$('#removeProfilePhoto').addEventListener('click', () => action(async () => { await api('/api/profile/photo', 'PUT', { remove: true }); await loadProfile(); window.parent.postMessage({ type: 'clinic-profile-updated' }, location.origin); message('Foto removida.'); }));
$('#passwordForm').addEventListener('submit', event => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
  action(async () => { await saveDirty(); await api('/api/profile/password', 'PUT', data); $('#passwordForm').reset(); state = null; csrf = ''; $('#workspace').hidden = true; $('#logout').hidden = true; $('#loginPanel').hidden = false; if (document.body.classList.contains('embedded')) window.parent.postMessage({ type: 'clinic-session-expired' }, location.origin); message('Senha alterada. Entre novamente com a nova senha.'); });
});
$('#activationForm').addEventListener('submit', event => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
  action(async () => { const result = await api('/api/activate', 'POST', { ...data, token: activationToken }); activationToken = ''; $('#activationForm').reset(); $('#activationPanel').hidden = true; $('#loginPanel').hidden = false; $('#loginForm').elements.username.value = result.username; message('Conta ativada. Entre com a senha que você definiu.'); });
});
$('#logout').addEventListener('click', () => action(async () => { await saveDirty(); await api('/api/logout', 'POST', {}); state = null; csrf = ''; selectedPost = ''; selectedVersion = ''; referenceSelection.clear(); sessionStorage.removeItem('studio-request'); $('#workspace').hidden = true; $('#loginPanel').hidden = false; $('#logout').hidden = true; message('Você saiu do marketing.'); }));
await action(async () => {
  const ticket = new URLSearchParams(location.hash.slice(1)).get('ticket');
  history.replaceState(null, '', location.pathname + location.search);
  if (production && activationToken) { $('#activationPanel').hidden = false; message('Defina a senha para ativar sua conta.'); return; }
  if (ticket) { const result = await api('/api/session', 'POST', { ticket }); csrf = result.csrf; }
  await refresh(); await loadProfile(); populateBrand(); $('#brandPanel').open = !state.brand.name;
  message(state.brand.name ? 'Escolha um assunto para começar.' : 'Comece salvando a identidade da marca.');
}, 'Conectando ao seu estúdio…');
