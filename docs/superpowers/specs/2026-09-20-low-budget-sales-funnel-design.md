# Funil de vendas low-budget do TáPronto

## Objetivo

Medir o primeiro funil de aquisição paga do TáPronto, do acesso à landing page até a primeira assinatura paga, sem criar CRM, integração com a API da Meta ou automações comerciais.

O funil terá quatro etapas:

1. `landing_view`
2. `whatsapp_click`
3. `signup_completed`
4. `subscription_created`

O admin master mostrará as contagens das quatro etapas e as taxas de conversão entre etapas consecutivas e do início ao fim.

## Decisões de escopo

- Reutilizar a tabela `marketing_events`, o endpoint público de analytics, a atribuição por UTMs, o `visitor_key` e o painel de funil existentes.
- Não criar tabela, CRM, lead, pipeline comercial, webhook da Meta ou integração com a API do WhatsApp.
- Interpretar `subscription_created` como a primeira assinatura paga e ativada. A assinatura de teste criada automaticamente no cadastro não conta como conversão.
- Preservar eventos históricos `subscription_activated`: o painel os contabilizará como assinatura para não perder o histórico.
- A primeira versão atribui o cadastro ao anúncio quando as UTMs retornam no link de cadastro ou permanecem no mesmo navegador. Não haverá tentativa de identificação entre aparelhos.

## Fluxo de atribuição

O anúncio do Instagram apontará para a landing page com `utm_source`, `utm_medium`, `utm_campaign` e `utm_content`.

Ao abrir a landing, o frontend reutilizará a função existente que persiste UTMs e `visitor_key`. O evento `landing_view` levará essa atribuição ao backend. O clique no botão do WhatsApp registrará `whatsapp_click` antes de abrir o destino externo.

Durante o atendimento manual, o operador deverá enviar um link de cadastro contendo as mesmas UTMs. O cadastro já persiste a atribuição na empresa e registra `signup_completed`. Quando o provedor de pagamento confirmar a primeira ativação, o backend registrará `subscription_created` usando a atribuição salva na empresa.

## Registro dos eventos

### `landing_view`

- Origem: carregamento da landing principal.
- Identidade: `visitor_key` anônimo existente.
- Propriedades: caminho e identificação da superfície.
- Deduplicação: no máximo um evento por visitante, caminho e dia.
- Motivo: recarregamentos não devem inflar o número de visitantes no funil.

### `whatsapp_click`

- Origem: clique em um link da landing explicitamente identificado como CTA comercial do WhatsApp.
- Identidade: o mesmo `visitor_key` e a mesma atribuição da visita.
- Propriedades: caminho e posicionamento do CTA.
- Deduplicação: no máximo um evento por visitante, posicionamento e dia.
- O registro usará uma requisição com `keepalive`; uma falha de analytics nunca impedirá a abertura do WhatsApp.

### `signup_completed`

- Origem: conclusão transacional do cadastro no backend.
- Identidade: empresa e loja criadas, associadas ao `visitor_key` quando disponível.
- Deduplicação existente por empresa.
- Nenhuma alteração no momento em que o evento é registrado.

### `subscription_created`

- Origem: confirmação de pagamento que torna a assinatura ativa.
- Identidade: empresa assinante.
- Atribuição: `marketing_attribution` persistida na empresa.
- Deduplicação: uma conversão por empresa. Renovações e reprocessamentos de webhook não criam novas conversões do funil.
- Compatibilidade: o evento atual `subscription_activated` deixa de ser gravado para novas ativações, mas continua sendo lido no painel.

## API e segurança

O endpoint público existente `POST /api/analytics/funnel` aceitará também `whatsapp_click`. Continuará aceitando apenas uma lista fechada de eventos públicos; eventos de cadastro e assinatura permanecerão exclusivos do backend.

