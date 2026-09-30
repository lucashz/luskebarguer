# Automação comercial por WhatsApp

O funil comercial usa a Evolution API v2 conectada ao número do TáPronto. O envio nasce desativado e em modo `draft`.

## Configuração

Preencha fora do Git:

```env
SALES_AUTOMATION_ENABLED=false
SALES_AUTOMATION_MODE=draft
SALES_EVOLUTION_V2_BASE_URL=http://192.168.1.108:8080
SALES_EVOLUTION_V2_API_KEY=
SALES_EVOLUTION_V2_INSTANCE=
SALES_EVOLUTION_V2_WEBHOOK_URL=https://SEU-DOMINIO/api/integrations/evolution/webhook
SALES_EVOLUTION_V2_WEBHOOK_SECRET=
SALES_MONTHLY_PRICE=
SALES_PLAN_BENEFITS=
SALES_DEMO_URL_DEFAULT=
SALES_CHECKOUT_URL=
SALES_DAILY_LIMIT=10
SALES_INSTANCE_DAILY_LIMIT=10
SALES_MIN_INTERVAL_SECONDS=180
SALES_ALLOWED_START_TIME=09:00
SALES_ALLOWED_END_TIME=18:00
```

A VM na LAN precisa alcançar a URL pública do webhook por HTTPS. API key e segredo não podem ser enviados por mensagem, gravados no Git ou copiados para logs.

Como `192.168.1.108` só existe na LAN, o worker de envio deve rodar dentro dessa rede. O servidor público recebe o webhook e usa o mesmo banco; nele, a URL local serve apenas para identificar o provedor e não deve ser usada para iniciar envios.

## Comandos

```powershell
npm run sales:status
npm run sales -- provider:test
npm run sales -- webhook:configure
npm run sales -- lead:import --file .\leads.csv --dry-run
npm run sales -- lead:import --file .\leads.csv
npm run sales -- outreach:queue --limit 3 --dry-run
npm run sales -- outreach:queue --limit 3
npm run sales -- handoff:list
npm run sales -- metrics
npm run sales -- automation:pause
npm run sales -- automation:resume
```

O `status` nunca mostra segredos. O modo `draft` nunca envia. O modo `autonomous` permite apenas primeiro contato, descoberta, demonstração autorizada, fatos configurados e um lembrete.

## Conversas e handoff

Uma resposta cancela qualquer lembrete pendente antes de ser interpretada. Opt-out cria supressão permanente e cancela jobs. Pergunta desconhecida recebe uma mensagem curta dizendo que a informação será confirmada; depois a conversa fica em `human_handoff`. Mídia, reclamação, desconto, negociação e pedido humano também exigem atendimento.

Sem resposta, há somente um lembrete depois de 48 horas. O worker revalida resposta, supressão, horário, limite, intervalo e conexão imediatamente antes do envio.

## Ativação gradual

1. Rode `npm run test:sales`, `npm run test:syntax` e `npx prisma validate`.
2. Mantenha `SALES_AUTOMATION_ENABLED=false` e configure o webhook.
3. Teste envio e resposta com um número controlado.
4. Confirme opt-out e cancelamento do lembrete.
5. Ative `SALES_AUTOMATION_MODE=autonomous` e teste três leads revisados.
6. Somente depois libere 10 novos contatos por dia.

Se houver duplicidade, resposta inadequada, falha de supressão ou desconexão, rode `npm run sales -- automation:pause`. Para reconectar, gere novo QR Code no Manager da Evolution e confirme com `provider:test` antes de retomar.
