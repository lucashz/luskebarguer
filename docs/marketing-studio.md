# Estúdio de marketing para terceiros

## Produção — publicada em 10/09/2026

Atualização de navegação: o marketing abre **dentro da página da clínica**, pelo menu, mantendo a URL principal e a mesma aba. O painel incorporado é permitido apenas na mesma origem e mantém o estado ao alternar as seções. O acesso direto e os links de ativação anteriores seguem válidos. Runtime atual: `/var/www/thai/marketing-runtime-embedded-v1`. A senha mínima na ativação e na troca foi ajustada para **8 caracteres** (máximo 128), com validação no navegador e no servidor.

Atualização de contas: **Meu perfil** permite editar nome/e-mail, enviar/remover foto pessoal e alterar a senha com confirmação da senha atual. A foto é validada, normalizada em PNG 320×320 e guardada por usuário. Trocar a senha revoga as sessões de marketing daquele usuário. A interface informa que a senha da conta original vinculada à clínica é compartilhada com o sistema clínico; contas adicionais possuem senha exclusiva de marketing.

`marketing-studio-accounts.js` adiciona `marketing_studio_users`, vincula sessões a usuários e preserva o acesso original. A conta administradora **lucas** foi criada na organização `thaina`, com ativação por token de uso único válido por 48 horas, armazenado somente como hash. Nenhuma senha provisória foi definida. O administrador define a própria senha pelo link de ativação; a biblioteca e as cotas são compartilhadas pela organização, enquanto foto, perfil e senha são individuais. Não há acesso adicional a prontuários por essa conta.

Runtime atual: `/var/www/thai/marketing-runtime-accounts-v1`. O runtime anterior permanece disponível para rollback. A integração anterior está salva em `/var/www/thai/.marketing-backups/marketingStudio.before-accounts.ts`; as tabelas/contas criadas devem ser preservadas ao reverter. Testes isolados cobrem ativação de uso único e por organização, proteção de perfil/foto, troca de senha sem afetar outras contas e rejeição de senha atual incorreta.

Acesso: **https://thaina.taprontomenu.com.br/marketing/**, também disponível pelo botão Marketing no menu da clínica. O usuário informa o mesmo usuário e senha da clínica. O módulo verifica o hash existente de senha no servidor e emite sua própria sessão; não confia no localStorage do sistema clínico.

- Router de produção: `src/lib/marketing-studio-production.js`. O servidor de desenvolvimento continua bloqueado em produção e seus tickets não são aceitos neste router.
- Sessão PostgreSQL de 8 horas, token armazenado como hash, cookie Secure/HttpOnly/SameSite com caminho `/marketing`, CSRF, validação de Host/Origin, logout e invalidação após troca de credenciais. Limite de 10 tentativas de login por IP em 15 minutos; o nginx existente sobrescreve o cabeçalho de IP encaminhado.
- Persistência: `src/lib/marketing-studio-postgres.js`, tabelas aditivas `marketing_studio_orgs`, `marketing_studio_assets`, `marketing_studio_sessions`, `marketing_studio_login_limits` e `marketing_studio_jobs` no banco da clínica. Imagens ficam em bytea e entram no backup PostgreSQL junto com os metadados. Nenhum prontuário ou foto clínica é importado.
- Organização `thaina` vinculada no servidor à clínica. Estado, imagens, limites, sessões e trabalhos são filtrados por organização. Advisory locks coordenam gravações entre processos; a reserva de consumo é confirmada antes da chamada paga. Sessões, cotas e idempotência sobrevivem ao reinício.
- Geração assíncrona: POST retorna 202 e a página consulta o trabalho, evitando o timeout do proxy durante a geração. Um trabalho ativo por organização. Tentativas interrompidas não são reenviadas automaticamente.
- Limites iniciais: 30 tentativas de imagem e 60 legendas/mês (UTC), definidos em `marketing_studio_orgs`. O cliente não pode aumentá-los pela API.
- O provedor de imagem e a legenda usam a chave existente no servidor, lida pelo adaptador da clínica sem envio ao navegador. Ambos os modelos configurados responderam 200 no teste de disponibilidade. Os testes funcionais usam provedores simulados, sem gerar conteúdo pago.

