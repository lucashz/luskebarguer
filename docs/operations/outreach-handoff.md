# Handoff — Prospecção automatizada TáPronto

Este arquivo permite retomar a operação de prospecção sem depender de uma conversa anterior. Antes de qualquer alteração, confira `git log -1 --oneline`, `git status --short` e a saúde dos ambientes.

## Objetivo e regras vigentes

- Meta: até 10 novos contatos por dia, de segunda a sábado, dentro das janelas comerciais.
- Bloqueios obrigatórios: número WhatsApp confirmado, nenhum cardápio online identificado, sem opt-out/supressão e sem contato anterior.
- Regras flexíveis: atividade pública em até 90 dias; cidades pequenas são prioritárias, mas não existe teto populacional; falta de foto não bloqueia a abordagem.
- Quando não há foto pública, a prévia do TáPronto usa cards ilustrativos do segmento, marcados como `Prévia demonstrativa` e `Imagem ilustrativa`; nunca apresenta essas imagens como fotos reais da loja.
- Não enviar follow-up automático. Um contato é texto + prévia desktop + prévia mobile.

## Arquitetura

- Site público: `lucas@130.51.23.180`, aplicação em `/var/www`, serviço `cardapio.service`.
- Worker isolado: `root@192.168.1.108`, código em `/opt/tapronto-outreach`, serviço `tapronto-outreach.service`.
- A Evolution não deve ser reiniciada nem alterada. O worker usa somente sua API e webhook já configurados.

## Verificações seguras

```bash
ssh root@192.168.1.108 'systemctl is-active tapronto-outreach.service'
ssh root@192.168.1.108 'docker exec tapronto-outreach-worker node scripts/outreach-worker.mjs status'
ssh lucas@130.51.23.180 'curl -fsS https://taprontomenu.com.br/api/health'
```

O status precisa informar `enabled: true`, `paused: false`, Evolution `open/connected` e `webhook_healthy: true`. Um estado transitório `connecting` não deve pausar a automação.

## Testes antes de publicar

```powershell
# Carregue DATABASE_URL pelo ambiente local seguro; não cole credenciais neste arquivo.
npm run test:all
```

Testes específicos do robô:

```powershell
npm run test:outreach
```

## Deploy

1. Commitar e enviar a branch atual.
2. Gerar um `git archive` do commit e checksum SHA-256.
3. Publicar o mesmo pacote no site público com `deploy/production-outreach-release.sh`.
4. Publicar o mesmo pacote em `/opt/tapronto-outreach`, preservando `.env` e `artifacts/`, depois reconstruir `Dockerfile.outreach`.
5. Instalar `deploy/systemd/tapronto-outreach.service`, executar `systemctl daemon-reload` e reiniciar somente `tapronto-outreach.service`.

Não exponha valores de `.env`, chaves Evolution ou senhas em logs, commits ou comandos copiados para documentação.

## Monitoramento e métricas

- A Central Comercial consome `loadPlatformOutreachMetrics` e mostra encontrados, qualificados, descartados, prévias, enviados, respostas e opt-outs.
- No banco, `sales_discovery_runs` registra cada ciclo; `sales_automation_events` registra motivo de descarte; `sales_messages` registra envios e respostas.
- Se não houver leads qualificados, o resultado correto é nenhum disparo. Não remova os bloqueios obrigatórios para preencher a meta.

## Operação diária

- `OUTREACH_DAILY_LIMIT=10`
- `OUTREACH_ACTIVITY_MAX_DAYS=90`
- `GOOGLE_OUTREACH_BROWSER_CANDIDATE_LIMIT=30`
- `GOOGLE_OUTREACH_BROWSER_MAX_QUERIES=90`

O ciclo usa a data local como chave. Para repetir uma busca no mesmo dia após uma mudança de regra, não apague histórico nem mensagens; crie um novo ciclo operacional com uma chave distinta ou aguarde o próximo dia.
