# Cadastro assistido pelo WhatsApp — design

## Objetivo

Transformar o contato vindo da landing page em uma experiência humana de implantação: o interessado responde perguntas e envia o cardápio; a equipe TáPronto configura, revisa e publica tudo. O cliente não precisa cadastrar produtos nem aprender o sistema antes de enxergar valor.

A promessa pública central será:

> Você responde. A gente deixa tudo pronto.

## Escopo da primeira versão

A primeira versão inclui:

- CTA da landing direcionado ao WhatsApp;
- registro do clique e da atribuição de marketing;
- criação manual do lead identificado na Central;
- cadastro assistido em formato de roteiro com salvamento automático;
- recebimento de cardápio por foto, PDF, texto ou planilha/lista;
- extração do conteúdo para um rascunho estruturado;
- revisão obrigatória do cardápio;
- criação atômica de empresa, loja, administrador, cardápio e assinatura pendente;
- publicação automática após a confirmação final;
- e-mail de boas-vindas e criação de senha;
- início dos sete dias grátis somente na criação da senha;
- métricas operacionais e de conversão do fluxo.

Não fazem parte desta versão um CRM completo, chatbot de vendas, resposta automática ao WhatsApp, publicação sem revisão ou autoatendimento do lead.

## Experiência pública

### Chamada principal

O botão principal deixa de usar “Cadastrar grátis” e passa a usar:

> Quero que montem para mim

O bloco próximo ao botão comunica:

> Você responde. A gente deixa tudo pronto.

> Conte como funciona seu delivery e envie seu cardápio. Nossa equipe cadastra sua loja, organiza os produtos e deixa seu cardápio digital pronto para receber pedidos.

Texto auxiliar:

> Atendimento pelo WhatsApp · sem cartão · 7 dias grátis depois de criar sua senha

O botão usa o ícone oficial do WhatsApp, destaque verde e animação suave de pulso. A animação respeita `prefers-reduced-motion` e não deve piscar agressivamente.

### Clique no WhatsApp

O clique:

1. registra `whatsapp_click` com página, campanha e parâmetros de atribuição disponíveis;
2. abre o WhatsApp no número comercial configurado;
3. preenche a mensagem: “Olá! Quero que vocês montem meu cardápio digital. Como podemos começar?”

O clique não cria empresa ou usuário e não tenta inferir o telefone do visitante. A atribuição do clique permanece agregada. O lead identificado nasce quando o operador informa o telefone na Central.

## Cadastro assistido na Central

### Lista

A Central terá uma área “Cadastros assistidos” com lista compacta e pesquisa por telefone, CPF/CNPJ, e-mail ou estabelecimento. Cada linha apresenta:

- responsável;
- telefone;
- estabelecimento;
- etapa atual;
- origem/campanha, quando informada;
- última atualização;
- ações “Continuar”, “Publicar” ou “Reenviar e-mail”, conforme o estado.

Estados permitidos:

1. `new` — novo;
2. `in_progress` — em atendimento;
3. `awaiting_menu` — aguardando cardápio;
4. `reviewing_menu` — revisando;
5. `ready_to_publish` — pronto para publicar;
6. `published` — publicado, aguardando ativação;
7. `activated` — senha criada e teste iniciado;
8. `cancelled` — atendimento encerrado sem publicação.

Transições inválidas devem ser rejeitadas pelo servidor. O rascunho pode ser fechado e retomado sem perder respostas.

### Perguntas

#### Contato

- nome do responsável;
- telefone;
- e-mail;
- CPF ou CNPJ.

CPF e CNPJ são obrigatórios, aceitos com ou sem formatação, validados pelos dígitos verificadores e armazenados normalizados. Antes de prosseguir, o sistema pesquisa documento, telefone e e-mail em rascunhos, administradores, empresas e lojas. Uma possível duplicidade deve abrir o registro existente para decisão do operador, nunca criar silenciosamente outra conta.

#### Estabelecimento

- nome do delivery;
- nicho;
- cidade e endereço;
- Instagram;
- WhatsApp que recebe pedidos.

#### Operação

- entrega, retirada ou ambos;
- meios de pagamento;
- horários;
- bairros e taxas de entrega;
- média aproximada de pedidos.

#### Diagnóstico consultivo

- “O que mais toma seu tempo nos pedidos?”
- “Já recebeu pedido com item ou adicional errado?”
- “Seus clientes conseguem ver preços e opções atualizados?”
- “Como você acompanha o que está aguardando, preparando e pronto?”

Essas respostas ajudam o atendimento, mas não bloqueiam a publicação. Não serão usadas para decisões automatizadas ou promessas comerciais enganosas.

#### Identidade visual

- logo;
- capa;
- cores;
- observações.

Logo e capa são opcionais. O sistema usa o tema padrão quando não forem fornecidos.

## Entrada e interpretação do cardápio

### Formatos

O operador pode anexar:

- uma ou várias imagens;
- PDF;
- texto digitado ou colado;
- planilha ou lista simples em formato suportado.

Arquivos seguem os limites de tamanho, MIME type e armazenamento já usados pelo projeto. O servidor não confia somente na extensão. O conteúdo original permanece associado ao rascunho para conferência, sem ser exposto publicamente.

### Modelo intermediário

A extração produz um modelo intermediário versionado, separado das tabelas definitivas do cardápio:

- categorias;
- produtos;
- descrições;
- preços;
- tamanhos ou variações;
- grupos de adicionais;
- adicionais e preços;
- marcação de disponibilidade;
- confiança e observações por campo.

O importador nunca inventa preço. Informação ausente ou ambígua recebe a situação `needs_review`.

### Revisão obrigatória

