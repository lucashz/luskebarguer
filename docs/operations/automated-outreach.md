# Prospecção automática por WhatsApp

Este fluxo encontra estabelecimentos no Google, descarta quem já possui cardápio online, valida WhatsApp e atividade pública de até 90 dias, monta duas prévias do cardápio TáPronto e envia uma única abordagem. Um contato equivale ao conjunto texto + prévia no computador + prévia no celular. Não existe follow-up automático. Cidades pequenas têm prioridade, mas não há teto populacional para completar a meta diária.

## Proteções obrigatórias

- O serviço nasce com `OUTREACH_AUTOMATION_ENABLED=false`.
- O teto interno é 15 contatos por dia, de segunda a sábado.
- A descoberta começa a partir das 7h30; os envios ficam entre 9h30–11h30 e 14h–17h30 no fuso de São Paulo.
- O Google Cloud deve usar um projeto exclusivo, orçamento de R$ 0 com alertas e cotas da API configuradas abaixo das franquias gratuitas vigentes. O limite interno da aplicação é uma segunda barreira; ele não substitui as cotas do Google Cloud.
- A chave deve aceitar apenas Places API e Cloud Vision API. Restrinja por IP público da VM quando possível.
- Três falhas consecutivas do provedor pausam o fluxo.
- Evolution desconectada, webhook sem atividade por mais de dez minutos, cota esgotada ou supressão impedem novos envios.
- Telefone e `place_id` já trabalhados não recebem uma segunda primeira abordagem.

Confirme as franquias e preços atuais no console do Google antes de ativar. Se a franquia mudar, reduza primeiro as cotas no Google Cloud e depois as variáveis locais. O sistema nunca aumenta limites automaticamente.

## Configuração

Execute a migração `20261013120000_zero_cost_outreach` e configure no `.env`, sem versionar valores reais:

```dotenv
OUTREACH_AUTOMATION_ENABLED=false
OUTREACH_DAILY_LIMIT=10
OUTREACH_ACTIVITY_MAX_DAYS=90
OUTREACH_WORKER_INTERVAL_SECONDS=60
OUTREACH_ARTIFACT_DIR=artifacts/outreach/automated

GOOGLE_OUTREACH_API_KEY=
GOOGLE_OUTREACH_TIMEOUT_MS=10000
GOOGLE_OUTREACH_BROWSER_ENABLED=true
GOOGLE_OUTREACH_BROWSER_TIMEOUT_MS=15000
GOOGLE_OUTREACH_BROWSER_MAX_QUERIES=90
GOOGLE_OUTREACH_BROWSER_CANDIDATE_LIMIT=30
GOOGLE_OUTREACH_BROWSER_MIN_INTERVAL_MS=1500
GOOGLE_OUTREACH_PLACES_PRO_LIMIT=4000
GOOGLE_OUTREACH_PLACES_ADVANCED_LIMIT=800
GOOGLE_OUTREACH_PHOTO_LIMIT=800
GOOGLE_OUTREACH_VISION_LIMIT=800

SALES_EVOLUTION_V2_BASE_URL=
SALES_EVOLUTION_V2_API_KEY=
SALES_EVOLUTION_V2_INSTANCE=
SALES_EVOLUTION_V2_WEBHOOK_URL=
SALES_EVOLUTION_V2_WEBHOOK_SECRET=
```

A verificação de cardápio usa o `websiteUri` devolvido pelo Google Places e inspeciona a página oficial, seus links internos e links externos nela publicados, como iFood. A Cloud Vision também procura texto de cardápio nas fotos do perfil. Sem site oficial ou outra evidência suficiente para concluir a checagem, o lead fica `inconclusive` e não recebe mensagem. O fluxo não depende da Custom Search JSON API. Não coloque chaves, tokens ou senhas em comandos, logs, capturas ou no repositório.

Configure o webhook da Evolution para o endpoint comercial existente. O monitor confirma a configuração na Evolution e faz um POST autenticado no receptor; uma confirmação válida permanece aceitável por dez minutos durante indisponibilidade transitória. Confira o estado:

```powershell
node scripts/outreach-worker.mjs status
```

O resultado precisa mostrar `connected: true`, `webhook_healthy: true`, `paused: false` e cotas com margem.

## Validação sem disparo

Rode os testes sem chamadas externas reais:

```powershell
node scripts/outreach-schema-smoke.mjs
node scripts/outreach-google-smoke.mjs
node scripts/outreach-qualification-smoke.mjs
node scripts/outreach-preview-smoke.mjs
node scripts/outreach-delivery-smoke.mjs
node scripts/outreach-orchestrator-smoke.mjs
node scripts/outreach-e2e-smoke.mjs
```

Depois faça uma simulação. Ela pode consultar e preparar candidatos, mas não agenda nem envia WhatsApp:

```powershell
node scripts/outreach-worker.mjs run --dry-run --limit 3
```

Revise na Central os descartes, nomes, cidades, segmentos, fotos usadas, prévias desktop/celular e consumo de cota.

## Liberação gradual

1. Mantenha `OUTREACH_AUTOMATION_ENABLED=false` e envie a sequência ao número pessoal pelo procedimento de teste já existente.
2. Defina `OUTREACH_DAILY_LIMIT=10`, ative `OUTREACH_AUTOMATION_ENABLED=true` e inicie a operação:

   ```powershell
   docker compose --profile outreach up -d outreach-worker
   node scripts/outreach-worker.mjs status
   ```

