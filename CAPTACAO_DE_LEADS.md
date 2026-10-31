# 🚀 Manual Operacional Completo de Captação e Prospecção de Leads — TáPronto

> **Versão:** 3.0 (Funil Consultivo Direto Value-First & Disparos Sortidos Contínuos)  
> **Última Atualização:** Outubro de 2026  
> **Ambiente de Produção:** `https://central.taprontomenu.com.br` | Servidor: `130.51.23.180`  
> **Branch de Referência:** `release/production-outreach-20261014`

---

## 📑 Índice
1. [Visão Geral e Arquitetura do Sistema](#1-visão-geral-e-arquitetura-do-sistema)
2. [Mineração, Enriquecimento e Validação Real de WhatsApp](#2-mineração-enriquecimento-e-validação-real-de-whatsapp)
3. [Provisionamento Automático de Cardápios de Demonstração (Validade 72h)](#3-provisionamento-automático-de-cardápios-de-demonstração-validade-72h)
4. [Metodologia Comercial: Funil Consultivo Direto Value-First (2 Passos + Follow-up)](#4-metodologia-comercial-funil-consultivo-direto-value-first-2-passos--follow-up)
5. [Infraestrutura de Mensageria, Humanização e WhatsApp (Evolution API v2)](#5-infraestrutura-de-mensageria-humanização-e-whatsapp-evolution-api-v2)
6. [Orquestrador Diário Autônomo (40 Leads / Dia em Janela Contínua 09h15–19h00)](#6-orquestrador-diário-autônomo-40-leads--dia-em-janela-contínua-09h1519h00)
7. [Painel e Métricas na Central Oficial TáPronto](#7-painel-e-métricas-na-central-oficial-tapronto)
8. [Estrutura do Banco de Dados Comercial (PostgreSQL)](#8-estrutura-do-banco-de-dados-comercial-postgresql)
9. [Guia de Comandos, Scripts e Manutenção](#9-guia-de-comandos-scripts-e-manutenção)
10. [Políticas e Regras Inegociáveis da Marca](#10-políticas-e-regras-inegociáveis-da-marca)

---

## 1. Visão Geral e Arquitetura do Sistema

O motor de prospecção da **TáPronto** é um pipeline automatizado de ponta a ponta projetado para capturar e converter estabelecimentos alimentícios (restaurantes, marmitarias, hamburguerias, pizzarias e bares) sem atrito, sem ligações frias e sem depender de discursos de vendas invasivos.

A captação opera sob o princípio **Value-First Transparente**: a TáPronto se apresenta de forma limpa, utiliza dados reais do Google Maps para elogiar a reputação do estabelecimento e pede permissão para enviar uma prévia demonstrativa montada especificamente para o segmento deles. Quando o lojista autoriza, o link é entregue imediatamente com o gancho de cadastro gratuito dos produtos reais.

### Diagrama de Fluxo Ponta a Ponta

```mermaid
flowchart TD
    A["Google Maps / Scraper Kit"] -->|"Extrai dados, fotos, rating e reviews"| B["Validação E.164 (Móvel 13d e Fixo 12d)"]
    B -->|"Consulta /chat/whatsappNumbers"| C{"WhatsApp Existe?"}
    C -->|"Não / Inválido"| D["Descarta Lead (no_whatsapp)"]
    C -->|"Sim (JID Ativo)"| E["+30 pts Score & Salva JID"]
    
    E --> F[("PostgreSQL: sales_leads")]
    F --> G["Provisionamento de Loja Modelo"]
    G -->|"100% de produtos com fotos em alta definição"| H["Loja Demonstração Pronta (72h de validade)"]
    
    subgraph Orquestrador Contínuo (09h15 às 19h00)
        I["Seleção Sortida (40 leads/dia mistos entre nichos)"] --> J["Simulação 'Digitando...' (4 a 7s)"]
        J --> K["Passo 1: Abordagem Direta Value-First (Dados do Google)"]
        K -->|"Gotejamento Paced (45-85s anti-ban)"| L["WhatsApp do Estabelecimento"]
    end

    L -->|"Resposta do Lojista"| M{"Classificador de Respostas"}
    M -->|"Recusa ('Não quero', 'Sem interesse')"| N["Opt-out & Supressão Imediata"]
    M -->|"Robô / URA com opções numéricas"| O["Destrava Menu URA (Digita 1 ou pede gerente)"]
    M -->|"Concorrente (Anota AI, Goomer, iFood)"| P["Resposta Consultiva + Demo para Comparar"]
    M -->|"Envio de Foto ou PDF do Cardápio"| Q["Confirmação Imediata + Atendimento Humano"]
    M -->|"Aceite ('Sim', 'Pode mandar', 'Quero ver')"| R["Passo 2: Entrega Imediata da Demo"]
    
    R -->|"Status 'Digitando...' (5s)"| S["Envio do Link Limpo + Gancho de Importação Grátis"]
    S --> T["Telemetria de Acesso"]
    T -->|"Lojista Abriu o Link"| U["Badge: Visualizou Cardápio (Cliques Registrados)"]
    T -->|"Sem resposta pós-25min e SEM pedido de teste"| V["Passo 3: Follow-up Consultivo Pós-Clique"]
    
    Q --> W["Central TáPronto: Onboarding Assistido"]
    U --> W
    V --> W
    W --> X["Conversão em Cliente Ativo (0% de Comissão)"]
```

---

## 2. Mineração, Enriquecimento e Validação Real de WhatsApp

### 2.1. Ferramenta de Coleta (Google Maps Scraper Kit)
Localizada em `tools/google-maps-scraper-kit`, a ferramenta utiliza o motor binário Go de alta velocidade (`tools/engine/google_maps_scraper.exe`) para extrair estabelecimentos comerciais com foco no **Sweet Spot** (estabelecimentos recém-abertos ou com tração inicial: 8 a 60 avaliações no Google e nota $\ge 4.5$):
- **Segmentos cobertos:** `marmitaria`, `hamburgueria`, `pizzaria`, `bar e petiscaria`, `restaurante`, `lanchonete`.
- **Campos coletados e persistidos em `sales_leads`:**
  - `business_name`: Razão social ou nome de fachada do estabelecimento.
  - `phone`: Telefone comercial de contato.
  - `city` e `state`: Município e UF de operação.
  - `rating`: Nota média pública no Google Maps (1.0 a 5.0 estrelas).
  - `reviews_count`: Quantidade de avaliações registradas.
  - `segment`: Categoria gastronômica predominante.
  - `current_platform`: Concorrente declarado (iFood, Goomer, Anota AI, etc.).

### 2.2. Normalização E.164 e Validação Real via Evolution API v2
Para garantir 100% de entrega e não desperdiçar disparos com números inválidos:
1. **Suporte Total a Celulares e Linhas Fixas:**
   - Móvel: `55 + DDD (2 dígitos) + 9 dígitos` (13 dígitos, ex: `5514997170781`).
   - Fixo: `55 + DDD (2 dígitos) + 8 dígitos` (12 dígitos, ex: `551432812233`).
   - Estabelecimentos tradicionais que utilizam WhatsApp Business em número fixo são aceitos e normalizados com sucesso por `normalizeSalesPhone`.
2. **Consulta Real Pré-Disparo (`/chat/whatsappNumbers/{instance}`):**
   - Antes de colocar o lead na fila ou disparar o Passo 1, a função `checkEvolutionV2WhatsappNumber({ phone }, evoConfig)` consulta a Evolution API v2.
   - Se o número possuir WhatsApp ativo (`exists === true`), o sistema grava o `whatsapp_jid` verificado e concede **+30 pontos** de qualificação ao `score`.
   - Se o número não possuir WhatsApp (`exists === false`), o lead é imediatamente descartado (`stage = 'discarded'`, `discard_code = 'no_whatsapp'`) sem consumir a cota diária.
3. **Humanização via Presence API (`composing`):**
   - Antes de qualquer mensagem outbound ser despachada pela Evolution API, o sistema aciona a presença `"composing"` ("Digitando...") por **4 a 7 segundos** (`sendEvolutionV2Presence`).

---

## 3. Provisionamento Automático de Cardápios de Demonstração (Validade 72h)

### 3.1. A Regra de Ouro Inviolável: 100% dos Produtos com Fotos
> **Diretriz Absoluta:** É terminantemente proibido enviar qualquer cardápio ou capturar imagens de demonstração com cards cinzas ou sem imagem para qualquer lead.

Se o estabelecimento não possuir fotos reais de produtos no Google Maps ou Instagram, o sistema conecta automaticamente ao CDN gastronômico em alta resolução (**Unsplash Food CDN** com parâmetros: `auto=format&fit=crop&w=1200&q=85`) associando fotos de pratos reais correspondentes exatamente ao título e segmento de cada produto.

### 3.2. Mecanismo de Provisionamento (`outreach-store-provisioning.js`)
1. **Identidade Visual por Nicho:**
   - *Marmitaria / Restaurante:* Verde folha e Creme acolhedor (`#15803D`).
   - *Hamburgueria:* Âmbar / Marrom artesanal (`#B45309`) e Carvão.
   - *Pizzaria:* Vermelho clássico (`#DC2626`).
   - *Bar / Petiscaria:* Azul imperial (`#2563EB`).
2. **Cardápio Modelo Pré-Montado:**
   - De 7 a 10 produtos de alta saída com fotos nítidas, adicionais configurados e preços de mercado.
   - Loja aberta para permitir simulação imediata de pedidos sem travas.
3. **Validade Estendida de 72 Horas (3 Dias):**
   - A loja demonstrativa permanece ativa por **72 horas**, garantindo que o proprietário possa abrir com calma ou mostrar aos sócios no dia seguinte.
   - O painel exibe o tempo restante (*Ativo (3d)*, *Expira em 18h* ou *Expirando*).
   - O botão **"Dar continuidade"** na Central retém o cardápio permanentemente e inicia o **Cadastro Assistido**.

---

## 4. Metodologia Comercial: Funil Consultivo Direto Value-First (2 Passos + Follow-up)

A estratégia comercial abandonou completamente o antigo "Cavalo de Troia" (que fingia ser um cliente faminto perguntando sobre delivery). O novo fluxo é **consultivo, direto, curto e profissional**.

### 4.1. Passo 1: Abordagem Direta, Curta e Transparente (`step1_direct_value`)
- **Regras:** Máximo de 350 caracteres, apresentação limpa da TáPronto, elogio à reputação real no Google Maps e pedido de permissão para ver a demonstração no celular.
- **Saudação Dinâmica:** `Bom dia` (< 12h), `Boa tarde` (12h–18h) ou `Boa noite` (18h+).
- **Variações Naturais de Spintax:**
  - *Variação A:* `"{Saudação}, tudo bem? Vi o perfil da *{business_name}* aqui no Google (parabéns pela nota {rating} ⭐!). Sou da TáPronto e montei uma prévia de como ficaria o cardápio digital de vocês pra receber pedidos já somados e prontos pra imprimir na cozinha, sem taxas do iFood. Posso te mandar o link aqui rapidinho pra você ver como ficou?"`
  - *Variação B:* `"{Saudação}! Tudo certo por aí? Achei a *{business_name}* pelo Google Maps (muito boas as {reviews_count} avaliações de vocês!). Preparei um modelo de demonstração do cardápio digital de vocês onde o cliente faz o pedido sozinho em 30s e já cai direto na impressora do caixa. Posso mandar o link aqui pra você testar sem compromisso?"`
  - *Variação C:* `"{Saudação}, tudo bom? Encontrei o perfil da *{business_name}* no Google com nota {rating} ⭐, parabéns pela reputação! Montei uma prévia ilustrada do cardápio digital de vocês, com pedidos diretos sem comissão e alerta sonoro no balcão. Posso te mandar o link de teste em 30 segundos?"`
  - *Variação D:* `"{Saudação}! Vi a ótima avaliação da *{business_name}* no Google ({reviews_count} avaliações). Sou da equipe TáPronto e preparei uma demonstração rápida no celular para mostrar como agilizar o WhatsApp no pico, com impressão automática na cozinha e taxa zero. Posso enviar o link aqui pra dar uma olhada?"`
  - *Fallback (Nota < 4.0 ou sem avaliações suficientes):*
    - `"{Saudação}, tudo bem? Vi o trabalho da *{business_name}* aqui em {city}. Sou da TáPronto e montei uma demonstração prática de como ficaria o cardápio digital de vocês para receber pedidos já somados no balcão, com alerta sonoro e impressão automática sem taxas. Posso te mandar o link aqui pra você testar em 30 segundos?"`

### 4.2. Passo 2: Entrega Imediata da Demo + Gancho de Importação Gratuita (`step2_demo_delivery`)
- **Gatilho:** Quando o lojista responder afirmativamente ao Passo 1 (*"Sim"*, *"Pode mandar"*, *"Manda aí"*, *"Quero ver"*, *"Como funciona?"*, *"Com certeza"*).
- **Ação:**
  1. Status `composing` ("Digitando...") por 5 segundos.
  2. Envio do link limpo e parametrizado com a proposta de valor:
  > *"Tá na mão! Dá uma olhada em como ficou o visual:*
  > 👉 {menu_url}
  > 
  > *Coloquei alguns itens de exemplo com fotos só pra você testar a velocidade. Clica num produto e simula um pedido rápido — ele cai na hora no nosso Painel Gestor com alerta sonoro e impressão automática.*
  > 
  > *Se curtir, pode me mandar uma foto ou PDF do seu cardápio atual por aqui mesmo que a nossa equipe cadastra seus produtos e preços reais hoje pra você testar grátis!"*

### 4.3. Passo 3: Follow-up Consultivo Pós-Clique (`step3_click_followup`)
- **Gatilho:** O lojista clicou no link (`link_clicked = true`), mas não respondeu no WhatsApp e não concluiu o cadastro assistido após **25 minutos** (substituindo o antigo timer de 3min).
- **Ação:**
  1. Status `composing` ("Digitando...") por 4 a 6 segundos.
  2. Envio do lembrete consultivo:
  > *"Vi que você conseguiu abrir a prévia do cardápio aí! Ficou alguma dúvida de como os pedidos chegam prontos no computador ou impressora de vocês?*
  > 
  > *Se quiser testar na prática hoje mesmo, é só me mandar uma foto do seu cardápio atual que eu deixo tudo configurado com os seus preços reais, sem custo."*

### 4.4. Tratamento Inteligente de Respostas Inbound (Classificador)
- **Envio de Foto ou PDF do Cardápio pelo Lojista:**
  - **Regra Inegociável:** NUNCA deixar o lead esperando com promessas de "montar versão oficial". A demonstração da loja já está provisionada! O sistema entrega IMEDIATAMENTE a prévia pronta do cardápio digital com fotos gastronômicas de alta qualidade:
  > *"Show de bola! Já deixei pronta uma prévia rápida no celular do cardápio digital de vocês com fotos e taxa zero:*
  > 👉 {candidateMenuUrl}
  > 
  > *O cliente escolhe os itens em segundos e o pedido já cai somado direto no Painel Gestor TáPronto com alerta sonoro e impressão automática na cozinha. Dá uma olhada e me fala o que achou da agilidade!"*
  - Estágio atualizado para **Engajado** (`stage = 'engaged'`, `metadata->>'assisted_setup' = 'true'`, `metadata->>'has_sent_menu_media' = 'true'`), com acompanhamento ativo no topo da Central.
- **Detecção de Robô / URA:**
  - Se menu com opções numéricas: envia `"1"` ou opção de pedidos/cardápio.
  - Se menu genérico: solicita falar com o responsável/atendente.
- **Detecção de Concorrente (Anota AI, Goomer, Cardápio Web, iFood):**
  - Resposta consultiva curta perguntando se estão satisfeitos com a velocidade e custos atuais, oferecendo a demonstração TáPronto sem comissão para comparar na prática em 30 segundos.
- **Opt-out ("Não quero", "Sair", "Sem interesse"):**
  - Interrupção imediata, inserção automática em `sales_suppressions` e mudança para `opted_out`.

---

## 5. Infraestrutura de Mensageria, Humanização e WhatsApp (Evolution API v2)

### 5.1. Conexão e Endpoints
O módulo `src/lib/evolution-v2-sales.js` consome a Evolution API v2:
- `GET /instance/connectionState/{instance}`: Monitoramento contínuo de conexão do WhatsApp.
- `POST /chat/whatsappNumbers/{instance}`: Validação prévia de números móveis e fixos.
- `POST /chat/sendPresence/{instance}`: Simulação de status de presença (`composing`).
- `POST /message/sendText/{instance}`: Envio seguro de mensagens de texto.

### 5.2. Humanização na Mensageria
- Envio de presença `composing` ("Digitando...") com duração de **4 a 7 segundos** antes de qualquer resposta outbound, garantindo a percepção de atendimento humano individualizado.

### 5.3. Proteção Anti-Ban
- Intervalo dinâmico de **45 a 85 segundos** entre disparos consecutivos.
- Trava de frequência: no máximo 2 contatos por lead em 24h caso não haja resposta.
- Supressão absoluta imediata em casos de opt-out.

---

## 6. Orquestrador Diário Autônomo (40 Leads / Dia em Janela Contínua 09h15–19h00)

O orquestrador diário (`scripts/autonomous-daily-outreach.mjs`) eliminou as janelas engessadas por nicho e opera com seleção 100% sortida:

```mermaid
timeline
    title Fluxo Diário Sortido TáPronto (09h15 às 19h00)
    09:15 : Abertura da Janela Comercial : Início do gotejamento de leads sortidos
    09:15 - 19:00 : Gotejamento Orgânico Paced : 40 leads/dia distribuídos organicamente entre todos os nichos (marmitarias, burgers, pizzas, bares, lanchonetes)
    Todo o Período : Verificação Prévia de WhatsApp : Consulta /chat/whatsappNumbers e descarta números sem WhatsApp
    Todo o Período : Escuta Ativa Inbound : Auto-resposta em tempo real (Passo 2 com demo e confirmação de cardápios recebidos)
    Pós-Abertura (25 min) : Follow-up de Clique : Nudge consultivo para quem abriu o link e não falou nada
    19:00 : Fechamento da Janela de Disparos : Somente escuta ativa de inbounds
```

### Cálculo de Pacing Contínuo
O script calcula o progresso ideal minuto a minuto ao longo dos 585 minutos da janela comercial (09h15 às 19h00):
$$\text{metaPaced} = \min\left(40, \left\lfloor \frac{\text{minutosDecorridos}}{585} \times 40 \right\rfloor + 1\right)$$
Isso garante que os 40 disparos ocorram de maneira suave e espaçada ao longo do dia, sem rajadas ou picos suspeitos para os algoritmos do WhatsApp.

---

## 7. Painel e Métricas na Central Oficial TáPronto

Acesse o painel em: **`https://central.taprontomenu.com.br/platform.html`** (Seção **Captação de Leads**).

### Indicadores e Estágios no Painel:
- 👁️ **Visualizou Cardápio (Xx):** Badge verde com o total de acessos do lojista.
- 📱 **Cardápio Entregue:** Badge azul claro indicando que o Passo 2 com o link foi enviado.
- 🎯 **Apresentando Solução:** Passo 1 entregue aguardando autorização.
- 💬 **Respondeu no WhatsApp:** Lojista enviou nova mensagem.
- ⏳ **Aguardando Resposta:** Passo 1 despachado.
- 📋 **Cardápio Pronto:** Loja demonstrativa criada.
- 🚫 **Sem Interesse (Opt-out):** Lead suprimido com sucesso.

---

## 8. Estrutura do Banco de Dados Comercial (PostgreSQL)

### Principais Tabelas:
- **`sales_leads`:**
  - `score`: Pontuação de 0 a 100 (+30 pts para WhatsApp confirmado).
  - `stage`: `discovered`, `awaiting_reply`, `engaged`, `human_handoff`, `opted_out`, `lost`, `won`.
  - `metadata`:
    - `outreach_strategy`: `value_first_outreach`, `value_first_demo_delivered`.
    - `whatsapp_verified`: `true` / `false`.
    - `whatsapp_jid`: JID retornado pela Evolution API.
    - `link_clicked` / `link_clicks` / `last_link_click_at`.
    - `assisted_setup`: `true` quando o lojista envia fotos do cardápio real.
- **`sales_messages`:**
  - `direction`: `outbound` ou `inbound`.
  - `metadata->>'kind'`: `step1_direct_value`, `step2_demo_delivery`, `step3_click_followup`, `assisted_setup_cardapio_received`.
- **`sales_suppressions`:**
  - `normalized_phone`: Chave única de números com opt-out permanente.

---

## 9. Guia de Comandos, Scripts e Manutenção

### 1. Disparo de Lote Piloto de Teste (3 Leads Sortidos com Novo Fluxo)
```bash
node scripts/autonomous-daily-outreach.mjs test-batch 3
```

### 2. Executar o Orquestrador Diário em Modo Daemon
```bash
node scripts/autonomous-daily-outreach.mjs
```

### 3. Processar Mensagens Inbound e Follow-up de 25min Manualmente
```bash
node scripts/handle-inbound-trojan.mjs
```

### 4. Executar Teste Smoke da Automação Comercial
```bash
node scripts/sales-automation-smoke.mjs
```

---

## 10. Políticas e Regras Inegociáveis da Marca

Ao interagir com estabelecimentos, modificar textos de mensagens ou criar rotinas de prospecção, as seguintes diretrizes são **obrigatórias e invioláveis**:

1. **Proibição de Gíria ou Termos Informais:**
   - É terminantemente proibido utilizar o termo informal *"zap"*. Utilize sempre o nome oficial: **"WhatsApp"**.
2. **Proibição de Falsa Localidade:**
   - É proibido afirmar *"sou daqui da região"*, *"sou de Marília"*, *"sou seu vizinho"*. A abordagem deve ser profissional, transparente e focada no valor da ferramenta.
3. **Fluxo Real de Pedidos TáPronto:**
   - **O pedido NÃO chega como texto no WhatsApp do lojista.** O cliente faz o pedido no cardápio online e ele cai diretamente no **Painel Gestor da plataforma TáPronto** (com alerta sonoro e impressão térmica automática na cozinha). Nunca afirmar que o pedido chega no WhatsApp do lojista.
4. **100% dos Produtos com Fotos Reais ou Gastronômicas:**
   - Nenhum item de cardápio pode conter card cinza ou campo de foto vazio (`image_url IS NULL`). Todos os pratos cadastrados em demonstrações devem conter imagens de alta qualidade.
