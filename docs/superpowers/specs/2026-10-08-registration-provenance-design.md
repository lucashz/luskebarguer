# Rastreabilidade da origem de novos cadastros

## Contexto e objetivo

Hoje um estabelecimento pode aparecer na Central sem que seja possível responder com segurança quem iniciou o cadastro, por qual fluxo ele entrou, por que o cardápio foi montado ou se a atividade registrada veio do cliente ou da equipe TáPronto. Isso impede distinguir clientes espontâneos de cardápios criados para captação de leads.

Esta mudança deve garantir que todo novo cadastro tenha proveniência estruturada, histórico de criação imutável e uma medida confiável de acesso real do cliente. O escopo é exclusivamente prospectivo: registros existentes não serão migrados, inferidos ou classificados automaticamente.

## Resultados esperados

Para qualquer empresa criada depois da implantação, a Central deve responder imediatamente:

- por qual fluxo o cadastro foi criado;
- quem o criou, quando aplicável;
- com qual finalidade um cadastro interno foi aberto;
- qual campanha ou canal trouxe o lead, quando conhecido;
- se o cliente já acessou sua conta diretamente;
- quando ocorreu o último acesso direto do cliente;
- quais atividades posteriores foram feitas pelo cliente e quais foram feitas pela equipe TáPronto.

## Decisões de produto

### Origem do cadastro

Todo novo cadastro deve possuir exatamente um `creation_source`:

- `self_service`: criado pelo próprio cliente no cadastro público;
- `assisted`: criado pelo fluxo de cadastro assistido;
- `platform_admin`: criado manualmente na Central;
- `sales_automation`: criado por uma automação comercial;
- `import`: criado por importação operacional;
- `api`: criado por uma integração autenticada.

O valor não pode ser vazio. Fluxos novos devem escolher uma das origens existentes ou acrescentar explicitamente uma nova origem ao contrato.

### Finalidade dos cadastros internos

Os fluxos `assisted`, `platform_admin`, `sales_automation`, `import` e `api` devem informar um `creation_purpose`:

- `customer_request`: cliente solicitou a criação;
- `lead_capture`: cardápio criado para abordagem ou demonstração comercial;
- `demo`: demonstração sem um lead real associado;
- `migration`: importação de cliente vindo de outro sistema;
- `internal_test`: teste interno identificado e excluível de indicadores comerciais.

Para `self_service`, a finalidade será `customer_request`, preenchida automaticamente pelo servidor.

### Responsável e justificativa

Cadastros iniciados por uma pessoa da equipe devem possuir `created_by_admin_id`, um retrato textual do nome do responsável e uma `creation_note` obrigatória. A nota deve explicar o contexto em linguagem curta, como "Montagem solicitada por Lucas após contato no WhatsApp".

Automações e integrações devem registrar um identificador estável do sistema no lugar de uma pessoa. A remoção futura do usuário responsável não pode apagar o retrato textual registrado na criação.

### Atribuição comercial

A atribuição de marketing existente continuará armazenando UTM, referenciador, código de indicação, chave do visitante e demais sinais de aquisição. A proveniência operacional não substitui essa atribuição.

Quando o canal não for conhecido, o servidor deve registrar `declared_source: "unknown"`. Campo ausente não poderá significar simultaneamente "desconhecido", "direto" e "não coletado".

Cadastros com finalidade `lead_capture` devem exigir pelo menos um destes sinais:

- `utm_source`;
- `declared_source` diferente de `unknown`;
- `tracking_code`;
- `referral_code`.

### Acesso do cliente

O sistema deve manter `last_customer_login_at` na empresa. Esse campo somente será atualizado quando um usuário da empresa autenticar-se diretamente com suas próprias credenciais.

As seguintes atividades não atualizam `last_customer_login_at`:

- criação ou edição feita na Central;
- publicação pelo cadastro assistido;
- acesso por impersonação da equipe;
- automação, integração ou tarefa de sistema;
- visita ao cardápio público.

Uma empresa com `last_customer_login_at = null` será exibida como "Cliente nunca acessou". O `last_login_at` individual dos administradores continua existindo para diagnóstico, mas não será usado isoladamente para inferir atividade do cliente.

## Modelo de dados

A tabela `companies` receberá os campos estruturados:

- `creation_source`, obrigatório para novos registros;
- `creation_purpose`, obrigatório para novos registros;
- `created_by_admin_id`, opcional e com exclusão configurada como `SET NULL`;
- `created_by_name_snapshot`, obrigatório para criações humanas internas;
- `creation_note`, obrigatório nos fluxos internos;
- `creation_metadata`, JSON para identificadores auxiliares do fluxo, sem duplicar segredos;
- `last_customer_login_at`, inicialmente nulo.

Para preservar compatibilidade sem classificar registros anteriores, as colunas de proveniência serão inicialmente anuláveis no banco. A aplicação exigirá os valores em todas as novas criações. Registros antigos nulos aparecerão como "Legado sem rastreamento", nunca como `unknown` ou `self_service`.

Serão criados índices para `creation_source`, `creation_purpose`, `created_by_admin_id` e `last_customer_login_at`, voltados aos filtros da Central.

## Evento imutável de criação

