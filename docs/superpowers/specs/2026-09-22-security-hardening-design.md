# Endurecimento de segurança do TáPronto

## Objetivo

Auditar e endurecer os controles de autenticação, sessão, exposição de dados, origem, clickjacking, SQL Injection e autorização multi-tenant sem substituir a arquitetura atual de sessões, sem testes destrutivos e sem publicar em produção antes de autorização explícita.

## Decisão arquitetural

O sistema continuará usando tokens de sessão opacos em cookies `HttpOnly`. O servidor armazena somente o hash do token em `app_sessions`, valida expiração e remove a sessão no logout. Não haverá migração para JWT nem armazenamento de credenciais em `localStorage`.

As mudanças serão incrementais e compatíveis com painel administrativo, Central, conta do cliente e cardápio público.

## Estado observado

### Controles já existentes

- Sessões opacas persistidas no banco e revogadas no logout.
- Cookies `HttpOnly` e `SameSite=Lax`.
- Validação de origem para operações autenticadas com cookie.
- Ausência de reflexão dinâmica de `Access-Control-Allow-Origin`.
- CSP com `frame-ancestors 'none'` e `X-Frame-Options: DENY`.
- DTOs explícitos para administrador e cliente em vários fluxos.
- Queries parametrizadas e validação de identificadores no adaptador PostgreSQL.
- Filtros por `store_id` e `company_id` em diversas operações.

### Lacunas confirmadas por inspeção

- Rate limiting somente por IP, mantido em memória e reiniciado com o processo.
- Login administrativo revela diferenças entre usuário inexistente, senha incorreta, conta desativada e ativação pendente.
- Recuperação administrativa pode revelar existência por diferença de tempo e por erro SMTP exclusivo do usuário existente.
- Token de consulta de pagamento é transportado na query string.
- Troca ou redefinição de senha não possui garantia centralizada de revogação de todas as sessões anteriores.
- O atributo `Secure` do cookie depende de configuração e precisa falhar de modo seguro em produção.
- A cobertura automatizada de IDOR e isolamento multi-tenant é parcial.
- Algumas consultas internas usam `select: '*'`; cada resposta precisa ser rastreada até seu serializador para impedir vazamento acidental.

## Arquitetura proposta

### 1. Rate limiting combinado

Criar um componente isolado que aplique duas chaves aos endpoints sensíveis:

- chave de rede: IP confiável normalizado;
- chave de identidade: hash de e-mail, telefone, desafio ou outro identificador normalizado.

O componente não armazenará PII em texto. Cada regra definirá janela, limite, código `429` e `Retry-After`. Os contadores serão persistidos no PostgreSQL para sobreviver a reinícios e manter comportamento consistente caso o serviço passe a usar mais de uma instância. Registros expirados serão removidos por rotina de manutenção.

Endpoints mínimos: login administrativo, 2FA, login de cliente, recuperação e redefinição de senha, reenvio de ativação, cadastro e criação pública de pedidos.

### 2. Origem e CORS

Manter o padrão same-origin. Não adicionar CORS global.

- Origens confiáveis virão de allowlist configurada.
- O `Host` recebido não poderá, sozinho, autorizar uma origem.
- Requisições `OPTIONS` só receberão cabeçalhos CORS quando a origem estiver autorizada e a rota necessitar CORS.
- Credenciais nunca serão combinadas com origem curinga.
- Operações autenticadas por cookie continuarão validando `Origin`, `Referer` e `Sec-Fetch-Site`.

### 3. Minimização de dados

Criar ou consolidar DTOs de saída para contas, sessões, empresas, lojas, pagamentos e erros.

- Bloquear senha, hash, token, segredo, documentos completos e metadados internos.
- Manter detalhes técnicos apenas nos logs sanitizados.
- Nunca serializar diretamente uma linha de autenticação retornada por `select: '*'`.
- Mascarar e-mail, telefone e documento quando a informação integral não for necessária.

### 4. Sessões e tokens

- Preservar cookies `HttpOnly`.
- Exigir `Secure` no ambiente de produção.
- Manter `SameSite=Lax` ou elevar para `Strict` onde não houver quebra de fluxo.
- Reduzir a duração administrativa e aplicar renovação controlada.
- Revogar todas as sessões do titular após troca de senha, redefinição, desativação ou evento de segurança.
- Remover o token de pagamento da URL. O acesso passará por cabeçalho dedicado ou por troca curta que produza cookie restrito ao fluxo de pagamento.
- Tokens de ativação, convite e recuperação continuarão sendo de uso único, com hash no banco, expiração curta e consumo atômico. As páginas deverão remover o token da barra de endereço assim que o capturarem.