A tela de revisão mostra o arquivo original e o resultado interpretado. O operador pode:

- editar em linha;
- adicionar, excluir ou duplicar;
- mover produtos entre categorias;
- configurar adicionais;
- marcar um campo como conferido.

A publicação fica bloqueada enquanto houver:

- produto sem nome;
- preço inválido quando o produto exige preço;
- produto sem categoria;
- campo obrigatório marcado como `needs_review`;
- erro estrutural em grupo de adicionais.

Não haverá opção “publicar sem revisar” na primeira versão.

## Persistência e isolamento

Novas estruturas guardam somente o atendimento antes da publicação:

- `assisted_registrations`: identidade, status, respostas, atribuição, operador e vínculos finais;
- `assisted_registration_files`: metadados dos arquivos e armazenamento;
- `assisted_menu_drafts`: versão atual do conteúdo interpretado, resultado da validação e histórico mínimo de revisões.

Os rascunhos não entram em métricas de clientes ativos, lojas publicadas ou MRR. Empresa, loja, administrador e assinatura não existem antes da confirmação final.

Dados sensíveis seguem DTOs explícitos e redaction de logs. Acesso às rotas exige administrador da plataforma com permissão apropriada. Arquivos e rascunhos não podem ser acessados por administradores de lojas.

## Publicação atômica

O botão final será “Concluir e publicar”. Antes da execução, a Central mostra um resumo e exige confirmação do operador.

Em uma única transação do banco, o servidor:

1. bloqueia o rascunho para impedir duas publicações concorrentes;
2. repete as verificações de duplicidade;
3. valida o cardápio revisado;
4. cria empresa;
5. cria loja e configurações;
6. cria administrador inativo e sem senha utilizável;
7. cria categorias, produtos, grupos e adicionais;
8. cria assinatura no estado de pré-ativação, sem iniciar o trial;
9. marca a loja como publicada;
10. grava os vínculos finais e o estado `published` no cadastro assistido;
11. registra os eventos e auditoria necessários.

Uma chave de idempotência associada ao rascunho impede duplicação por duplo clique ou repetição da requisição. Falha antes do commit desfaz todas as criações. O envio do e-mail ocorre depois do commit e pode ser repetido sem duplicar a conta.

## Ativação e teste grátis

Após a publicação, o sistema cria um token de ativação de uso único e envia um e-mail com o assunto:

> Seu cardápio TáPronto já está pronto 🎉

O e-mail contém:

- nome e logo do estabelecimento;
- prévia ou link do cardápio publicado;
- mensagem de que o cliente respondeu e a equipe cuidou do restante;
- botão “Criar minha senha e começar”;
- informação de que os sete dias começam depois da criação da senha;
- canal de suporte.

O token tem validade, é armazenado somente como hash e pode ser substituído por um reenvio. Reenviar o e-mail não inicia nem amplia o teste.

Ao criar a senha:

1. o token é validado e consumido;
2. o administrador é ativado;
3. a assinatura muda de pré-ativação para trial;
4. `trial_ends_at` recebe exatamente sete dias a partir daquele momento;
5. uma sessão opaca segura é criada;
6. o cadastro assistido muda para `activated`;
7. o evento `signup_completed` é registrado uma única vez;
8. o cliente entra no painel.

Ativações repetidas não reiniciam o trial.

## Métricas

A Central exibirá:

- cliques no WhatsApp;
- cadastros assistidos iniciados;
- cardápios recebidos;
- cardápios prontos para revisão;
- cardápios publicados;
- e-mails enviados e falhos;
- contas ativadas;
- testes iniciados;
- assinaturas criadas posteriormente.

Cliques de anúncio continuam agregados por UTM. Como o telefone não está disponível no navegador, o sistema não afirma uma ligação individual entre clique e cadastro. O operador pode registrar manualmente a origem declarada no atendimento, preservada separadamente da atribuição técnica.

## Tratamento de falhas

- Falha na interpretação mantém o arquivo e permite nova tentativa.
- Falha no envio do e-mail mantém o estado `published` e oferece reenvio.
- Duplicidade encontrada na publicação retorna o registro conflitante de forma segura ao operador.
- Falha transacional não deixa empresa, loja ou cardápio parcial.
- Arquivos inválidos são rejeitados antes da interpretação.
- Operações longas mostram estado e podem ser retomadas sem repetição indevida.

## Testes obrigatórios

- CTA, mensagem pronta, tracking e `prefers-reduced-motion`;
- criação, salvamento automático, retomada e transições do rascunho;
- validação e normalização de CPF/CNPJ;
- detecção de duplicidade por documento, telefone e e-mail;
- autorização exclusiva da Central;
- upload permitido e rejeição de tipo/tamanho inválido;
- importação de imagem, PDF, texto e planilha/lista;
- marcação de ambiguidades sem fabricação de dados;
- bloqueio de publicação sem revisão completa;
- publicação transacional e idempotente;
- ausência de rascunhos nas métricas financeiras e de clientes ativos;
- falha e reenvio do e-mail;
- token de uso único e expirável;
- início único dos sete dias na criação da senha;
- manutenção dos fluxos atuais de cadastro, cardápio, assinatura e segurança.

## Critérios de sucesso

- O interessado entende que não precisará configurar o sistema sozinho.
- O contato chega ao WhatsApp sem formulário público adicional.
- O operador consegue concluir o atendimento em etapas e retomar depois.
- Nenhuma loja é criada antes da confirmação final.
- Todo cardápio é revisado antes da publicação.
- O cliente recebe uma loja publicada e cria apenas sua senha.
- Os sete dias começam exatamente na primeira ativação.
- Nenhum rascunho distorce clientes ativos, lojas publicadas ou MRR.
