# Guia de operacao SaaS

Este guia resume como operar a plataforma multiempresa em producao.

## 0. Acesso ao `/platform`

O painel `/platform` e a rota alternativa `/plataform` sao areas internas do Admin Master.

- Apenas contas com papel `superadmin` devem acessar o painel.
- As APIs `/api/platform/*` validam permissao no backend.
- As permissoes internas sao separadas por area: visualizacao, auditoria, billing, clientes e servicos.
- Admins comuns de restaurantes nao devem conseguir acessar `/platform`, nem se promover para `superadmin`.
- Acoes criticas exigem confirmacao com o texto `CONFIRMAR` e senha do superadmin.
- Nunca cole secrets, senhas ou tokens em observacoes, notas internas ou chamados.

## 1. Criar empresa e loja

1. Acesse `/platform` com uma conta de plataforma.
2. Crie ou selecione a empresa.
3. Crie a loja vinculada a essa empresa.
4. Configure:
   - nome da loja;
   - WhatsApp;
   - horarios;
   - formas de pagamento;
   - taxas de entrega;
   - tema visual;
   - logo, favicon e imagem do cardapio.

## 2. Definir plano

1. Em `/platform`, selecione a empresa.
2. Escolha o plano.
3. Confirme status comercial:
   - `trial`: periodo de teste;
   - `active`: operacao normal;
   - `payment_pending` ou `past_due`: pagamento pendente;
   - `grace_period`: periodo de tolerancia;
   - `suspended`: operacao bloqueada;
   - `cancelled`: contrato cancelado;
   - `archived`: empresa arquivada.

Empresas bloqueadas nao devem receber novos pedidos.

## 3. Configurar dominio personalizado

1. Acesse Admin > Loja > Dominio personalizado.
2. Informe o dominio, por exemplo `cardapio.sualoja.com.br`.
3. Cadastre o CNAME no DNS apontando para o dominio da plataforma.
4. Use o token exibido para controle operacional da verificacao.
5. Clique em verificar quando o DNS estiver propagado.

Observacao: a versao atual prepara o fluxo e registra o token. A validacao DNS automatica deve ser ativada antes de liberar verificacao totalmente automatica.

## 4. Criar usuarios

1. No admin, crie contas por funcao:
   - administrador: acesso completo;
   - garcom: pedidos, mesas e comandas;
   - cozinha: modo cozinha e impressao;
   - atendimento: pedidos e clientes.
2. Evite compartilhar uma mesma conta entre varias pessoas.
3. Desative usuarios que sairem da operacao.

## 5. Configurar integracoes

### WhatsApp

1. Acesse Admin > Integracoes.
2. Informe URL da API, chave e nome da instancia.
3. Ative mensagens automaticas somente depois do teste.
4. Teste envio manual em um pedido ficticio.

### Pix online

1. Acesse Admin > Integracoes.
2. Configure AbacatePay com chave e ambiente corretos.
3. Configure webhook no painel do provedor apontando para a rota do sistema.
4. Teste com pedido de baixo valor em ambiente de homologacao.

## 6. Monitorar uso e limites

Os limites principais sao controlados por plano:

- pedidos por periodo;
- usuarios admin;
- impressoes;
- WhatsApp;
- Pix online;
- dominios personalizados;
- chamadas futuras de webhook.

Ao atingir limite, o sistema deve bloquear o novo uso antes de gerar custo.

## 7. Auditoria

Use `/platform` para consultar auditoria por:

- empresa;
- loja;
- acao;
- periodo.

Acoes criticas como login, acesso ao platform, troca de loja, alteracao de plano, suspensao/liberacao, backup manual, restart de servico, modo suporte, integracoes, status de pedido e impressao devem aparecer no historico.

## 8. Backup

Rotina recomendada:

- backup diario do PostgreSQL;
- backup antes de alteracoes de schema;
- guardar copia fora do provedor principal;
- testar restauracao periodicamente.

