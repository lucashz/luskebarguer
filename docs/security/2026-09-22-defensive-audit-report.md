# Relatório de auditoria defensiva — 22/09/2026

## Escopo e resultado

Auditoria local do TáPronto, sem exploração destrutiva, sem dados de terceiros e sem publicação em produção. Os testes usaram registros sintéticos com limpeza explícita.

Resultado: as falhas reproduzidas abaixo foram corrigidas localmente e todas as suítes previstas passaram em 23/09/2026. A implantação ainda exige migração, configuração de ambiente, reinício e autorização separada.

## 1. Ausência de rate limiting

- Severidade: alta.
- Estado: corrigida localmente.
- Arquivo e trecho: `src/lib/security-rate-limit.js`; `server.js` na entrada das rotas sensíveis; `prisma/migrations/20260922090000_security_rate_limits/migration.sql`.
- Evidência segura: tentativas distribuídas por identidade normalizada e por rede alcançavam limites inconsistentes; o teste agora confirma bloqueio `429` e `Retry-After` nas duas dimensões, inclusive com cadeia de proxy malformada.
- Causa-raiz: contador anterior somente em memória e chaveado de forma insuficiente.
- Correção: buckets persistentes e atômicos no PostgreSQL, chaves SHA-256 sem PII, normalização de identidade e `TRUSTED_PROXY_HOPS` explícito.
- Testes criados: `scripts/security-hardening-smoke.mjs`.
- Resultado: aprovado em `npm run test:security-hardening` e `npm run test:all`.
- Riscos restantes: uma contagem incorreta de proxies confiáveis pode agrupar usuários sob o IP do proxy; os limites devem ser acompanhados após o deploy.
- Migração/configuração/reinício: executar migração; definir `SECURITY_RATE_LIMIT_SECRET` e `TRUSTED_PROXY_HOPS`; reiniciar.

## 2. CORS e validação de origem

- Severidade: alta para mutações autenticadas por cookie.
- Estado: corrigida localmente.
- Arquivo e trecho: `src/lib/security-http.js`; `server.js` em `enforceAuthenticatedRequestOrigin` e no limite global de resposta.
- Evidência segura: a origem anteriormente confiava também no `Host` recebido. O teste confirma `403` para origem externa, ausência de `Access-Control-Allow-Origin` hostil e inexistência de correspondência por sufixo.
- Causa-raiz: construção dinâmica de origens confiáveis a partir da própria requisição.
- Correção: allowlist exata a partir de `ALLOWED_ORIGINS` e URLs configuradas; CORS permanece desligado por padrão e só é emitido por política declarada.
- Testes criados: casos de origem hostil, preflight e origem semelhante em `scripts/security-hardening-smoke.mjs`.
- Resultado: aprovado em `npm run test:security-hardening`, `npm run test:seo`, `npm run test:flows` e `npm run test:all`.
- Riscos restantes: novos subdomínios legítimos precisam ser incluídos explicitamente.
- Migração/configuração/reinício: definir `ALLOWED_ORIGINS` com as origens oficiais exatas; reiniciar.

## 3. Exposição excessiva de dados e PII

- Severidade: alta.
- Estado: corrigida localmente nas fronteiras auditadas.
- Arquivo e trecho: `src/lib/security-redaction.js`; DTOs `publicAdmin`, `publicCustomer`, `publicStore` e pagamento em `server.js`; logger global e auditoria.
- Evidência segura: mensagens de erro e detalhes técnicos podiam chegar crus ao log. Testes recursivos agora rejeitam nomes de campos sensíveis e sentinelas não sobrevivem ao redator.
- Causa-raiz: sanitização duplicada e logger global com `error.message` bruto.
- Correção: redator central com limite de profundidade; logger de servidor registra somente tipo/código seguros; respostas de conta continuam em allowlists explícitas.
- Testes criados: validação de payloads e redator em `scripts/security-hardening-smoke.mjs`.
- Resultado: aprovado em `npm run test:security-hardening`, `npm run test:platform-health`, `npm run test:flows` e `npm run test:all`.
- Riscos restantes: integrações futuras que escrevam diretamente em `console` precisam usar o mesmo redator; a Central possui respostas extensas que devem continuar sendo revisadas por DTO.
- Migração/configuração/reinício: somente reinício.

## 4. JWT e transporte de tokens

- Severidade: crítica para token de pagamento em URL; não aplicável a JWT de sessão.
- Estado: corrigida localmente; o sistema preserva sessões opacas, sem introduzir JWT.
- Arquivo e trecho: criação/consulta de pagamento em `server.js`; `public/app.js`; `public/payment.js`.
- Evidência segura: o contrato anterior aceitava token de pagamento em query string. O teste agora confirma: sem cookie `403`, query token `403`, cookie correto `200` e cookie de outro pedido `403`.
- Causa-raiz: credencial de acesso entregue ao JavaScript e propagada na URL.
- Correção: cookie assinado `HttpOnly`, `SameSite=Lax`, escopo `/api/payments`, expiração e vínculo com o código exato do pedido. Sessões opacas são revogadas após mudança de senha/logout.
- Testes criados: `scripts/sql-injection-tests.mjs`, `scripts/security-hardening-smoke.mjs` e regressões de pagamento.
- Resultado: aprovado em `npm run test:security`, `npm run test:payments`, `npm run test:flows` e `npm run test:all`.
- Riscos restantes: duas compras simultâneas no mesmo navegador substituem o cookie de pagamento anterior e podem exigir reabrir o checkout.
- Migração/configuração/reinício: definir `PAYMENT_COOKIE_SECRET` forte e estável; reiniciar.

