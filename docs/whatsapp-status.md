# WhatsApp por status

Hoje o sistema abre o WhatsApp Web/App com a mensagem pronta. Isso nao cobra chamada de API, porque o envio ainda depende de acao humana.

Para envio automatico quando o pedido muda de status, existem duas opcoes:

## Opcao segura: WhatsApp Business Platform oficial

Vantagens:

- Estavel para producao.
- Menor risco de bloqueio.
- Webhooks e templates aprovados.

Pontos de atencao:

- Pode haver custo por conversa/template.
- Precisa configurar Meta Business, numero, templates e webhook.
- Mensagens ativas geralmente precisam de template aprovado.

## Opcao intermediaria: provedor autorizado

Exemplos: Twilio, Zenvia, 360dialog ou similares.

Vantagens:

- Menos configuracao direta na Meta.
- Painel e suporte.

Pontos de atencao:

- Custo mensal/por mensagem.
- Ainda depende das regras do WhatsApp.

## Fluxo recomendado

1. Manter envio manual por link durante validacao do produto.
2. Criar tabela `order_status_messages` com templates por status.
3. Adicionar flag na loja: `auto_whatsapp_enabled`.
4. Quando mudar status, registrar uma notificacao pendente.
5. Um worker envia via API oficial e salva resultado.
6. Se falhar, admin ve botao para reenviar manualmente.

Statuses recomendados:

- Aceito: confirmacao do pedido.
- Em preparo: pedido foi para cozinha.
- Pronto: retirada ou aguardando entregador.
- Saiu para entrega: pedido a caminho.
- Concluido: agradecimento.
- Cancelado: mensagem curta pedindo contato.

