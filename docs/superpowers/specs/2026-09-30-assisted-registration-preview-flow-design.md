# Fluxo de cadastro assistido com prévia

## Objetivo

Permitir que a equipe TáPronto receba os dados e materiais de um estabelecimento, monte o cardápio, revise a loja diretamente no painel administrativo e somente depois conclua o cadastro e envie o acesso ao cliente.

O cliente continua sem precisar configurar o sistema: ele responde às perguntas, envia os materiais disponíveis e recebe a conta pronta para criar a senha e iniciar o teste.

## Escopo

Esta mudança cobre:

- reorganização visual do cadastro assistido na Central;
- pagamentos e atendimento com controles selecionáveis;
- funcionamento por dia, igual à configuração do painel administrativo;
- upload separado de materiais de interpretação, fotos de produtos e identidade da loja;
- interpretação de cardápios com estados claros de processamento, sucesso e erro;
- associação revisável de fotos aos produtos;
- criação da loja em estado de prévia, sem e-mail e sem início do teste;
- acesso temporário e auditado do Admin Master ao painel da nova loja;
- visualização do cardápio público;
- conclusão manual do cadastro, com envio do e-mail e posterior ativação pelo cliente.

Não fazem parte desta primeira versão:

- CRM;
- automação comercial complexa;
- publicação automática de associações incertas de imagens;
- reconhecimento perfeito de cardápios sem revisão humana;
- criação de fotos de produtos por IA.

## Fluxo do operador

1. O operador cria ou abre um cadastro assistido.
2. Registra as respostas de descoberta, contato e estabelecimento.
3. Configura atendimento, pagamentos e funcionamento.
4. Envia os arquivos nas áreas correspondentes.
5. Solicita a interpretação do cardápio e acompanha seu resultado.
6. Corrige categorias, produtos, preços, descrições e adicionais.
7. Confirma ou altera as associações sugeridas para fotos de produtos.
8. Confirma a revisão obrigatória.
9. Clica em `Criar prévia e revisar no painel`.
10. O sistema cria empresa, loja, configurações, produtos e imagens sem enviar e-mail e sem iniciar o teste.
11. O operador entra no painel administrativo por uma sessão temporária e auditada.
12. No painel, corrige imperfeições e pode abrir o cardápio público em outra aba.
13. O operador volta à Central e clica em `Concluir cadastro e enviar acesso`.
14. O sistema gera um novo token de ativação, envia o e-mail e registra o status do envio.
15. Quando o cliente cria a senha, a conta é ativada e o teste gratuito de sete dias começa.

## Estados do cadastro

Os estados existentes serão preservados quando ainda fizerem sentido e ampliados para separar criação e conclusão:

- `new`: atendimento criado;
- `in_progress`: perguntas e configurações sendo preenchidas;
- `awaiting_menu`: aguardando materiais;
- `interpreting_menu`: interpretação em processamento;
- `reviewing_menu`: cardápio em revisão;
- `ready_for_preview`: revisão da Central confirmada;
- `preview_created`: loja criada e disponível para conferência interna;
- `preview_reviewed`: operador confirmou a conferência no painel e no cardápio público;
- `published`: cadastro concluído e e-mail de acesso enviado ou tentado;
- `activated`: cliente criou a senha e iniciou o teste;
- `cancelled`: atendimento cancelado.

Transições inválidas devem retornar erro sem modificar dados. Repetir `Criar prévia` ou `Concluir cadastro` deve ser idempotente.

## Arquivos e imagens

### Materiais para interpretação

Aceitam:

- JPEG, PNG e WebP de cardápios;
- PDF com texto ou páginas digitalizadas;
- XLSX;
- CSV;
- TXT;
- texto colado.

Esses materiais são privados e servem como fonte da interpretação. Eles não se tornam automaticamente imagens públicas do cardápio.

Cada arquivo deve mostrar nome, tipo, tamanho, estado do upload e opção de remoção. O botão de interpretar fica indisponível até existir ao menos um material válido ou texto colado.

### Fotos de produtos

Fotos de produtos são enviadas separadamente. Para cada imagem, o sistema pode sugerir um produto usando nome do arquivo, nome reconhecido e similaridade com os produtos interpretados.

Cada sugestão deve exibir:

- miniatura;
- produto sugerido;
- confiança ou indicação de dúvida;
- seletor para trocar o produto;
- opção `Não usar agora`.

A associação só é aplicada depois da confirmação do operador. Uma foto não confirmada nunca será publicada automaticamente.

### Identidade da loja

Logo e capa possuem campos separados, com miniatura, substituição e remoção. Os arquivos são enviados pelo mesmo pipeline seguro já usado pelo painel administrativo.

## Interpretação do cardápio

O comando `Interpretar cardápio` deve apresentar os estados:

- pronto para interpretar;
- enviando arquivos;
- interpretando;
- concluído, com quantidade de categorias e produtos;
- concluído com itens que exigem revisão;
- falha, com mensagem acionável e opção de tentar novamente.

A API deve combinar materiais enviados e texto colado, preservando a origem de cada execução. Uma nova interpretação não pode apagar silenciosamente correções manuais existentes. Quando já houver rascunho, o operador escolhe entre substituir a interpretação ou acrescentar novos resultados.

Erros do provedor visual devem ser registrados sem armazenar conteúdo sensível nos logs. A interface não pode capturar a falha silenciosamente.

## Configurações operacionais

### Formas de pagamento

Reutilizar as opções do painel administrativo:

- Pix;
- Dinheiro;
- Cartão de débito;
- Cartão de crédito;
- Pagamento online;
- Vale-refeição;
- outras formas, em campo complementar.

Os controles serão checkboxes estilizados como botões, mantendo semântica nativa, teclado, foco visível e área de toque adequada.