Integração em `D:\lsk\thai2\server\marketingStudio.ts`, montada antes do frontend estático no serviço existente. O runtime publicado está em `/var/www/thai/marketing-runtime`. O build foi feito sobre o código da clínica que já estava no servidor; a cópia local não substituiu as funcionalidades remotas.

Validação: `scripts/marketing-studio-production-test.mjs` usa um schema PostgreSQL temporário isolado, com credenciais fictícias, e cobre autenticação, revogação/logout, CSRF, limite de tentativas, isolamento, arquivos, trabalhos assíncronos e concorrência entre instâncias. `scripts/marketing-studio-production-health.mjs` verificou o domínio público com uma sessão temporária de manutenção, revogada no final, sem alterar conteúdos. A API clínica permaneceu saudável.

Backup de ativação: `/var/www/thai/.marketing-backups/20260910205126`, contendo configuração Vite, Layout e HTML anteriores. O script `D:\lsk\thai2\scripts\deploy-marketing.py` prepara, ativa e publica sem apagar os assets antigos. Para reverter a integração, restaure esses três arquivos nos caminhos originais. As tabelas de marketing devem ser preservadas. Atualizações futuras do runtime ESM exigem reinício do processo da clínica ou um novo diretório de release para evitar o cache de módulos.

## Modo local de desenvolvimento

As instruções abaixo descrevem o servidor local original, que mantém dados de demonstração em arquivos e não usa o acesso público acima.

Área independente para perfil de marca, referências enviadas manualmente, imagens 4:5/9:16, versões, legendas e download. Não publica no Instagram. Não acessa dados clínicos.

## Iniciar no PowerShell

Na pasta `D:\lsk\TáProntomenu.com.br`, com Node.js 22 ou superior e as dependências existentes instaladas:

```powershell
$env:NODE_ENV = 'development'
$env:STUDIO_DEV_ENABLED = 'true'
$env:STUDIO_DEV_ORGS = 'clinica-demo'
npm run studio:dev
```

Abra o link exibido no terminal em até 10 minutos. O fragmento contém um ticket de uso único, removido da URL pela página e trocado por sessão HttpOnly/SameSite. A sessão dura 8 horas. Pressione Enter no terminal para emitir novos links. Ctrl+C encerra com liberação do armazenamento.

O botão **Marketing** em `D:\lsk\thai2\src\components\Layout.tsx` abre `http://127.0.0.1:7071/` somente no desenvolvimento. Primeiro abra o link do terminal para ativar a sessão no mesmo navegador. O botão não compartilha a sessão clínica e não envia seus dados. Não aparece no build de produção. Se a clínica usar outro projeto, o mesmo link pode ser inserido nele sem integração de dados.

O servidor escuta exclusivamente `127.0.0.1`, exige opt-in e `NODE_ENV=development`, valida Host, Origin e CSRF e rejeita cabeçalhos de proxy. **Não configure túnel ou proxy público para esse serviço.** O servidor principal não registra rotas nem arquivos do Studio. Nenhum deploy ou migração é necessário para experimentar.

## Provedor e custos

`npm run studio:dev` carrega `.env` com a implementação nativa do Node. Variáveis previamente definidas no terminal têm precedência. Não copie chaves para o frontend.