Além dos campos consultáveis em `companies`, cada criação produzirá uma entrada em `audit_logs` com a ação canônica `company.created`. O evento conterá:

- IDs da empresa, loja e responsável;
- origem e finalidade;
- retrato do nome do responsável ou identificador do sistema;
- nota de criação;
- atribuição sanitizada;
- request ID, IP, user-agent e data do servidor.

Esse evento não terá endpoint de edição ou exclusão. Correções futuras devem gerar um novo evento de auditoria e atualizar os campos consultáveis da empresa, preservando o registro original.

A criação da empresa e seu evento devem ocorrer na mesma transação sempre que o fluxo usar PostgreSQL diretamente. Nos fluxos que atravessam a camada PostgREST existente, uma falha ao gravar a auditoria deve desfazer a empresa recém-criada pelo mecanismo de rollback já utilizado no cadastro público. Nenhuma empresa nova pode permanecer sem proveniência.

## Contrato interno de criação

Todos os pontos de entrada devem convergir para um serviço compartilhado de proveniência, responsável por:

1. normalizar origem, finalidade, responsável, nota e atribuição;
2. validar combinações permitidas;
3. produzir os campos persistidos em `companies`;
4. produzir o payload sanitizado do evento `company.created`.

O cadastro público preencherá automaticamente `self_service/customer_request`. A Central e o cadastro assistido deverão enviar finalidade, nota e canal pelo formulário operacional. Automações, importações e APIs deverão declarar sua identidade de sistema.

Validações devem ocorrer no servidor. Restrições da interface existem apenas para orientar o operador.

## Central operacional

### Criação

Os formulários de cadastro assistido e de criação manual devem incluir:

- finalidade;
- canal declarado;
- nota de contexto;
- código de campanha ou rastreamento, quando houver.

O responsável será obtido da sessão e não poderá ser escolhido ou falsificado pelo navegador.

### Lista e detalhe

A lista de clientes mostrará:

- origem;
- finalidade;
- responsável;
- estado de acesso: "Nunca acessou" ou data relativa do último acesso do cliente.

Haverá filtros por origem, finalidade, responsável e estado de acesso. O detalhe da empresa mostrará todos os campos de proveniência e o evento original na linha do tempo.

Registros anteriores à implantação devem aparecer claramente como "Legado sem rastreamento". A interface não deve adivinhar sua origem.

## Privacidade e segurança

- `creation_metadata` e o evento de auditoria não podem armazenar senha, cookie, token, cabeçalho de autorização ou conteúdo integral de requisições.
- IP e user-agent seguem as mesmas regras de acesso e retenção dos logs de auditoria existentes.
- O servidor deriva o responsável da sessão autenticada.
- Filtros e respostas da Central permanecem restritos a administradores autorizados.
- A nota de criação deve aceitar texto simples com limite de 500 caracteres.

## Erros e comportamento operacional

- Origem ou finalidade inválida retorna HTTP 422 com mensagem acionável.
- Cadastro interno sem responsável, nota ou canal exigido retorna HTTP 422 antes de qualquer gravação.
- Falha ao registrar `company.created` impede a conclusão do cadastro.
- Tentativas duplicadas devem manter os mecanismos de idempotência existentes e não gerar duas empresas ou dois eventos de criação.
- Valores de proveniência desconhecidos na leitura devem ser exibidos de forma neutra, sem quebrar a lista ou o detalhe.

## Testes e critérios de aceitação

### Contrato de proveniência

- Cada origem aceita produz campos normalizados e um evento `company.created`.
- Combinações inválidas são rejeitadas antes da persistência.
- `lead_capture` sem canal rastreável é rejeitado.
- Metadados sensíveis são removidos do evento.

### Fluxos de criação

- Cadastro público grava `self_service/customer_request`.
- Cadastro assistido grava `assisted` e o operador autenticado.
- Criação pela Central grava `platform_admin` e o operador autenticado.
- Automações, importações e API identificam corretamente o sistema de origem.
- Uma falha na auditoria não deixa uma empresa parcial.

### Acessos

- Login direto bem-sucedido atualiza `last_customer_login_at`.
- Login malsucedido não atualiza o campo.
- Impersonação, edição interna, automação e visita pública não atualizam o campo.
- Empresas sem login direto aparecem como "Nunca acessou".

### Central

- Lista e detalhe exibem a proveniência correta.
- Todos os filtros podem ser combinados e paginados.
- Registros antigos aparecem como "Legado sem rastreamento".
- Datas usam o fuso `America/Sao_Paulo` na apresentação, preservando UTC no banco.

## Fora do escopo

- Investigar ou classificar automaticamente empresas existentes.
- Alterar a origem original de cadastros antigos.
- Integrar uma nova ferramenta externa de CRM.
- Medir visitas ao cardápio público como acesso do cliente.
- Criar pontuação de leads ou automação de follow-up nesta entrega.

## Implantação

A implantação deve ocorrer em uma única versão coordenada de schema, servidor e interface. Como as colunas aceitam nulo para registros legados, não é necessário backfill. Após a publicação, um teste de fumaça deve criar uma empresa de teste com finalidade `internal_test`, confirmar os campos e o evento, validar que o acesso interno não conta como acesso do cliente e remover os dados de teste pelo procedimento operacional existente.
