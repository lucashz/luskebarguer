# Guia de operacao SaaS

Este guia resume como operar a plataforma multiempresa em producao.

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

Acoes criticas como login, troca de loja, alteracao de plano, integracoes, status de pedido e impressao devem aparecer no historico.

## 8. Backup

Rotina recomendada:

- backup diario do Supabase;
- backup antes de alteracoes de schema;
- guardar copia fora do provedor principal;
- testar restauracao periodicamente.

## 9. Incidentes

Em caso de problema:

1. Verifique `server.err.log` e `server.out.log`.
2. Confira status do Supabase.
3. Confira variaveis `.env`.
4. Valide se o problema afeta uma loja, uma empresa ou a plataforma inteira.
5. Se houver suspeita de vazamento, rotacione chaves e suspenda integracoes afetadas.