- `MARKETING_IMAGE_PROVIDER=local`: composição com `sharp`, primeira referência selecionada, logo, cores e assunto. Ajustes locais: `clarear` e `escurecer`. Não simula mudanças livres que não consegue executar.
- `MARKETING_IMAGE_PROVIDER=openai`: reutiliza `requestOpenAiImage` de `src/lib/marketing-autopilot.js`, com `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL` e `OPENAI_IMAGE_QUALITY`. Uma solicitação usa só as referências selecionadas ou a versão atual, sem histórico de imagens. Até 3 referências são reunidas em uma prancha para o adaptador existente. O resultado é enquadrado em 1080×1350 ou 1080×1920 sem cortar o conteúdo.
- Legenda pela imagem: requer `OPENAI_API_KEY`, mesmo no modo de composição local. Usa `STUDIO_CAPTION_MODEL` (padrão `gpt-4.1-mini`), miniatura da imagem final e briefing compacto. Sem chave, a legenda continua editável manualmente; não é apresentada uma legenda simulada.
- Logo é composto localmente na criação. Os ajustes exatos `clarear` e `escurecer` evitam chamadas pagas em ambos os provedores. Edição manual da legenda não gera imagem nem consome geração de texto.
- `STUDIO_MONTHLY_IMAGES=30` e `STUDIO_MONTHLY_CAPTIONS=60` são os limites padrão **por organização**, definidos no servidor. O mês é UTC. Contadores medem tentativas, não valores monetários ou tokens faturados. Uma falha após reserva também conta, pois o provedor pode ter processado o pedido.
- Mesma chave não é reenviada; pedido idêntico com outra chave e mesma marca reutiliza o resultado existente. Uma tentativa com falha bloqueia outra igual por 10 minutos. Retentativas são sempre explícitas, nunca automáticas.

A leitura visual segue a [documentação oficial de imagens e visão](https://developers.openai.com/api/docs/guides/images-vision). O modelo de imagem mantém a configuração já utilizada pelo projeto; disponibilidade e credenciais reais não são verificadas pelos testes simulados.

## Dados e limites do MVP

Arquivos privados em `.studio-data/<organizacao>/`: `state.json` contém marca, referências, posts/versões, legendas e registros de consumo/idempotência; PNGs usam UUID gerado no servidor. Nada é gravado nas tabelas `marketing_autopilot_*`, `marketing_content_items` ou `social_media_assets` da central. A migração atual da central tem configuração global `id=1`, por isso não foi reutilizada para dados de terceiros.

O armazenamento é exclusivo de um processo, com fila por organização e troca atômica do JSON. Reserva de consumo é persistida antes da chamada paga. `.studio.lock` impede dois processos de escreverem no mesmo diretório. Após encerramento abrupto, confira que o PID registrado parou antes de remover apenas esse arquivo e reiniciar. Não apague registros de operação para tentar recuperar uma geração; uma reserva incerta não deve ser reenviada automaticamente.

Uploads: PNG/JPEG/WebP não animados, até 5 MB/24 milhões de pixels, convertidos em PNG sem metadados e limitados a 1600 px. Biblioteca limitada a 250 MB por organização. Não há exclusão de arquivos neste MVP. Faça backup de `.studio-data` com o processo encerrado. Testes usam diretórios temporários próprios, sem acessar banco nem arquivos da central.

`STUDIO_DEV_ORGS=clinica-demo,outra-clinica` emite tickets separados. A organização vem da sessão validada no servidor, nunca de parâmetros enviados pelo navegador. Para alternar de organização, abra o ticket correspondente; sessões do mesmo host compartilham o cookie, portanto use perfis separados do navegador para uso simultâneo.

## Antes de liberar para terceiros

Implementar autenticação real, associação usuário/organização e autorização em todas as rotas de dados e mídia; substituir o bootstrap de desenvolvimento por essa sessão. Migrar o armazenamento local para persistência adequada a múltiplos processos com transações, idempotência e cotas por organização. Configurar HTTPS e operação de produção em serviço próprio. A mudança de uma variável de ambiente **não** transforma este servidor em aplicação pública: ele bloqueia produção por desenho.

## Validação

```powershell
npm run test:studio
npm run test:studio-ui
npm run test:syntax
```

O teste HTTP cobre sessão, ticket de uso único, CSRF/Origin/Host, isolamento de marca/mídia/posts/consumo, limites, clique concorrente, reinício e falha de provedor. O teste de navegador usa Chrome/Edge headless, composição local e legenda simulada, exercita upload, criação, edição, persistência e layout desktop/mobile. Capturas em `.tmp/studio-preview`. Nenhum teste chama APIs pagas.

A única alteração na lógica original de marketing é tornar exportável o adaptador de imagem existente, sem mudar seu corpo. `server.js`, `public/platform.js` e `src/lib/social-publishing.js` não são alterados por este MVP.
