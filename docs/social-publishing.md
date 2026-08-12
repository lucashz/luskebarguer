# Publicação social do TáPronto

O módulo transforma o calendário editorial da Central em uma fila segura de Instagram. A publicação real nunca nasce diretamente de um rascunho: conteúdo, legenda, CTA, link UTM, conta, horário e arquivos precisam ser revisados e aprovados. A aprovação grava hashes da versão e dos assets; qualquer mudança relevante devolve o conteúdo à revisão.

## Arquitetura

- A Central cria conteúdo, recebe mídia, mostra prévia operacional e registra aprovação.
- A API valida transições, autenticação de superadmin, arquivos, conta e idempotência. Tokens Meta ficam cifrados com AES-256-GCM.
- O PostgreSQL mantém contas, estados OAuth descartáveis, biblioteca, versões, publicações, tentativas, métricas, alertas e heartbeat.
- O worker `tapronto-social-worker.service` captura uma publicação por vez com `FOR UPDATE SKIP LOCKED`, respeita data, pausa, versão aprovada, tentativas e backoff.
- O modo simulado percorre o mesmo fluxo e termina em `simulated`, nunca fingindo que publicou de verdade.

## Configuração inicial

1. Mantenha `INSTAGRAM_SIMULATION_MODE=true` e `INSTAGRAM_PUBLISHING_ENABLED=false` durante homologação.
2. Gere `SOCIAL_TOKEN_ENCRYPTION_KEY` com ao menos 32 caracteres e guarde uma cópia fora do servidor. Perder essa chave torna tokens já cifrados irrecuperáveis.
3. No Meta for Developers, configure Instagram API with Instagram Login, a conta profissional, a URI de retorno e as permissões `instagram_business_basic`, `instagram_business_content_publish` e `instagram_business_manage_insights`.
4. Preencha `META_APP_ID`, `META_APP_SECRET` e `META_REDIRECT_URI` apenas no ambiente do servidor.
5. Conecte a conta pela Central, teste, publique cenários de homologação e confira logs/alertas.
6. Para produção, altere para `INSTAGRAM_SIMULATION_MODE=false` e `INSTAGRAM_PUBLISHING_ENABLED=true`, reinicie API e worker, teste a conexão e use “Liberar fila” com confirmação forte.

A implementação segue o fluxo oficial atual de criação de container e `media_publish` documentado no [workspace oficial da Instagram API](https://www.postman.com/meta/workspace/instagram/overview). Revise a versão da Graph API e as permissões em toda atualização da Meta.

## Operação diária

1. Crie o conteúdo no Calendário editorial com formato Instagram, legenda, CTA e UTM HTTPS.
2. Envie JPG, PNG, WebP ou MP4 na aba Canais sociais e vincule ao conteúdo.
3. Envie à revisão. Em “Aprovar e agendar”, escolha conta e horário.
4. O worker publica no horário. Falhas transitórias voltam com backoff; falhas finais exibem causa e botão de nova tentativa.
5. Confira heartbeat, alertas, tentativas e métricas na mesma aba.

Limites intencionais da interface: imagens até 5 MB e vídeos até 7 MB devido ao limite atual do corpo HTTP. Vídeos maiores devem futuramente usar upload direto para object storage com URL assinada. A mídia precisa estar disponível publicamente por HTTPS para a Meta buscá-la.

## Comandos

```bash
npm run db:schema
npm run social:worker
npm run social:worker:once
npm run test:social
```

## Recuperação

- Token expirando: reconecte a conta; nunca cole token em formulário ou log.
- Worker sem heartbeat: `systemctl status tapronto-social-worker` e `journalctl -u tapronto-social-worker`.
- Publicação falhou: leia a tentativa, corrija conteúdo/asset/conta, submeta nova revisão e só então tente novamente.
- Duplicidade: não crie linhas manualmente; a chave idempotente é única por conteúdo, versão, aprovação e conta.
- Comprometimento: pause a fila, revogue o app na Meta, troque segredo e chave, reconecte a conta e revise auditoria.