### Funcionamento

Reutilizar o mesmo modelo `business_hours` do painel:

- segunda a domingo;
- horário de abertura;
- horário de fechamento;
- opção `Fechado` por dia.

Não haverá conversão heurística de um texto livre para todos os dias. A Central gravará diretamente o objeto aceito pelo app.

### Atendimento

Delivery, retirada e balcão serão checkboxes selecionáveis. Ao selecionar delivery, permanecem disponíveis endereço, bairros e taxas conforme o modelo atual do sistema.

## Criação da prévia

`Criar prévia e revisar no painel` executa uma transação que:

- valida identidade, configurações e revisão do cardápio;
- cria empresa, loja, configurações e produtos;
- associa imagens confirmadas;
- cria o futuro administrador como inativo;
- cria a assinatura em `pending_activation`, sem iniciar o trial;
- mantém `email_status` como `not_sent`;
- grava os IDs criados no cadastro assistido;
- não cria ou envia token de ativação nesse momento.

A loja fica disponível para revisão interna. A abertura do painel usa o mecanismo de suporte temporário já existente, limitado à loja criada, com expiração curta e auditoria. Não serão compartilhadas credenciais do futuro cliente.

O painel deve oferecer uma ação clara para abrir o cardápio público em outra aba. Pedidos reais permanecem bloqueados enquanto o cadastro estiver em prévia.

## Conclusão e e-mail

`Concluir cadastro e enviar acesso` exige:

- prévia criada;
- última versão do cardápio conferida;
- confirmação explícita do operador;
- e-mail válido;
- conta ainda não ativada.

Na conclusão, o sistema:

1. invalida tokens anteriores pendentes;
2. cria um token de ativação com validade de sete dias;
3. muda o cadastro para `published`;
4. envia o e-mail de boas-vindas com o link para criar a senha;
5. registra `sent` ou `failed` em `email_status` e um código seguro de erro quando houver falha.

Se o SMTP falhar, a loja permanece criada e revisada, a interface mostra a falha e oferece reenvio. Nenhum trial é iniciado até o cliente criar a senha.

## Interface e responsividade

A Central usará uma coluna principal com etapas compactas e estados visíveis. No desktop, formulários relacionados podem usar duas colunas; no celular, todos os campos ficam em uma coluna.

Regras de layout:

- largura máxima consistente para o editor;
- cards com padding, raio e bordas padronizados;
- campos sem alturas fixas frágeis;
- labels e mensagens alinhados;
- ações principais agrupadas no final da etapa;
- botões secundários visualmente menos proeminentes;
- listas de produtos e imagens com rolagem interna somente quando necessário;
- alvos de toque de pelo menos 44 px;
- foco visível, mensagens em regiões `aria-live` e estados que não dependem apenas de cor.

## Modelo de dados e migração

Será necessária uma migração para:

- adicionar os novos estados do cadastro assistido;
- registrar quando a prévia foi criada e revisada;
- registrar a versão do cardápio conferida na prévia;
- classificar arquivos por finalidade (`menu_source`, `product_photo`, `store_logo`, `store_cover`);
- registrar associações propostas e confirmadas entre arquivos e produtos;
- preservar código seguro da última falha de interpretação ou e-mail.

Os registros atuais continuam válidos. Cadastros ainda não publicados permanecem em revisão; publicados e ativados mantêm seus estados atuais.

## Segurança e consistência

- Arquivos permanecem privados até serem promovidos para mídia pública confirmada.
- Downloads de fontes exigem sessão de Admin Master.
- Acesso ao painel de prévia é temporário, limitado à loja e auditado.
- IDs de cadastro, arquivo, loja e produto são sempre validados por pertencimento.
- Criação de prévia e conclusão usam transações e chaves de idempotência.
- Tokens de ativação não aparecem em URLs de logs nem em respostas destinadas à interface da Central.
- Logs de IA e e-mail não armazenam arquivos, cardápios completos, tokens ou dados pessoais desnecessários.

## Testes e critérios de aceite

### Domínio e API

- materiais válidos e inválidos;
- interpretação por texto, PDF, planilha e imagem;
- falha visível quando o provedor visual estiver indisponível;
- substituição ou acréscimo de uma nova interpretação;
- associação confirmada e não confirmada de fotos;
- pagamentos e horários preservados sem transformação incorreta;
- criação de prévia idempotente e sem e-mail;
- bloqueio de pedidos reais durante a prévia;
- sessão temporária limitada à loja correta;
- conclusão idempotente com token e e-mail;
- falha SMTP com reenvio seguro;
- início do trial somente após criação da senha.

### Interface

- upload mostra progresso e resultado;
- interpretação nunca falha silenciosamente;
- controles de pagamento e funcionamento operam por teclado e toque;
- layout validado em larguras de 320, 375, 768 e desktop;
- textos longos, preços pendentes, ausência de imagens e muitos produtos não quebram o layout;
- ações indisponíveis explicam o requisito pendente;
- o operador consegue entrar no painel, abrir o cardápio público e retornar à Central.

### Regressão

- cadastros assistidos existentes continuam abrindo;
- publicação tradicional de lojas não é alterada;
- cardápio demo não entra em métricas ou alertas reais;
- login, ativação, pagamentos e pedidos continuam passando pela suíte completa.

## Implantação

A implantação será incremental:

1. migração compatível com os estados atuais;
2. backend com novos endpoints e idempotência;
3. interface da Central e reaproveitamento dos controles;
4. prévia e suporte temporário;
5. conclusão e envio de e-mail;
6. testes completos, backup e publicação controlada.

Não haverá envio retroativo de e-mail. O cadastro atual da Thaina permanecerá sem envio até ser processado pelo novo fluxo ou concluído manualmente depois da implantação.
