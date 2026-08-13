const HELP_CATEGORIES = [
  'Todos',
  'Primeiros passos',
  'Onboarding',
  'Cadastro e login',
  'Configuração da loja',
  'Cardápio e produtos',
  'Pedidos',
  'Relatórios',
  'Clientes e promoções',
  'WhatsApp',
  'Pagamento online',
  'Mesas e QR Code',
  'Mesas e comandas',
  'Planos e assinatura',
  'Indicações',
  'Conta e equipe',
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
  article('criar-conta-mercado-pago', 'Como criar uma conta no Mercado Pago para receber pagamentos online', 'Pagamento online', 'Crie e prepare sua conta do Mercado Pago, gere as credenciais corretas e conecte o Pix online ao TáPronto com segurança.', [
    { title: 'Separe os dados do responsável e da empresa', detail: 'Tenha acesso ao celular e ao e-mail que ficarão vinculados à conta. Se a loja possui CNPJ ou MEI, deixe também os dados da empresa e do responsável legal em mãos.' },
    { title: 'Crie a conta oficial do Mercado Pago', detail: 'Acesse mercadopago.com.br, clique em Criar conta e escolha conta pessoal ou conta de empresa conforme a realidade da loja. Para um negócio com CNPJ ou MEI, prefira a conta empresarial.' },
    { title: 'Confirme telefone, e-mail e identidade', detail: 'Digite somente dados verdadeiros e conclua as confirmações solicitadas pelo Mercado Pago. A análise e a liberação de recursos dependem da validação da identidade do titular.' },
    { title: 'Proteja a conta antes de receber vendas', detail: 'Crie uma senha exclusiva, ative a verificação em duas etapas e nunca compartilhe códigos recebidos por SMS, WhatsApp ou e-mail.' },
    { title: 'Entre no painel de desenvolvedores', detail: 'Com a conta aprovada e conectada, abra mercadopago.com.br/developers/panel/app. Essa é a área chamada Suas integrações.' },
    { title: 'Crie uma aplicação para o TáPronto', detail: 'Clique em Criar aplicação, use um nome fácil de reconhecer, como “TáPronto - nome da loja”, e escolha pagamentos online. A aplicação é o vínculo seguro entre sua conta e os pedidos da loja.' },
    { title: 'Ative as credenciais de produção', detail: 'Abra Produção > Credenciais de produção. Informe o ramo do negócio, aceite os termos e use o endereço público do seu cardápio TáPronto no campo Website.' },
    { title: 'Copie somente o Access Token', detail: 'Entre Public Key, Access Token, Client ID e Client Secret, o TáPronto usa o Access Token de produção, normalmente iniciado por APP_USR-. Nunca envie essa chave por mensagem nem publique capturas mostrando seu valor.' },
    { title: 'Cadastre a URL de notificações', detail: 'Na aplicação, abra Webhooks > Configurar notificações. Em Modo de produção, informe https://app.taprontomenu.com.br/api/payments/webhook?provider=mercadopago.' },
    { title: 'Selecione o evento correto', detail: 'Marque Pagamentos (legacy). Não marque Planos e assinaturas nem Order (Mercado Pago) para o Pix online usado atualmente pelo TáPronto.' },
    { title: 'Salve e copie a assinatura secreta', detail: 'Ao salvar o webhook, o Mercado Pago gera uma assinatura secreta. Ela permite confirmar que a notificação é verdadeira. Não renove a assinatura depois de cadastrá-la, salvo se também substituir a chave no TáPronto.' },
    { title: 'Conecte a conta no TáPronto', detail: 'No painel da loja, acesse Integrações > Pagamento online. Ative o Pix online, cole o Access Token e a assinatura secreta nos campos correspondentes e salve.' },
    { title: 'Use o teste de conexão', detail: 'Clique em Testar integrações. Se aparecer não autorizado, confira se copiou o Access Token de produção completo, sem espaços.' },
    { title: 'Faça um pedido real de baixo valor', detail: 'Abra o cardápio como cliente, monte um pedido barato, escolha pagamento online e conclua o Pix. O pedido só deve ser liberado para a loja depois da aprovação.' },
    { title: 'Confira o recebimento e a conciliação', detail: 'Abra o painel do Mercado Pago, confira o valor recebido e compare o número do pedido com o TáPronto. Antes de divulgar o Pix online, teste também cancelamento e estorno.' }
  ], 'O TáPronto nunca precisa da senha da sua conta Mercado Pago. Informe somente o Access Token e a assinatura secreta nos campos protegidos do painel.', {
    updatedAt: '13/08/2026', readTime: 10,
    before: ['Celular com acesso ao e-mail do responsável.', 'CPF do titular ou CNPJ/MEI e dados do responsável legal.', 'Link público do cardápio TáPronto.', 'Conta bancária vinculada ao responsável correto pelo negócio.'],
    outcome: 'O teste mostrará o Mercado Pago conectado e um pedido pago por Pix será liberado automaticamente no painel da loja.',
    troubleshooting: ['Access Token inválido: confirme que usou a credencial de produção normalmente iniciada por APP_USR-, e não a Public Key.', 'Webhook não confirmado: confira a URL de produção, marque Pagamentos (legacy) e copie novamente a assinatura secreta.', 'Conta em análise: conclua a validação de identidade e aguarde a liberação informada pelo Mercado Pago.', 'Pagamento aprovado não chegou: confira o webhook e abra um chamado com o número do pedido, sem enviar suas chaves.'],
    sources: [
      { label: 'Criar ou acessar sua integração no Mercado Pago', url: 'https://www.mercadopago.com.br/developers/panel/app' },
      { label: 'Documentação oficial de credenciais', url: 'https://www.mercadopago.com.br/developers/pt/docs/your-integrations/credentials' },
      { label: 'Documentação oficial de webhooks', url: 'https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks' }
    ]
  }),
  article('configurar-pix-online', 'Como configurar Pix online', 'Pagamento online', 'Conecte Mercado Pago para receber pagamento antes de enviar o pedido.', [
    'Acesse Integrações.',
    'Ative Pix online.',
    'Cole o Access Token de produção do Mercado Pago.',
    'Cadastre a URL de webhook exibida no painel do Mercado Pago e copie a assinatura secreta.',
    'Salve e teste um pedido de baixo valor.'
  ], 'Se preferir, solicite configuração assistida pela equipe TáPronto.'),
  article('como-funciona-pagamento-online', 'Como funciona o pagamento online', 'Pagamento online', 'Entenda quando o pedido é enviado para a loja.', [
    'O cliente monta a sacola e escolhe pagamento online.',
    'Ao confirmar, abre uma janela de pagamento do Mercado Pago.',
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
  ], 'Notas internas da equipe não aparecem para o lojista.'),
  article('concluir-onboarding', 'Como concluir a configuração inicial', 'Onboarding', 'Complete o checklist necessário para publicar a loja com segurança.', [
    'Entre no painel e abra o checklist de configuração inicial.',
    'Confirme os dados e a identidade visual da loja.',
    'Defina atendimento, formas de pagamento, entrega e retirada.',
    'Cadastre pelo menos uma categoria e um produto disponível.',
    'Revise o resumo, resolva os itens pendentes e clique em Publicar cardápio.',
    'Abra o link público pelo celular e faça um pedido teste.'
  ], 'A loja só deve ser divulgada depois que o pedido teste chegar corretamente ao painel.'),
  article('configurar-horarios', 'Como configurar horários de funcionamento', 'Configuração da loja', 'Defina os dias e horários em que o cardápio pode aceitar pedidos.', [
    'Acesse Configurações da Loja e localize Horários.',
    'Ative apenas os dias em que a loja atende.',
    'Informe abertura e fechamento de cada período.',
    'Se houver intervalo, cadastre dois períodos no mesmo dia.',
    'Salve e confira no cardápio se o status aberto ou fechado está correto.'
  ], 'A abertura manual não substitui uma grade de horários incorreta. Revise também o fuso e o horário do servidor.'),
  article('configurar-entrega-retirada', 'Como configurar entrega e retirada', 'Configuração da loja', 'Escolha como o cliente receberá o pedido e defina taxas por bairro.', [
    'Abra Configurações da Loja e entre em Entrega.',
    'Ative entrega, retirada ou as duas modalidades.',
    'Informe pedido mínimo e taxa padrão, quando existirem.',
    'Cadastre cada bairro atendido com sua respectiva taxa.',
    'Salve e simule endereços diferentes no checkout.'
  ], 'Evite nomes duplicados para o mesmo bairro. Isso facilita a escolha e reduz cobrança incorreta.'),
  article('configurar-pagamentos-pedido', 'Como configurar formas de pagamento do pedido', 'Configuração da loja', 'Informe se a loja aceita Pix, cartão ou dinheiro na entrega e retirada.', [
    'Acesse Configurações da Loja e abra Pagamentos.',
    'Marque apenas os meios realmente aceitos pela operação.',
    'Diferencie Pix informado pela loja de Pix online integrado.',
    'Se aceitar dinheiro, confirme se o checkout solicita troco.',
    'Salve e faça um pedido teste para cada modalidade.'
  ], 'Pagamento manual não recebe confirmação automática. Para isso, configure o Pix online em Integrações.'),
  article('personalizar-aparencia', 'Como personalizar logo, capa e cores', 'Configuração da loja', 'Aplique a identidade da sua loja ao cardápio público.', [
    'Abra Configurações da Loja e entre em Aparência.',
    'Envie uma logo nítida e uma imagem de capa horizontal.',
    'Escolha cores com bom contraste para texto e botões.',
    'Salve as alterações.',
    'Abra o cardápio no celular e confira legibilidade e recorte das imagens.'
  ], 'Use imagens leves em JPG, PNG ou WebP. Arquivos muito grandes deixam a primeira abertura mais lenta.'),
  article('imprimir-pedido', 'Como imprimir um pedido', 'Pedidos', 'Imprima os detalhes para balcão ou cozinha quando o recurso estiver disponível.', [
    'Abra Pedidos e selecione o pedido desejado.',
    'Confira itens, adicionais, observações e modalidade.',
    'Clique em Imprimir pedido.',
    'Escolha a impressora no diálogo do navegador.',
    'Confirme se todas as linhas ficaram legíveis antes de enviar à produção.'
  ], 'Faça uma impressão teste depois de trocar impressora, navegador ou tamanho do papel.'),
  article('cancelar-pedido', 'Como cancelar um pedido', 'Pedidos', 'Registre o cancelamento sem apagar o histórico da operação.', [
    'Abra o pedido e confirme que ele ainda pode ser cancelado.',
    'Selecione o status Cancelado.',
    'Informe ou registre o motivo quando solicitado.',
    'Se houve pagamento online, verifique a situação financeira separadamente.',
    'Avise o cliente e confirme que cozinha e entrega interromperam o atendimento.'
  ], 'Cancelar o pedido não significa necessariamente estornar um pagamento. Confira o evento financeiro.'),
  article('usar-relatorios', 'Como usar os relatórios da loja', 'Relatórios', 'Acompanhe pedidos, receita, ticket médio, produtos e formas de atendimento.', [
    'Abra a aba Relatórios.',
    'Escolha o período que deseja analisar.',
    'Confira pedidos concluídos, cancelados e receita do período.',
    'Compare produtos, horários e modalidades com maior movimento.',
    'Use a informação para ajustar cardápio, equipe e divulgação.'
  ], 'Relatório serve para orientar uma decisão. Evite concluir tendências usando apenas um dia atípico.'),
  article('consultar-clientes', 'Como consultar clientes e histórico', 'Clientes e promoções', 'Encontre contatos e pedidos anteriores vinculados à sua loja.', [
    'Acesse Clientes.',
    'Use nome, telefone ou outros filtros disponíveis.',
    'Abra o cadastro para conferir informações e histórico.',
    'Use os dados apenas para atendimento e comunicações autorizadas.',
    'Mantenha observações objetivas e respeite pedidos de exclusão.'
  ], 'Não exporte ou compartilhe dados de clientes com pessoas que não precisam acessá-los.'),
  article('criar-cupom', 'Como criar um cupom de desconto', 'Clientes e promoções', 'Configure código, benefício, validade e limite de utilização.', [
    'Abra Cupons e Campanhas.',
    'Clique em criar uma nova ação e escolha cupom.',
    'Defina código, desconto fixo, percentual ou entrega grátis.',
    'Configure período, pedido mínimo, limite total e limite por cliente.',
    'Escolha produtos ou categorias quando a oferta não valer para tudo.',
    'Salve e teste o cupom antes de divulgar.'
  ], 'Use limites coerentes com sua margem. O sistema bloqueia utilizações simultâneas acima do limite configurado.'),
  article('configurar-fidelidade', 'Como configurar o programa de fidelidade', 'Clientes e promoções', 'Defina a regra para recompensar clientes recorrentes.', [
    'Acesse Cupons e Campanhas.',
    'Abra a seção Programa de fidelidade.',
    'Ative o programa e defina a regra de acúmulo.',
    'Informe quando a recompensa poderá ser usada.',
    'Salve e faça uma simulação antes de anunciar.'
  ], 'Explique a regra em uma frase simples para que o cliente saiba como ganhar e usar o benefício.'),
  article('abrir-comanda', 'Como abrir e usar uma comanda', 'Mesas e comandas', 'Agrupe consumos de mesa, balcão ou cliente até o fechamento.', [
    'Acesse Mesas e comandas.',
    'Clique em Abrir comanda.',
    'Identifique a mesa ou o cliente e confirme a abertura.',
    'Adicione pedidos e itens à comanda correta.',
    'Revise o consumo antes de fechar.',
    'Confirme pagamento e encerramento para liberar a mesa.'
  ], 'Antes de adicionar itens, confira sempre o nome ou número da comanda para evitar transferência manual depois.'),
  article('gerenciar-mesas', 'Como gerenciar mesas e disponibilidade', 'Mesas e comandas', 'Acompanhe mesas livres, ocupadas e comandas abertas.', [
    'Abra Mesas e comandas.',
    'Cadastre ou revise a identificação das mesas.',
    'Use o status visual para localizar mesas ocupadas.',
    'Abra a comanda relacionada para conferir consumo.',
    'Finalize corretamente para devolver a mesa ao status livre.'
  ], 'Use nomes curtos e visíveis no ambiente, como Mesa 01, Varanda 02 ou Balcão 01.'),
  article('contratar-whatsapp-adicional', 'Como contratar WhatsApp automático', 'WhatsApp', 'Adicione notificações automáticas ao plano quando o recurso não estiver incluído.', [
    'Abra Meu plano ou Integrações.',
    'Localize o adicional WhatsApp automático.',
    'Confira preço, recorrência e recursos incluídos.',
    'Avance para o checkout e conclua o pagamento.',
    'Depois da ativação, volte a Integrações e conecte pelo QR Code.'
  ], 'Todos os planos podem contratar o adicional, exceto aquele que já inclui o WhatsApp automático.'),
  article('solicitar-configuracao-integracao', 'Como solicitar configuração assistida', 'Pagamento online', 'Contrate ajuda para configurar uma ou mais integrações em um único pedido.', [
    'Abra Integrações.',
    'Confira o banner de pendências no topo da página.',
    'Clique em Solicitar configuração.',
    'Selecione as configurações que deseja contratar e revise os valores.',
    'Conclua o checkout.',
    'Acompanhe o chamado criado automaticamente na aba Suporte.'
  ], 'O banner desaparece quando não há pendências ou quando já existe um chamado em andamento.'),
  article('usar-indicacoes', 'Como indicar o TáPronto e acompanhar créditos', 'Indicações', 'Compartilhe seu código e acompanhe indicações qualificadas.', [
    'Acesse Indicações.',
    'Copie seu link ou código individual.',
    'Compartilhe somente com estabelecimentos que possam se beneficiar.',
    'Acompanhe quando a conta indicada for criada.',
    'O crédito é liberado conforme as regras exibidas quando a indicação contratar.'
  ], 'Não publique seu código em listas de spam. Indicações relevantes têm maior chance de concluir o teste.'),
  article('alterar-dados-conta', 'Como alterar os dados da conta', 'Conta e equipe', 'Atualize nome, telefone e demais informações do seu acesso.', [
    'Abra Conta e Usuários.',
    'Localize Dados da conta.',
    'Atualize apenas as informações necessárias.',
    'Confirme o e-mail quando a alteração exigir nova validação.',
    'Salve e entre novamente se a sessão for renovada.'
  ], 'Dados da conta de acesso são diferentes dos dados públicos da loja.'),
  article('trocar-senha-conta', 'Como trocar a senha pelo painel', 'Conta e equipe', 'Crie uma nova senha quando ainda consegue acessar sua conta.', [
    'Acesse Conta e Usuários.',
    'Abra Trocar senha.',
    'Informe a senha atual.',
    'Digite e confirme uma nova senha forte.',
    'Salve e use a nova senha no próximo acesso.'
  ], 'Nunca compartilhe senha entre atendentes. Crie um acesso individual para cada pessoa.'),
  article('convidar-usuario-permissoes', 'Como convidar usuários e definir permissões', 'Conta e equipe', 'Dê a cada pessoa acesso somente ao que precisa usar.', [
    'Abra Conta e Usuários.',
    'Clique em convidar ou criar acesso.',
    'Informe nome e e-mail da pessoa.',
    'Escolha função e lojas permitidas.',
    'Envie o convite e aguarde a ativação.',
    'Revise ou remova o acesso quando a responsabilidade mudar.'
  ], 'Cozinha, entrega e atendimento não precisam receber permissões administrativas.'),
  article('excluir-conta-dados', 'Como solicitar exclusão da conta e dos dados', 'Conta e equipe', 'Entenda a confirmação necessária e os efeitos da exclusão.', [
    'Abra Conta e Usuários e localize Sua conta.',
    'Leia quais lojas, acessos e dados serão afetados.',
    'Regularize ou cancele assinaturas e pendências quando necessário.',
    'Confirme a solicitação com sua senha.',
    'Aguarde a confirmação e guarde os dados que precisa manter por obrigação legal.'
  ], 'A exclusão é uma ação crítica e pode ser irreversível. Não use essa opção apenas para fechar temporariamente a loja.')
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

function article(slug, title, category, summary, steps, tip = '', options = {}) {
  const guidance = categoryGuidance(category);
  return {
    slug, title, category, summary, steps, tip,
    updatedAt: options.updatedAt || '11/08/2026',
    readTime: options.readTime || Math.max(3, Math.ceil((steps.length + 3) / 2)),
    before: options.before || guidance.before,
    outcome: options.outcome || guidance.outcome,
    troubleshooting: options.troubleshooting || guidance.troubleshooting,
    sources: options.sources || []
  };
}

function categoryGuidance(category) {
  const common = {
    before: ['Entre no painel com um usuário que tenha permissão para essa área.', 'Confirme que está trabalhando na loja correta.'],
    outcome: 'A alteração deve aparecer no painel e permanecer depois de atualizar a página.',
    troubleshooting: ['Atualize a página e tente novamente.', 'Confira se seu plano e sua permissão liberam o recurso.', 'Se aparecer uma mensagem de erro, copie o texto e envie em um chamado.']
  };
  const byCategory = {
    'Primeiros passos': { before: ['Tenha em mãos um e-mail válido, telefone e nome da loja.'], outcome: 'Sua conta deve abrir o checklist inicial e mostrar a loja criada.' },
    'Cadastro e login': { before: ['Use o mesmo e-mail informado no cadastro.', 'Tenha acesso à caixa de entrada e ao spam.'], outcome: 'Você deve conseguir entrar no painel com uma sessão protegida.' },
    'Onboarding': { before: ['Tenha logo, horários, formas de atendimento e ao menos um produto.'], outcome: 'O checklist deve ficar concluído e o cardápio pronto para publicação.' },
    'Cardápio e produtos': { before: ['Crie ao menos uma categoria antes de cadastrar produtos.', 'Prepare nome, preço e foto do item.'], outcome: 'O item deve aparecer na categoria correta do cardápio público.' },
    'Pedidos': { before: ['Deixe a loja aberta e faça um pedido teste.', 'Confira se produtos e formas de atendimento estão ativos.'], outcome: 'O pedido deve permanecer no histórico com itens, total, cliente e status corretos.' },
    'Pagamento online': { before: ['Tenha uma conta ativa no provedor e credenciais válidas.', 'Nunca envie a chave da API em conversas ou capturas públicas.'], outcome: 'Um pedido teste deve aguardar a confirmação e avançar somente após o pagamento.' },
    'WhatsApp': { before: ['Use o celular e o número oficial da loja.', 'Confirme que o adicional ou plano está ativo.'], outcome: 'A conexão deve mostrar status ativo e receber a mensagem de teste.' },
    'Relatórios': { before: ['Escolha um período com pedidos reais ou de teste concluídos.'], outcome: 'Os totais e indicadores devem corresponder aos pedidos do período selecionado.' },
    'Clientes e promoções': { before: ['Defina objetivo, validade e limite antes de criar uma campanha.'], outcome: 'A regra deve funcionar no checkout sem ultrapassar os limites configurados.' },
    'Mesas e QR Code': { before: ['Defina uma identificação única para cada mesa da loja.'], outcome: 'O QR Code deve abrir o cardápio vinculado à mesa correta.' },
    'Mesas e comandas': { before: ['Cadastre as mesas e confirme que não existe uma comanda duplicada.'], outcome: 'A mesa e sua comanda devem refletir consumo e status corretos até o fechamento.' },
    'Planos e assinatura': { before: ['Confira plano atual, ciclo de cobrança e valor antes de confirmar.'], outcome: 'O novo status deve aparecer em Meu plano e liberar os recursos contratados.' },
    'Indicações': { before: ['Copie o link individual exibido no painel.'], outcome: 'A indicação deve aparecer no histórico conforme avançar no cadastro e pagamento.' },
    'Conta e equipe': { before: ['Use uma conta proprietária ou com permissão para gerenciar acessos.'], outcome: 'As alterações devem respeitar as permissões sem compartilhar senhas.' },
    'Suporte': { before: ['Anote o que tentou fazer, horário e mensagem exibida.'], outcome: 'O chamado deve aparecer no histórico e receber atualizações na mesma conversa.' }
  };
  return { ...common, ...(byCategory[category] || {}) };
}

function initHelp() {
  renderCategories();
  renderArticles();
  openHashArticle();
  trackHelpAccess();

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

function trackHelpAccess() {
  const payload = {
    page_type: 'ajuda',
    path: window.location.pathname,
    title: document.title,
    referrer: document.referrer,
    device_type: accessDeviceType(),
    visitor_key: accessVisitorKey(),
    source: 'help'
  };
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon('/api/analytics/access', new Blob([body], { type: 'application/json' }));
      if (sent) return;
    }
  } catch {}
  fetch('/api/analytics/access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true
  }).catch(() => {});
}