Comandos uteis:

- `npm run db:backup`: executa o script de backup configurado.
- `npm run maintenance:trial-cleanup`: simula limpeza de trials inativos.
- `npm run maintenance:trial-cleanup:apply`: aplica a limpeza de trials inativos.

No `/platform`, aba Servicos, use "Fazer backup agora" apenas quando o ambiente estiver configurado com diretorio de backup e permissao de escrita. A rotina deve registrar auditoria.

## 9. Servicos do `/platform`

A aba Servicos centraliza operacoes internas:

- status da aplicacao;
- status do banco;
- uptime;
- commit e branch atuais;
- logs recentes;
- backup manual;
- limpeza de trials inativos;
- limpeza de logs e retencao;
- restart da aplicacao, quando habilitado.

Cuidados:

- Reiniciar aplicacao, rodar backup manual e executar jobs devem ser tratados como acoes sensiveis.
- Confirme o impacto antes de acionar qualquer botao da Zona de risco.
- Nao use o painel para parar banco de dados em producao sem janela de manutencao.
- Depois de uma acao critica, confira a auditoria e os logs operacionais.

### Limpeza de logs e retencao

Comandos disponiveis:

- `npm run maintenance:logs`: simula a limpeza e mostra o que seria removido.
- `npm run maintenance:logs:apply`: aplica a limpeza de fato.

Retencao recomendada por variavel de ambiente:

- `LOG_RETENTION_DAYS=180`
- `AUDIT_LOG_RETENTION_DAYS=180`
- `OPERATIONAL_LOG_RETENTION_DAYS=90`
- `SESSION_RETENTION_DAYS=7`
- `BACKUP_RETENTION_DAYS=7`
- `TMP_RETENTION_DAYS=7`

Cron diario sugerido no servidor:

```cron
0 3 * * * cd /caminho/projeto && npm run maintenance:logs:apply >> logs/cleanup-logs.log 2>&1
```

Logrotate sugerido para logs locais:

```text
/caminho/projeto/*.log /caminho/projeto/logs/*.log {
  daily
  rotate 14
  compress
  missingok
  notifempty
}
```

No `/platform`, aba Servicos, use "Simular limpeza" antes de "Executar limpeza". A execucao real exige `CONFIRMAR` e senha do superadmin.

## 10. SMTP, comunicacao e suporte

O SMTP global fica no `/platform`, aba Comunicacao.

Configuracoes suportadas:

- host;
- porta;
- usuario;
- senha/token;
- remetente padrao;
- nome do remetente;
- e-mail de resposta;
- TLS/SSL;
- ativo/inativo.

Variaveis de ambiente opcionais:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS` ou `SMTP_TOKEN`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME`
- `SMTP_REPLY_TO`

Regras:

- O sistema nunca deve exibir senha/token completos.
- Alteracoes de SMTP devem gerar auditoria.
- Use "Enviar e-mail de teste" antes de ativar comunicacoes reais.

A aba Suporte lista chamados, permite resposta do suporte, nota interna, prioridade e status. No admin comum, o cliente pode abrir chamado e acompanhar historico.

## 11. Modo suporte

O modo suporte permite que o superadmin entre temporariamente no admin de uma loja.

Regras:

- exige permissao de plataforma;
- exige `CONFIRMAR` e senha;
- cria sessao temporaria;
- mostra banner visivel no admin;
- bloqueia areas sensiveis como conta, usuarios, plano e platform;
- registra inicio, fim e expiracao na auditoria;
- deve ser encerrado pelo botao "Encerrar modo suporte" quando o atendimento terminar.

## 12. Incidentes

Em caso de problema:

1. Verifique `server.err.log` e `server.out.log`.
2. Confira status do Supabase.
3. Confira variaveis `.env`.
4. Valide se o problema afeta uma loja, uma empresa ou a plataforma inteira.
5. Se houver suspeita de vazamento, rotacione chaves e suspenda integracoes afetadas.