### 5. Prevenção de enumeração

- Login administrativo retornará a mesma mensagem e o mesmo status para credencial inexistente ou senha inválida.
- Estados de conta não serão revelados antes da prova de conhecimento adequada.
- Recuperação sempre responderá de forma genérica, inclusive quando SMTP falhar; a falha real ficará em auditoria interna.
- Será usada verificação de senha simulada para reduzir diferenças de tempo quando a conta não existir.
- Cadastro poderá informar conflito somente quando isso for necessário para a experiência, sem expor estado administrativo interno.

### 6. Clickjacking e cabeçalhos

Manter as proteções existentes e criar testes de regressão para:

- `Content-Security-Policy: frame-ancestors 'none'`;
- `X-Frame-Options: DENY`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy`;
- HSTS somente em HTTPS/produção.

Exceções para iframe deverão ser explícitas, limitadas e cobertas por teste.

### 7. SQL Injection e IDOR

- Manter parâmetros preparados para valores e allowlist de identificadores SQL.
- Proibir concatenação de entrada do usuário em SQL, nomes de tabela, coluna ou ordenação.
- Para cada rota com ID, validar formato e consultar o recurso junto com `company_id`, `store_id` ou proprietário derivado da sessão.
- Preferir `404` para recurso inexistente ou fora do tenant, evitando confirmar sua existência.
- Central/Admin Master continuará separada por permissão explícita.

## Estratégia de testes

Cada correção seguirá red-green-refactor:

1. Criar um teste que reproduza a falha sem acessar dados de terceiros.
2. Confirmar que o teste falha pelo motivo esperado.
3. Aplicar uma única correção.
4. Executar o teste específico e a suíte de regressão.

Cobertura mínima:

- limite por IP e por identidade, incluindo expiração da janela;
- origem permitida, origem hostil e preflight;
- ausência de campos sensíveis em respostas e logs;
- logout e troca de senha invalidando sessões;
- token de pagamento ausente em URL e logs;
- mensagens e tempos equivalentes para credenciais inválidas;
- cabeçalhos anti-clickjacking em HTML e JSON;
- payloads de SQL Injection existentes e novos casos de ordenação/filtro;
- acesso cruzado entre duas empresas, duas lojas e dois clientes para leitura e escrita.

Os testes multi-tenant criarão dados sintéticos com identificadores aleatórios e farão rollback ou limpeza explícita. Nenhum teste utilizará contas reais.

## Sequência de implementação

1. Testes-base e inventário de superfícies sensíveis.
2. Rate limiting e enumeração de usuários.
3. Sessões, revogação e cookies.
4. Remoção de token de pagamento da URL.
5. DTOs e sanitização de logs/respostas.
6. CORS, origem e cabeçalhos.
7. Matriz de IDOR e SQL Injection.
8. Relatório final local com evidências e riscos restantes.

## Critérios de aceite

- Endpoints sensíveis retornam `429` por abuso de IP ou identidade.
- Login e recuperação não confirmam se uma conta existe.
- Nenhum token de sessão ou pagamento aparece em URL, resposta indevida ou log.
- Logout, troca de senha e redefinição invalidam as sessões exigidas.
- Cookies de produção são `HttpOnly`, `Secure` e têm política `SameSite` definida.
- Origens não autorizadas não recebem CORS nem executam operações autenticadas.
- Respostas públicas/autenticadas não expõem hashes, segredos ou PII desnecessária.
- Páginas administrativas não podem ser incorporadas por origem externa.
- Testes de SQL Injection não provocam erro 500 nem alteram consultas.
- Testes IDOR provam isolamento entre tenants em leitura e escrita.
- Fluxos legítimos de login, cadastro, pedido, pagamento e logout continuam funcionando.

## Implantação e reversão

Nenhuma mudança será publicada automaticamente. O relatório local indicará:

- arquivos modificados;
- migrações e variáveis de ambiente;
- testes executados e resultados;
- impacto esperado;
- procedimento de backup e reversão;
- necessidade de reinício.

A produção só será alterada após autorização explícita posterior. Mudanças serão implantadas em lotes pequenos, começando por controles sem alteração de contrato e deixando a migração do token de pagamento para um lote próprio.

## Fora do escopo

- Migração para JWT.
- Armazenamento de tokens de autenticação no `localStorage`.
- WAF, CDN ou serviços externos pagos nesta primeira etapa.
- Pentest destrutivo, varredura fora do projeto ou acesso a dados de terceiros.
- Refatorações sem relação direta com os controles auditados.
