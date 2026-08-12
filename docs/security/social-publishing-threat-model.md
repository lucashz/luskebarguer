# Modelo de ameaças — publicação social

## Ativos e fronteiras

Os ativos críticos são token Meta, segredo do app, chave de criptografia, mídia ainda não publicada, aprovação editorial e identidade do administrador. As fronteiras são navegador da Central, API TáPronto, PostgreSQL, armazenamento local HTTPS, worker e Graph API.

## Ameaças e controles

- Roubo de token: token cifrado em repouso, nunca retornado pela API, segredos somente no ambiente e auditoria sem valores sensíveis.
- CSRF/substituição no OAuth: state aleatório, persistido apenas como hash, vinculado ao admin, expira em dez minutos e é de uso único.
- SSRF via mídia: somente HTTPS, host em allowlist e caminho `/uploads/social/`; tipo real e checksum são validados.
- Publicação sem aprovação: máquina de estados, hash da versão aprovada e revalidação no worker. Alteração de legenda, horário, conta ou asset invalida a aprovação.
- Duplicidade/concorrência: chave idempotente única e captura transacional com `SKIP LOCKED` e lease.
- Conta errada: aprovação registra `social_account_id`; a publicação lê a mesma conta e bloqueia desconectada, pausada ou expirada.
- Abuso administrativo: sessão e 2FA existentes; liberar fila, desconectar e publicar agora exigem senha do Admin Master e `CONFIRMAR`.
- Falha da Meta: timeout/erro sanitizado, tentativas registradas, backoff limitado, alerta e intervenção humana após máximo.
- Falso positivo: simulação usa estados e identificadores próprios e nunca marca conteúdo como publicado real.
- Vazamento em logs/backups: logs guardam operação, status e código, sem token. Backups devem permanecer cifrados e com acesso mínimo.

## Riscos residuais

O armazenamento de mídia ainda é local ao servidor, e o upload JSON limita vídeos. Para escala, migrar para object storage privado, upload multipart/assinado, varredura antimalware e CDN com origem protegida. A Meta precisa buscar a URL durante a publicação, portanto a exposição deve ser temporária ou assinada, sem permitir listagem.

Antes de ativar publicação real: revisar permissões do app, testar conta errada/token vencido/asset alterado, validar restauração da chave e backup, confirmar alertas e executar um post controlado fora do horário crítico.
