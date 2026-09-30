# Automação comercial autônoma pelo WhatsApp

## Objetivo

Usar a instância comercial já conectada à Evolution API v2 na rede local para abordar uma lista pequena e qualificada de estabelecimentos de Horizontina e região, conduzir conversas comerciais simples e gerar a primeira mensalidade do TáPronto sem exigir aprovação manual de cada mensagem.

O sistema existente de leads, conversas, mensagens, supressões, jobs e métricas será preservado. A mudança principal é adicionar um conector compatível com Evolution API v2 e permitir que a cadência aprovada opere em modo autônomo.

## Escopo inicial

- Importar leads por CSV ou JSON, com nome do estabelecimento, telefone, cidade, segmento e dados de personalização.
- Qualificar apenas contatos comerciais obtidos de fontes públicas e relacionados ao perfil atendido pelo TáPronto.
- Enviar automaticamente o primeiro contato, sem confirmação do operador.
- Interpretar respostas de texto e seguir um roteiro determinístico para os casos comuns.
- Enviar uma demonstração adequada ao segmento quando houver permissão do contato.
- Responder dúvidas comerciais simples com informações previamente configuradas e verificáveis.
- Encaminhar para atendimento humano preço fora da tabela, desconto, negociação, reclamação, mídia recebida, mensagem ambígua ou dúvida não prevista.
- Fazer no máximo um lembrete depois de 48 horas sem resposta.
- Interromper imediatamente novos envios quando houver resposta negativa, pedido de remoção ou bloqueio operacional.

## Princípios da conversa

As mensagens serão curtas, naturais e específicas ao estabelecimento. A primeira abordagem não enviará link e não tentará fechar a venda. Ela confirmará se o contato cuida dos pedidos e pedirá permissão para continuar.

O TáPronto será apresentado como apoio ao WhatsApp, não como substituto. As respostas destacarão benefícios concretos: produto e adicionais claros, endereço e pagamento organizados, cardápio atualizado pelo celular e painel por status. A automação não fará promessas de faturamento nem depreciará concorrentes.

Quando perguntada, a automação se identificará como assistente virtual do TáPronto e oferecerá atendimento humano. Ela nunca fingirá ser uma pessoa específica.

## Fluxo comercial

### Primeiro contato

Mensagem base:

> Oi, tudo bem? Falo com quem cuida dos pedidos da [estabelecimento]? Vi o trabalho de vocês aqui em [cidade] e queria fazer uma pergunta rápida.

Uma resposta positiva leva à descoberta:

> Hoje vocês recebem os pedidos direto pelo WhatsApp ou já usam algum cardápio online?

### Descoberta

- WhatsApp: perguntar se pedidos chegam incompletos ou se a conversa fica confusa no horário de movimento.
- PDF, imagem ou catálogo: perguntar como atualizam preços e disponibilidade.
- Plataforma concorrente: perguntar se estão satisfeitos ou se existe alguma dificuldade, sem atacar o fornecedor atual.
- Resposta vaga: fazer no máximo uma pergunta de esclarecimento e, se continuar ambígua, encaminhar para atendimento humano.

### Demonstração

O link só será enviado depois de uma resposta que demonstre interesse ou autorize a demonstração. A automação escolherá uma demonstração por segmento quando houver opção configurada e perguntará se o contato conseguiu abrir.

### Preço e fechamento

Valores, benefícios e links virão de configuração fechada; o modelo de conversa não poderá inventá-los. Pedido de desconto, condição especial ou negociação será encaminhado ao responsável. Pagamento ocorrerá apenas por link oficial do TáPronto, sem solicitar cartão, senha ou pagamento para número pessoal.

### Encerramento e lembrete

Uma negativa encerra o contato de forma educada. Pedido explícito de remoção grava o telefone na lista de supressão e cancela todos os jobs pendentes. Sem resposta, o sistema permite um único lembrete após 48 horas e encerra a cadência se continuar sem retorno.

## Arquitetura

### Conector Evolution API v2

Será criado um adaptador comercial independente do conector Evolution Go usado pelas lojas do produto. O adaptador receberá por variáveis de ambiente:

- URL base da Evolution API v2;
- API key global;
- nome da instância comercial conectada;
- URL e segredo do webhook;
- limites e horário da operação.

A API key nunca será gravada no banco, nos logs, em arquivos versionados ou retornada pelos comandos de status. A URL local `192.168.1.108` ficará em configuração de ambiente, e não no código.