3. Confira os contatos na Central: somente um disparo por lead, texto antes das imagens, acentos corretos, link exato, duas prévias 1080 × 1350 e nenhuma tarefa de follow-up.
4. Observe por um dia completo respostas, opt-outs, falhas, saúde do webhook e cotas.
5. Sem falhas técnicas, altere `OUTREACH_DAILY_LIMIT=15` e recrie somente o worker.

As prévias ficam no volume Docker `outreach_artifacts`, gravável pelo usuário não-root do worker. Para inspecionar ou copiar artefatos, use `docker compose cp outreach-worker:/app/artifacts/outreach/automated ./artifacts/outreach/automated-export`.

## Operação

```powershell
# Estado atual
node scripts/outreach-worker.mjs status

# Uma rodada manual, respeitando todas as travas
node scripts/outreach-worker.mjs worker --once

# Pausa imediata
node scripts/outreach-worker.mjs pause --reason manutencao

# Retomada depois de corrigir a causa
node scripts/outreach-worker.mjs resume
```

Contatos não enviados no mesmo dia não são compensados fora da janela. No dia seguinte, o estabelecimento precisa passar novamente pela validação de atividade, cardápio e fotos. Na falta de fotos públicas, a prévia usa cards ilustrativos identificados como demonstrativos e compatíveis com o segmento; não são fotos aleatórias do estabelecimento.

## Rollback

Para interromper sem perder auditoria:

```powershell
node scripts/outreach-worker.mjs pause --reason rollback
docker compose --profile outreach stop outreach-worker
```

Mantenha leads, eventos, mensagens, supressões e artefatos para investigação. Não remova opt-outs. Voltar `OUTREACH_AUTOMATION_ENABLED=false` impede uma nova inicialização acidental.

## Diagnóstico

- `webhook_healthy: false`: valide URL pública, segredo, relógio da VM, resposta do probe autenticado e entrega `MESSAGES_UPSERT`.
- `connected: false`: confirme instância e conectividade da Evolution antes de retomar.
- `quota_blocked`: não aumente a cota automaticamente. Aguarde a renovação ou revise as franquias no Google Cloud.
- muitos `online_menu`: o descarte está funcionando; nunca reduza esse critério para atingir 15.
- `insufficient_photos`: não bloqueia mais o contato; a prévia usa cards ilustrativos de segmento, marcados como demonstrativos.
- `send_failed`: confira o passo salvo no job. A retomada continua da imagem pendente e não repete o texto já enviado.
- pausa após três falhas: corrija o provedor, valide com o número pessoal e só então use `resume`.

As métricas ficam em **Central > Métricas Comerciais > Prospecção automática**, com um contato contabilizado uma única vez, independentemente das três mensagens da sequência.

## Worker na VM da Evolution

O worker roda em `/opt/tapronto-outreach` num container próprio, sem compartilhar rede, volume ou ciclo de vida com os containers da Evolution. O túnel mantido por `tapronto-outreach-tunnel.service` escuta apenas no loopback `127.0.0.1:6543` e na bridge interna do Docker `172.17.0.1:6543`; nenhuma porta do PostgreSQL é publicada na LAN ou na internet.

```bash
systemctl status tapronto-outreach-tunnel.service
systemctl status tapronto-outreach.service
docker run --rm --network bridge --add-host host.docker.internal:host-gateway --env-file /opt/tapronto-outreach/.env tapronto/outreach-worker:2026-10-15 node scripts/outreach-worker.mjs status

# Fora do horário comercial, somente o dry-run aceita um horário simulado.
docker run --rm --network bridge --add-host host.docker.internal:host-gateway --env-file /opt/tapronto-outreach/.env tapronto/outreach-worker:2026-10-15 node scripts/outreach-worker.mjs run --dry-run --limit 3 --now 2026-10-15T12:30:00Z
```

O serviço do worker permanece desabilitado até que banco, Google, Evolution, webhook e prévias sejam validados. Para interromper imediatamente, use `systemctl stop tapronto-outreach.service` e volte `OUTREACH_AUTOMATION_ENABLED=false` antes de qualquer nova inicialização.

## Publicação reproduzível do servidor

Gere o arquivo de release exclusivamente com os caminhos devolvidos por `scripts/production-release-manifest.mjs`. O pacote não pode conter `.env`, uploads, backups, artefatos, estado de navegador nem `node_modules`. Gere também um arquivo de checksum SHA-256 ao lado do pacote.

No servidor, execute como root:

```bash
/var/www/deploy/production-outreach-release.sh /tmp/tapronto-release.tar.gz /tmp/tapronto-release.tar.gz.sha256
```

O script valida o checksum e os caminhos do pacote, preserva o `.env`, cria backups do PostgreSQL e dos arquivos, instala dependências em staging, verifica a sintaxe, aplica as migrations, substitui a aplicação e reinicia `cardapio.service`. Se a saúde pública não confirmar `ok: true`, os arquivos anteriores são restaurados automaticamente. Os backups ficam em `/var/backups/tapronto-releases/<data-utc>`.