function accessDeviceType() {
  const width = window.innerWidth || 1024;
  if (width <= 767) return 'mobile';
  if (width <= 1024) return 'tablet';
  return 'desktop';
}

function accessVisitorKey() {
  const key = 'tapronto_access_visitor';
  try {
    let value = localStorage.getItem(key);
    if (!value) {
      value = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(key, value);
    }
    return value;
  } catch {
    return '';
  }
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
    const haystack = normalizeText(`${articleItem.title} ${articleItem.category} ${articleItem.summary} ${articleItem.steps.map(stepSearchText).join(' ')} ${articleItem.before.join(' ')} ${articleItem.troubleshooting.join(' ')}`);
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
    <div class="article-meta"><span>Atualizado em ${escapeHtml(articleItem.updatedAt)}</span><span>${articleItem.readTime} min de leitura</span><span>${articleItem.steps.length} passos</span></div>
    <p class="help-article-lead">${escapeHtml(articleItem.summary)}</p>
    <section class="help-before"><h2>Antes de começar</h2><ul>${articleItem.before.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>
    <h2>Passo a passo</h2>
    <ol class="help-step-list">${articleItem.steps.map((step, index) => `<li><span>${index + 1}</span><div><strong>${escapeHtml(stepTitle(step))}</strong><p>${escapeHtml(stepDescription(step, articleItem.category, index))}</p></div></li>`).join('')}</ol>
    <section class="help-outcome"><h2>Resultado esperado</h2><p>${escapeHtml(articleItem.outcome)}</p></section>
    ${articleItem.tip ? `<strong class="help-tip">Dica: ${escapeHtml(articleItem.tip)}</strong>` : ''}
    <section class="help-troubleshooting"><h2>Se algo não funcionar</h2><ul>${articleItem.troubleshooting.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul><a href="https://app.taprontomenu.com.br/?tab=support">Abrir um chamado no painel</a></section>
    ${articleItem.sources.length ? `<section class="help-sources"><h2>Links oficiais</h2><ul>${articleItem.sources.map((source) => `<li><a href="${escapeAttribute(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a></li>`).join('')}</ul></section>` : ''}
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

function stepTitle(step) {
  return typeof step === 'string' ? step : String(step?.title || '');
}

function stepDescription(step, category, index) {
  return typeof step === 'object' && step?.detail ? String(step.detail) : stepDetail(category, index);
}

function stepSearchText(step) {
  return typeof step === 'string' ? step : `${step?.title || ''} ${step?.detail || ''}`;
}

function stepDetail(category, index) {
  const details = [
    'Confira os dados antes de avançar para evitar retrabalho nas próximas etapas.',
    'Faça a alteração com calma e use somente informações confirmadas pela loja.',
    'Observe avisos e campos obrigatórios mostrados pelo painel.',
    'Salve a etapa e espere a confirmação antes de fechar a tela.',
    'Valide o resultado em outra tela ou pelo cardápio do cliente.',
    'Se for um teste, registre o resultado e corrija qualquer diferença encontrada.'
  ];
  const categoryNotes = {
    'Pagamento online': 'Não exponha credenciais e use um pedido de baixo valor na validação.',
    'Pedidos': 'Confirme sempre loja, número do pedido e status antes de alterar.',
    'Conta e equipe': 'Use acesso individual e conceda apenas as permissões necessárias.'
  };
  return index === 1 && categoryNotes[category] ? categoryNotes[category] : details[index % details.length];
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