O envio usará a rota de texto da Evolution v2 e normalizará o identificador retornado. O webhook aceitará eventos de mensagens recebidas, validará um segredo de alta entropia, ignorará mensagens próprias e grupos e deduplicará pelo identificador do provedor.

### Motor de conversa

O motor existente de estágios e intenções será ampliado para representar descoberta, demonstração, preço, teste e fechamento. A primeira versão usará regras determinísticas e respostas aprovadas. Mensagens desconhecidas não receberão uma resposta improvisada: entrarão em `human_handoff`.

O modo autônomo removerá a exigência de aprovação individual somente para tipos de mensagem explicitamente permitidos. Primeiro contato, descoberta, demonstração autorizada, respostas comuns e lembrete poderão ser criados já aprovados. Conteúdo comercial fora desse conjunto continuará bloqueado.

### Worker e persistência

O worker existente continuará capturando jobs com bloqueio transacional, idempotência e tentativas limitadas. Cada envio e recebimento atualizará o histórico do lead. Uma resposta recebida cancelará lembretes pendentes antes de classificar a intenção.

A estrutura atual de `SalesLead`, `SalesConversation`, `SalesMessage`, `SalesAutomationEvent`, `SalesAutomationJob` e `SalesSuppression` será reutilizada. Migração adicional só será criada se a implementação revelar um dado que não possa ser mantido com segurança em `metadata`.

## Limites operacionais

O lançamento começará com:

- 10 novos contatos por dia;
- intervalo mínimo de 180 segundos entre envios;
- janela de segunda a sábado, das 09:00 às 18:00, em `America/Sao_Paulo`;
- nenhum primeiro contato aos domingos ou em datas bloqueadas;
- uma conversa ativa por telefone;
- um primeiro contato e um único lembrete por lead;
- pausa global imediata por comando;
- bloqueio por telefone na lista de supressão.

Os limites são tetos de segurança, não mecanismo para simular comportamento humano. A seleção dos leads deve continuar relevante e individualizada.

## Estados de falha

- Evolution indisponível: manter o job pendente com retentativa exponencial limitada; depois encaminhar para revisão.
- Instância desconectada: pausar novos envios e registrar alerta operacional.
- Resposta duplicada: ignorar pelo identificador do provedor.
- Telefone inválido: rejeitar na importação ou marcar o lead como inválido sem tentar enviar.
- Mensagem sem texto ou mídia: registrar e encaminhar para atendimento humano.
- Configuração de preço ou demonstração ausente: não inventar conteúdo; encaminhar para atendimento humano.
- Pedido de remoção: suprimir imediatamente, mesmo se outras etapas falharem.

## Implantação gradual

1. Executar testes unitários e simulações sem rede.
2. Validar o adaptador com o endpoint de status da instância.
3. Enviar para um número controlado pelo responsável e responder por ele.
4. Confirmar entrada pelo webhook, deduplicação, parada e opt-out.
5. Rodar com três leads reais qualificados.
6. Se não houver duplicidade, falha de interrupção ou resposta incorreta, liberar o limite inicial de 10 novos contatos por dia.

## Validação

Os testes devem comprovar:

1. A API key nunca aparece em status, erro ou log.
2. O modo de simulação não realiza chamadas externas.
3. Um primeiro contato autônomo respeita lista de supressão, horário, limite diário e intervalo.
4. A mesma mensagem não é enviada duas vezes em retentativas.
5. Mensagens próprias e de grupos são ignoradas.
6. Uma resposta cancela o lembrete pendente antes da próxima decisão.
7. Negativa e opt-out interrompem definitivamente a cadência.
8. Link de demonstração só é enviado após autorização ou interesse detectado.
9. Preço e link de pagamento só saem de configuração aprovada.
10. Ambiguidade, negociação e mídia geram atendimento humano.
11. Desconexão da instância pausa novos envios.
12. O teste de ponta a ponta registra envio, resposta e mudança de estágio uma única vez.

## Fora de escopo

- disparo em massa ou compra de listas;
- envio para contatos sem relação com o público do TáPronto;
- participação em grupos;
- mais de um lembrete sem resposta;
- negociação autônoma de desconto ou condição especial;
- coleta de dados de pagamento pelo WhatsApp;
- treinamento de modelo com conversas dos contatos;
- painel visual novo nesta primeira versão.

## Critério de sucesso

A primeira versão estará pronta quando conseguir importar leads qualificados, iniciar e continuar conversas comuns sem aprovação manual, interromper corretamente contatos indesejados, encaminhar exceções e registrar todo o funil até demonstração, teste ou venda usando a instância Evolution API v2 instalada.