O backend sanitizará nome, caminho, posicionamento, atribuição e chaves antes da gravação. O rate limit global existente continuará protegendo a rota. Analytics é uma operação auxiliar: falhas de registro não devem bloquear cadastro, pagamento ou navegação para o WhatsApp.

## Consulta e contagem

O endpoint existente `GET /api/platform/analytics?period=...`, protegido como rota do admin master, continuará fornecendo os dados.

As contagens serão:

- visitantes: `landing_view` distintos por `visitor_key`, com fallback para o ID do evento;
- cliques: `whatsapp_click` distintos por `visitor_key`, com fallback para o ID do evento;
- cadastros: `signup_completed` distintos por `company_id`, com fallback para `visitor_key` ou ID;
- assinaturas: união de `subscription_created` e `subscription_activated`, distinta por `company_id`.

Essa regra mede pessoas/empresas, e não o volume bruto de eventos. As contagens respeitarão o período selecionado no admin.

## Taxas de conversão

O backend retornará percentuais com uma casa decimal:

- `landing_to_whatsapp`: cliques / visitantes;
- `whatsapp_to_signup`: cadastros / cliques;
- `signup_to_subscription`: assinaturas / cadastros;
- `landing_to_subscription`: assinaturas / visitantes.

Quando o denominador for zero, a taxa será `0`. Como a primeira versão usa contagens agregadas do período, uma etapa posterior poderá superar uma anterior quando parte da jornada ocorrer fora do intervalo escolhido. O painel mostrará a métrica sem forçar o percentual a 100%.

## Admin master

O componente existente "Funil de Marketing" será simplificado para quatro linhas:

- Visitantes
- Cliques no WhatsApp
- Cadastros
- Assinaturas

Abaixo do funil serão exibidas as quatro taxas definidas acima. A origem dos cadastros existente poderá permanecer, pois reutiliza a mesma atribuição e não amplia o escopo operacional.

Não será criada uma nova tela. O filtro de período e os estados de carregamento/erro existentes serão reaproveitados.

## Arquivos e responsabilidades

- `public/home.html`: marcar os CTAs comerciais do WhatsApp com atributo de dados estável.
- `public/home.js`: emitir `landing_view` e `whatsapp_click` com a atribuição existente.
- `server.js`: permitir o clique público, gerar chaves de idempotência, registrar a assinatura e montar o snapshot do funil.
- `public/platform.js`: renderizar as quatro etapas e taxas.
- Scripts de smoke test existentes: cobrir aceitação, deduplicação, contagem e acesso protegido.
- `prisma/schema.prisma`: nenhuma alteração esperada.

## Validação

Os testes devem comprovar:

1. `landing_view` e `whatsapp_click` são aceitos pela rota pública.
2. Eventos internos como `signup_completed` e `subscription_created` continuam rejeitados pela rota pública.
3. Repetições do mesmo visitante no mesmo dia não inflam as contagens.
4. Cadastro concluído preserva UTMs e `visitor_key`.
5. Primeiro pagamento aprovado cria uma única conversão `subscription_created` por empresa.
6. Eventos históricos `subscription_activated` continuam aparecendo como assinatura.
7. O endpoint do admin retorna as quatro contagens e quatro taxas para cada período suportado.
8. O frontend do admin renderiza zero e dados reais sem `NaN` ou texto indefinido.
9. Falha no registro do clique não bloqueia a navegação para o WhatsApp.

## Fora de escopo

- custo, impressões e alcance importados da Meta;
- Meta Pixel ou Conversions API;
- leitura ou automação de conversas do WhatsApp;
- identificação entre dispositivos;
- CRM, cadência, tarefas ou qualificação de leads;
- atribuição multitoque;
- relatório financeiro de ROAS.

## Evolução futura

Depois de validar volume e conversão com baixo investimento, o mesmo modelo permite segmentar o painel por `utm_campaign` e `utm_content`. Integração com Meta Ads ou Conversions API só deve ser considerada quando a operação manual demonstrar retorno suficiente para justificar custo e complexidade.
