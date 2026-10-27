# 🚀 Manual Operacional Completo de Captação e Prospecção de Leads — TáPronto

> **Versão:** 2.1 (Fluxo Contínuo Sortido & Humanizado)  
> **Última Atualização:** Outubro de 2026  
> **Ambiente de Produção:** `https://central.taprontomenu.com.br` | Servidor: `130.51.23.180`  
> **Branch de Referência:** `release/production-outreach-20261014`

---

## 📑 Índice
1. [Visão Geral e Arquitetura do Sistema](#1-visão-geral-e-arquitetura-do-sistema)
2. [Mineração, Enriquecimento e Validação Real de WhatsApp](#2-mineração-enriquecimento-e-validação-real-de-whatsapp)
3. [Provisionamento Automático de Cardápios de Demonstração (Validade 72h)](#3-provisionamento-automático-de-cardápios-de-demonstração-validade-72h)
4. [Metodologia Comercial: Funil Cavalo de Troia (Trojan Outreach)](#4-metodologia-comercial-funil-cavalo-de-troia-trojan-outreach)
5. [Infraestrutura de Mensageria, Humanização e WhatsApp (Evolution API v2)](#5-infraestrutura-de-mensageria-humanização-e-whatsapp-evolution-api-v2)
6. [Orquestrador Diário Autônomo (40 Leads / Dia em Janela Contínua)](#6-orquestrador-diário-autônomo-40-leads--dia-em-janela-contínua)
7. [Painel e Métricas na Central Oficial TáPronto](#7-painel-e-métricas-na-central-oficial-tapronto)
8. [Estrutura do Banco de Dados Comercial (PostgreSQL)](#8-estrutura-do-banco-de-dados-comercial-postgresql)
9. [Guia de Comandos, Scripts e Manutenção](#9-guia-de-comandos-scripts-e-manutenção)
10. [Políticas e Regras Inegociáveis da Marca](#10-políticas-e-regras-inegociáveis-da-marca)

---

## 1. Visão Geral e Arquitetura do Sistema

O motor de prospecção da **TáPronto** é um pipeline automatizado de ponta a ponta projetado para capturar e converter estabelecimentos alimentícios (restaurantes, marmitarias, hamburguerias, pizzarias e bares) sem atrito, sem ligações frias e sem depender de discursos de vendas invasivos.

A captação opera sob um princípio central: **demonstrar valor antes de pedir permissão**. O estabelecimento é abordado de maneira orgânica como um cliente real em potencial, seu cardápio é preparado antecipadamente com fotos de alta qualidade e a demonstração é entregue exatamente no momento em que o lojista abre a conversa.

### Diagrama de Fluxo Ponta a Ponta

```mermaid
flowchart TD
    A["Google Maps / GoSom Scraper"] -->|"Extrai dados, fotos, rating e reviews"| B["Validação E.164 (Móvel 13d e Fixo 12d)"]
    B -->|"Consulta /chat/whatsappNumbers"| C{"WhatsApp Existe?"}
    C -->|"Não / Erro"| D["Descarta Lead (no_whatsapp)"]
    C -->|"Sim (JID Ativo)"| E["+30 pts Score & Salva JID"]
    
    E --> F[("PostgreSQL: sales_leads")]
    F --> G["Provisionamento Automático de Cardápio"]
    G -->|"100% de produtos com fotos Unsplash"| H["Loja Demonstração Pronta (72h de validade)"]
    
    subgraph Orquestrador Contínuo (09h15 às 19h30)
        I["Seleção Sortida (40 leads/dia mistos entre nichos)"] --> J["Simulação 'Digitando...' (4 a 6s)"]
        J --> K["Passo 1: Spintax Universal Temporalmente Independente"]
        K -->|"Cadência 45-85s anti-ban"| L["WhatsApp Estabelecimento"]
    end

    L -->|"Resposta Inbound"| M{"Classificador Inbound"}
    M -->|"Recusa / Sair"| N["Opt-out & Supressão"]
    M -->|"Robô / URA"| O["Destrava Menu URA (Digita 1)"]
    M -->|"Concorrente / Humano / PDF"| P["Passo 2: Trojan Pivot Autêntico"]
    
    P -->|"Template Padrão"| P1["Elogia Rating Google Maps + Dor Calculadora"]
    P -->|"Cardápio Real Extraído"| P2["Elogia Prato Real Específico + Dor Calculadora"]
    
    P1 --> Q{"Aceite do Lojista (Sim / Pode mandar)"}
    P2 --> Q
    
    Q -->|"Permissão Concedida"| R["Auto-ACK ('1 segundo...') + 'Digitando...'"]
    R --> S["Passo 3: Entrega do Cardápio Rastreado"]
    S --> T["Telemetria de Acesso"]
    T -->|"Lojista Abriu Link"| U["Badge: Visualizou Cardápio (X cliques)"]
    T -->|"Sem resposta pós-20min e SEM pedido teste"| V["Ghosting Recovery: Nudge Automático"]
    
    U --> W["Central TáPronto: Dar Continuidade / Cadastro Assistido"]
    W --> X["Conversão em Cliente Ativo"]
```

---

## 2. Mineração, Enriquecimento e Validação Real de WhatsApp

### 2.1. Ferramenta de Coleta (GoSom Scraper)
Localizada em `tools/scraper-src`, a ferramenta utiliza o motor de raspagem geográfica do Google Maps para extrair estabelecimentos comerciais com base em:
- **Termos de busca:** `marmitaria`, `hamburgueria`, `pizzaria`, `bar e petiscaria`, `restaurante`.
- **Geolocalização:** Centro urbano (latitude e longitude) e raio em quilômetros.
- **Campos coletados:**
  - `name`: Nome comercial do estabelecimento.
  - `phone`: Telefone comercial de contato.
  - `address`: Endereço completo com bairro, cidade e estado.
  - `rating`: Nota média das avaliações do Google (1 a 5 estrelas).
  - `reviews_count`: Quantidade de avaliações públicas.
  - `category`: Categoria declarada no Google Meu Negócio.
  - `website`: URL externa ou link de rede social (Instagram / Facebook).
  - `place_id`: Identificador único do Google Places.

### 2.2. Normalização E.164 e Validação Real via Evolution API v2
Para garantir máxima entrega e evitar consumo inútil da cota diária:
1. **Suporte a Celulares e Fixos (E.164):**
   - Móvel: `55 + DDD (2 dígitos) + 9 dígitos` (13 dígitos, ex: `5514997170781`).
   - Fixo: `55 + DDD (2 dígitos) + 8 dígitos` (12 dígitos, ex: `551432812233`).
   - Estabelecimentos tradicionais que utilizam WhatsApp Business em número fixo são aceitos normalmente.
2. **Verificação Real via Endpoint (`/chat/whatsappNumbers/{instance}`):**
   - Antes de qualificar o lead ou disparar o Passo 1, a função `checkEvolutionV2WhatsappNumber({ phone })` consulta a Evolution API v2.
   - Se o número possuir WhatsApp ativo (`exists === true`), o sistema armazena o `whatsapp_jid` verificado e adiciona **+30 pontos** ao `score` do lead.
   - Se o número não possuir WhatsApp (`exists === false`), o lead é imediatamente descartado (`stage = 'discarded'`, `discard_code = 'no_whatsapp'`) sem consumir a cota dos 40 envios diários.

### 2.3. Pontuação de Qualificação (`score`)
Cada lead recebe uma pontuação automática de 0 a 100 com base em:
- WhatsApp ativo confirmado pela Evolution API (+30 pts).
- Ter mais de 50 avaliações no Google Maps (+25 pts).
- Ter nota acima de 4.2 estrelas (+20 pts).
- Não possuir cardápio online concorrente cadastrado no Google Meu Negócio (+25 pts).

---

## 3. Provisionamento Automático de Cardápios de Demonstração (Validade 72h)

### 3.1. A Regra de Ouro Inviolável: 100% de Produtos com Fotos
> **Diretriz Absoluta:** É terminantemente proibido enviar qualquer cardápio ou capturar imagens de demonstração com cards cinzas ou sem imagem para qualquer lead.

Se o estabelecimento não possuir fotos reais de seus produtos catalogadas no Google Maps ou Instagram, o sistema automaticamente conecta ao banco de dados gastronômico de alta resolução (**Unsplash Food CDN** com parâmetros: `auto=format&fit=crop&w=800&q=80`) associando fotos de pratos reais correspondentes exatamente ao título e nicho de cada item.

### 3.2. Mecanismo de Provisionamento (`outreach-store-provisioning.js`)
Quando um lead é preparado para demonstração:
1. **Criação da Loja (`stores`):** Gera um registro com slug amigável derivado do nome (ex: `https://taprontomenu.com.br/chef-artemio-emporio-serve-bem-p`).
2. **Identidade Visual por Nicho:** Aplica temas de cores e tipografia de acordo com o segmento:
   - *Marmitaria / Restaurante:* Laranja escuro (`#EA580C`) e Creme acolhedor.
   - *Hamburgueria:* Âmbar / Marrom artesanal (`#B45309`) e Carvão.
   - *Pizzaria:* Vermelho clássico (`#DC2626`).
   - *Bar / Petiscaria:* Azul imperial (`#2563EB`) e ardósia.
3. **Cardápio Pré-Montado Completo:**
   - Cadastra automaticamente de 7 a 10 produtos de alta saída com fotos nítidas, adicionais e preços coerentes de mercado.
   - Define a loja como aberta para permitir simulação de pedidos em tempo real.
4. **Validade de 72 Horas (3 Dias):**
   - O cardápio demonstrativo tem validade estendida de **72 horas**.
   - A Central exibe o tempo restante em dias/horas (*Ativo (3d)*, *Expira em 18h* ou *Expirando*).
   - Se o lojista clicar no botão **"Dar continuidade"** no painel da Central, o cardápio é retido permanentemente e convertido em **Cadastro Assistido**.

---

## 4. Metodologia Comercial: Funil Cavalo de Troia (Trojan Outreach)

Diferente de abordagens comerciais tradicionais que iniciam com apresentações invasivas de software, a TáPronto utiliza o funil **Cavalo de Troia** com pattern interrupt e autenticidade.

### Passo 1: Inquérito Casual Universal (Temporalmente Independente)
- **Objetivo:** Iniciar uma conversa natural como um cliente em potencial, sem pressupor se a cozinha está aberta naquele minuto exato.
- **Saudação Dinâmica:** Usa `Bom dia`, `Boa tarde` ou `Boa noite` de acordo com o relógio.
- **Spintax Anti-Ban:**
  - *Opção 1:* `"{Saudação}, tudo bem? Vocês trabalham com delivery pelo WhatsApp? O cardápio com os valores fica por aqui mesmo ou vocês têm link?"`
  - *Opção 2:* `"{Saudação}! Como faço pra ver o cardápio atualizado de vocês com os preços? Vocês mandam por aqui ou têm link de pedidos?"`
  - *Opção 3:* `"{Saudação}, tudo certo? Vocês atendem pedidos de entrega por esse número? Tem o cardápio com os valores pra eu dar uma olhada?"`
  - *Opção 4:* `"Olá, {saudação.toLowerCase()}! Queria tirar uma dúvida rápida: vocês aceitam pedidos de delivery pelo WhatsApp? Tem o cardápio com os valores por aqui ou vocês usam link?"`

### Interceptador Inbound & Debounce Buffer
- **Debounce de 35 segundos:** Aguarda o término do envio de mensagens em bloco pelo lojista (texto + PDF + foto).
- **Filtro Anti-URA:** Se mensagem automática de bot for detectada:
  - Se contiver opções numéricas (`1 - Cardápio`), envia `"1"` para avançar no menu.
  - Se for menu geral, solicita humanamente: *"Boa tarde! Queria falar com um atendente por favor."*
- **Detecção de Concorrentes:** Se o lojista responder com link do *Anota AI*, *Goomer*, *InstaDelivery*, *iFood* ou *Cardápio Web*, o classificador adapta o Passo 2 elogiando o atendimento e posicionando a TáPronto como alternativa ultrarrápida no celular, sem taxas e com impressão automática na cozinha.

### Passo 2: O Pivot com Autenticidade (Sem Falsos Elogios)
O sistema verifica se os produtos do cardápio demonstrativo vieram de scraping real ou template padrão:
1. **Se for produto real raspado do estabelecimento:** Elogia diretamente o produto específico (ex: *"esse Marmitex Parmegiana de Carne de vocês me deu água na boca, parabéns pelo capricho!"*).
2. **Se for template padrão do nicho:** Elogia a reputação real do Google Maps para manter total credibilidade:
   > *"Show de bola! Dei uma olhada no perfil de vocês no Google e vi que estão com nota 4.8 (320 avaliações), parabéns pelo capricho e pela reputação!"*
3. **Introdução da Dor da Calculadora & Solução:**
   > *"Mas reparei que no WhatsApp o cliente precisa ficar somando os adicionais na calculadora pra poder mandar o pedido.*\n\n*A gente montou uma demonstração rápida e moderna com cardápio ilustrado do segmento de vocês: o cliente escolhe os adicionais em 30 segundos e o pedido já cai somado direto no Painel Gestor TáPronto com alerta sonoro e impressão automática na cozinha, sem depender de calculadora ou taxas do iFood.*\n\n*Posso te mandar o link de teste aqui pra você ver como ficou a loja de vocês? Ficou bem bacana."*

### Passo 3: Auto-ACK Imediato e Entrega da Loja Demo Rastreada
Quando o lojista responde afirmativamente (*"Pode mandar"*, *"Sim"*, *"Manda aí"*, *"Quero ver"*):
1. **Simulação "Digitando..." (3.5s) e Auto-ACK:**
   > *"Show de bola! Tô pegando o link da demonstração que preparei pra vocês, 1 segundo..."*
2. **Simulação "Digitando..." (5 a 8s) e Envio do Link Rastreado:**
   > *"Aqui está o cardápio interativo de vocês:\n👉 https://taprontomenu.com.br/loja-exemplo?ref=wa&lid=...\n\nRepara que já cadastramos os produtos com fotos de alta qualidade.\n\nClica no link e simula um pedido de teste pra você ver como é rápido pro seu cliente e como o pedido chega redondo no Painel Gestor TáPronto com alerta sonoro e impressão automática na cozinha, sem taxa do iFood.\n\nSe quiser, deixo liberado pra vocês testarem hoje no delivery sem custo nenhum. O que achou?"*

### Passo 4: Telemetria de Clique e Ghosting Recovery (20 Minutos)
- **Rastreamento:** Cada clique é registrado por `src/lib/outreach-click-tracking.js`, atualizando `link_clicked = true` e a contagem de cliques.
- **Ghosting Recovery Ajustado (20 minutos):**
  - Se o lojista abrir o link (`link_clicked = true`), passar **20 minutos** sem responder E **não tiver realizado pedido de teste na loja demo** (`NOT EXISTS (SELECT 1 FROM orders ...)`):
    > *"Vi que você conseguiu abrir a demonstração por aí! Experimenta clicar em qualquer item e simular um pedido teste pra você ver como ele fecha em segundos e já chega pronto no Painel Gestor TáPronto com alerta sonoro pro balcão. Conseguiu dar uma olhada?"*

---

## 5. Infraestrutura de Mensageria, Humanização e WhatsApp (Evolution API v2)

### 5.1. Conexão e Endpoints Utilizados
O módulo `src/lib/evolution-v2-sales.js` consome a Evolution API v2:
- `GET /instance/connectionState/{instance}`: Monitoramento de status de conexão do WhatsApp.
- `POST /chat/whatsappNumbers/{instance}`: Consulta de validade de número e extração de JID.
- `POST /chat/sendPresence/{instance}`: Simulação de status de presença (`composing`).
- `POST /message/sendText/{instance}`: Envio de mensagens de texto com sanitização de credenciais.
- `POST /message/sendMedia/{instance}`: Envio de mídia base64 (prints mobile).

### 5.2. Humanização na Mensageria ("Digitando...")
Para eliminar o aspecto robótico e garantir alta taxa de resposta:
- Antes de enviar o Auto-ACK, o Passo 2, o Passo 3 e o Ghosting Recovery, o sistema aciona a presença `composing` ("Digitando...") com duração proporcional ao tamanho do texto (entre **4 e 8 segundos**).
- Isso gera a expectativa natural de atendimento por uma pessoa real dedicada ao estabelecimento.

### 5.3. Proteção Anti-Ban
- **Intervalo Orgânico:** Pausa aleatória de **45 a 85 segundos** entre disparos.
- **Detecção Instantânea de Opt-Out:** Mensagens com termos de recusa cancelam a automação no mesmo segundo e gravam em `sales_suppressions`.

---

## 6. Orquestrador Diário Autônomo (40 Leads / Dia em Janela Contínua)

O script [`scripts/autonomous-daily-outreach.mjs`](file:///d:/lsk/TáProntomenu.com.br/.worktrees/release-production-outreach-20261014/scripts/autonomous-daily-outreach.mjs) opera continuamente em segundo plano com seleção 100% sortida:

```mermaid
timeline
    title Fluxo Diário Sortido TáPronto (09h15 às 19h30)
    09:15 : Início da Janela Comercial : Início do gotejamento de leads sortidos
    09:15 - 19:30 : Gotejamento Orgânico Contínuo : 40 leads/dia distribuídos entre todos os nichos (marmitarias, burgers, pizzas, bares)
    Todo o Período : Verificação Prévia de WhatsApp : Consulta /chat/whatsappNumbers e descarta números inativos
    Todo o Período : Processamento em Tempo Real : Auto-ACK, Pivots com Elogio Autêntico e Entrega de Demo
    Pós-Abertura (20 min) : Telemetria & Ghosting Recovery : Nudge inteligente se não houve resposta ou pedido de teste
    19:30 : Encerramento da Janela de Disparos : Somente monitoramento de inbounds ativos
```

### Inicialização e Persistência no Windows
O orquestrador é mantido ativo pelo supervisor PowerShell (`scripts/tapronto-services-supervisor.ps1`):
- Monitora e garante a execução de:
  1. Túnel SSH (`5433 -> 130.51.23.180:5432`).
  2. Windows HTTP Proxy (porta 8888).
  3. SOCKS5 Proxy (porta 10800).
  4. Autonomous Daily Outreach Daemon (`node scripts/autonomous-daily-outreach.mjs`).

---

## 7. Painel e Métricas na Central Oficial TáPronto

Acesse o painel em: **`https://central.taprontomenu.com.br/central`** (Aba **Métricas Comerciais**).

### Tabela "Contatos Recentes e Cardápios"
1. **Estabelecimento:** Nome do local com badges de status.
2. **Local:** Cidade e UF (ex: `Bauru/SP`, `Botucatu/SP`).
3. **Telefone:** Número mascarado para segurança (ex: `55•••••••283`).
4. **Etapa:**
   - 👁️ **Visualizou Cardápio (Xx):** Badge verde com quantidade de cliques.
   - 📱 **Cardápio Entregue:** Badge azul claro indicando envio da demonstração.
   - 🎯 **Apresentando Solução:** Badge roxo indicando envio do Passo 2.
   - 💬 **Respondeu no WhatsApp:** Badge violeta indicando nova resposta do lojista.
   - ⏳ **Aguardando Resposta:** Badge amarelo para Passo 1 enviado.
   - 📋 **Cardápio Pronto:** Badge azul para loja demo provisionada.
   - 🚫 **Sem Interesse (Opt-out):** Badge cinza para lojistas que pediram encerramento.
5. **Cardápio Criado:** Link público da demonstração.
6. **Validade:** Contagem regressiva de 72h (*Ativo (3d)*, *Expira em 18h*, *Mantido* ou *Excluído*).
7. **Ações:**
   - **`Dar continuidade`:** Retém o cardápio permanentemente e abre o Cadastro Assistido.
   - **`Excluir`:** Remove a loja antes do prazo de 72h caso necessário.

---

## 8. Estrutura do Banco de Dados Comercial (PostgreSQL)

### Principais Tabelas:

#### 1. `sales_leads`
Base unificada de estabelecimentos:
- `id` (UUID): Identificador primário.
- `business_name`, `phone`, `normalized_phone`, `city`, `state`, `segment`.
- `score` (Integer): Pontuação do lead (com +30 pts para WhatsApp verificado).
- `stage` (Text): `discovered`, `contacted`, `awaiting_reply`, `engaged`, `opted_out`, `lost`, `won`.
- `metadata` (JSONB):
  - `store_id`: UUID da loja demonstrativa.
  - `menu_url`: URL pública de demonstração.
  - `whatsapp_verified` (Boolean): Se o número foi validado na Evolution API.
  - `whatsapp_jid` (Text): JID verificado no WhatsApp.
  - `rating` / `reviews_count`: Dados reais extraídos do Google Maps.
  - `outreach_strategy`: `trojan_inquiry_step1`, `trojan_pivot_step2`, `trojan_demo_delivered`.
  - `link_clicked` (Boolean) / `link_clicks` (Integer) / `last_link_click_at` (Timestamp).

#### 2. `sales_messages`
Histórico de conversas:
- `lead_id`, `conversation_id`, `provider_message_id`, `direction` (`inbound`/`outbound`).
- `body`, `status`, `metadata`, `created_at`.

#### 3. `orders`
Tabela central de pedidos da plataforma. Utilizada pelo Ghosting Recovery para confirmar se o lojista simulou um pedido de teste na loja demo (`WHERE store_id = lead.store_id`).

#### 4. `sales_suppressions`
Lista negra de contatos opt-out com bloqueio permanente.

---

## 9. Guia de Comandos, Scripts e Manutenção

Diretório raiz do worktree:
```powershell
Set-Location "D:\lsk\TáProntomenu.com.br\.worktrees\release-production-outreach-20261014"
```

### 1. Iniciar ou Verificar Supervisor de Serviços
```powershell
powershell -ExecutionPolicy Bypass -File scripts/tapronto-services-supervisor.ps1
```

### 2. Disparo de Lote Manual Sortido para Teste
```bash
node scripts/autonomous-daily-outreach.mjs test-batch 2
```

### 3. Processar Mensagens Inbound Manualmente
```bash
node scripts/handle-inbound-trojan.mjs
```

### 4. Validação Geral do Pipeline Refatorado
```bash
node scripts/verify-refactored-pipeline.mjs
```

### 5. Deploy de Arquivos para o Servidor de Produção
```powershell
scp src/lib/sales-automation.js src/lib/outreach-metrics.js src/lib/outreach-menu-lifecycle.js src/lib/evolution-v2-sales.js lucas@130.51.23.180:/var/www/src/lib/
scp public/platform-outreach.js public/platform.html lucas@130.51.23.180:/var/www/public/
scp scripts/handle-inbound-trojan.mjs lucas@130.51.23.180:/var/www/scripts/
```

---

## 10. Políticas e Regras Inegociáveis da Marca

Ao interagir com estabelecimentos, modificar textos de mensagens ou criar materiais de marketing, as seguintes diretrizes são **obrigatórias e invioláveis**:

1. **Proibição de Gíria ou Termos Informais:**
   - É terminantemente proibido utilizar o termo informal *"zap"*. Utilize sempre o nome oficial: **"WhatsApp"**.
2. **Proibição de Falsa Localidade:**
   - É proibido afirmar *"sou daqui da região"*, *"sou de Marília"*, *"sou seu vizinho"*. A abordagem deve ser profissional, neutra e focada no valor da ferramenta.
3. **Fluxo Real de Pedidos TáPronto:**
   - **O pedido NÃO chega como texto no WhatsApp do lojista.** O cliente faz o pedido no cardápio online e ele cai diretamente no **Painel Gestor da plataforma TáPronto** (com alerta sonoro e impressão térmica automática na cozinha). Nunca afirmar que o pedido chega no WhatsApp do lojista.
4. **100% de Produtos com Fotos Reais ou Gastronômicas:**
   - Nenhum item de cardápio pode conter card cinza ou campo de foto vazio (`image_url IS NULL`). Todos os pratos cadastrados em demonstrações devem conter imagens de alta qualidade.