## 5. Enumeração de usuários

- Severidade: média.
- Estado: corrigida localmente.
- Arquivo e trecho: `src/lib/security-auth.js`; fluxos de login e recuperação em `server.js`.
- Evidência segura: conta inexistente e senha incorreta retornavam estados/mensagens diferentes. Agora ambas retornam `401` com o mesmo corpo e diferença temporal dentro da tolerância do teste.
- Causa-raiz: retorno antecipado quando o usuário não existia.
- Correção: hash sentinela fixo, verificação uniforme e resposta genérica de recuperação.
- Testes criados: casos temporizados e comparação de corpo em `scripts/security-hardening-smoke.mjs`.
- Resultado: aprovado em `npm run test:security-hardening`, `npm run test:flows` e `npm run test:all`.
- Riscos restantes: latência de serviços externos pode introduzir diferenças estatísticas; monitorar sem registrar identificadores crus.
- Migração/configuração/reinício: somente reinício.

## 6. Clickjacking

- Severidade: média.
- Estado: corrigida localmente.
- Arquivo e trecho: `src/lib/security-http.js`; aplicação global em `server.js`.
- Evidência segura: o teste HTTP confirma `X-Frame-Options: DENY` e CSP `frame-ancestors 'none'` para a página administrativa.
- Causa-raiz: cabeçalhos estavam distribuídos e HTML podia adotar `SAMEORIGIN` indiscriminadamente.
- Correção: cabeçalhos consolidados e aplicados também a redirects, erros e arquivos; telas privadas usam `DENY`.
- Testes criados: caso de HTML administrativo em `scripts/security-hardening-smoke.mjs`.
- Resultado: aprovado em `npm run test:security-hardening`, `npm run test:seo` e `npm run test:all`.
- Riscos restantes: páginas públicas explicitamente enquadráveis continuam com `SAMEORIGIN`, nunca iframe externo.
- Migração/configuração/reinício: somente reinício; HSTS é emitido em produção/HTTPS.

## 7. SQL Injection e IDOR

- Severidade: alta.
- Estado: falha confirmada de exclusão de endereço corrigida localmente; demais casos exercitados ficaram protegidos.
- Arquivo e trecho: `server.js` em `deleteCustomerAddressByAdmin`; `scripts/idor-security-smoke.mjs`; `scripts/sql-injection-tests.mjs`.
- Evidência segura: cliente do tenant A recebia `200` ao tentar excluir UUID de endereço do tenant B, embora o filtro impedisse a remoção. Agora recebe `404` e o teste confirma que o recurso B continua existindo. Payloads malformados em UUID, filtros, ordenação e paginação retornam `4xx`, nunca `500`.
- Causa-raiz: `DELETE` usava `return=minimal` e não verificava se uma linha pertencente ao cliente/loja havia sido afetada.
- Correção: exclusão com `return=representation`, filtros simultâneos de recurso, titular e loja, seguida de `404` quando nenhuma linha é afetada.
- Testes criados: matriz HTTP de dois tenants sintéticos em `scripts/idor-security-smoke.mjs`; ampliação de `scripts/sql-injection-tests.mjs`.
- Resultado: aprovado em `npm run test:idor`, `npm run test:security`, `npm run test:security-hardening` e `npm run test:all`.
- Riscos restantes: a matriz executável atual cobre profundamente endereços de cliente e os vetores de pagamento/pedido. Categorias, produtos, modificadores, cupons, mesas, tickets e administração possuem filtros de loja/empresa no código, mas devem ganhar casos HTTP dedicados conforme suas fixtures forem estabilizadas. Scripts de backup usam identificadores dinâmicos validados e quotados; testes do Marketing Studio criam schema sintético isolado.
- Migração/configuração/reinício: somente reinício.

## Verificação final

Comandos executados com exit code `0`:

- `npm run test:syntax`
- `npm run test:security-hardening`
- `npm run test:security`
- `npm run test:idor`
- `npm run test:payments`
- `npm run test:flows`
- `npm run test:platform-health`
- `npm run test:all`
- `git diff --check`

Varredura estática:

- A ocorrência de `payments/order?...token=` está somente no teste negativo que comprova rejeição.
- `Access-Control-Allow-Origin` aparece apenas no módulo que exige allowlist exata.
- Não foi encontrado armazenamento de token em `localStorage` ou `sessionStorage`.
- SQL interpolado remanescente está restrito a identificadores administrativos validados/quotados e testes com schema sintético; não recebe fragmentos SQL de rotas públicas.

## Implantação

Nenhum deploy ou alteração remota foi executado nesta auditoria. Antes de produção:

1. revisar os commits e este relatório;
2. configurar `APP_ENV=production`, `ALLOWED_ORIGINS`, `SECURITY_RATE_LIMIT_SECRET`, `TRUSTED_PROXY_HOPS` e `PAYMENT_COOKIE_SECRET`;
3. executar a migração `20260922090000_security_rate_limits`;
4. reiniciar o serviço e repetir os smokes contra o ambiente autorizado;
5. obter autorização explícita antes do deploy.
