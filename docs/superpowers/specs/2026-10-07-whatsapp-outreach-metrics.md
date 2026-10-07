# Métricas de prospecção por WhatsApp

## Objetivo

Registrar e medir a prospecção comercial por estabelecimento, considerando cada contato único como um disparo comercial. A mensagem de apresentação e as três imagens do carrossel são partes do mesmo disparo.

## Regras

- Um disparo corresponde a um lead contatado, não à quantidade de objetos enviados pelo WhatsApp.
- As quatro partes enviadas permanecem registradas individualmente para auditoria de entrega e leitura.
- Um lead que envia várias mensagens conta como um único contato respondente.
- A reconciliação dos disparos anteriores deve ser idempotente e não pode criar duplicidades quando executada novamente.
- Os 11 leads do lote aprovado devem ser registrados como disparos realizados e passar de `qualified` para `awaiting_reply` quando ainda não houver estágio posterior.
- O relatório deve separar: contatos abordados, contatos entregues, contatos que leram, contatos que responderam, total de respostas, interessados, demonstrações, recusas, opt-outs e falhas.
- Taxas de entrega, leitura e resposta usam contatos abordados como denominador.

## Modelo de registro

O evento `outreach_sent` em `sales_automation_events` representa o disparo comercial único. Seu campo `details` contém uma chave idempotente de campanha, o canal, a versão da mensagem e a quantidade de partes. As partes do envio continuam em `sales_messages`, quando houver IDs e estados do provedor disponíveis.

## Reconciliação inicial

Um comando específico registra o lote aprovado de 11 estabelecimentos usando os leads já existentes, sem reenviar nenhuma mensagem. Ele atualiza `attempt_count`, `last_contact_at` e o estágio somente quando necessário. Uma execução em modo de visualização mostra o que seria alterado; a aplicação exige uma opção explícita.

## Relatório

O comando `npm run sales -- metrics` passa a retornar métricas por contatos únicos e mantém contadores técnicos de mensagens separados. A taxa de resposta nunca usa a quantidade de mensagens recebidas como numerador; usa a quantidade de leads distintos que responderam.
