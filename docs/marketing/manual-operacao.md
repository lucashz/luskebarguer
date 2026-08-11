# Manual de marketing — TáPronto

## Onde operar

Entre na Central e abra **Marketing**. O módulo reúne campanhas, CRM de leads e calendário editorial. A área **Métricas Comerciais** continua sendo a fonte para conversão, receita e funil do produto; **Comunicação** controla SMTP e textos dos e-mails.

## Campanhas e links UTM

Crie uma campanha informando nome, objetivo, origem, mídia e página de destino. A Central gera um link com `utm_source`, `utm_medium` e `utm_campaign`. Use exatamente esse link na bio, anúncio ou publicação correspondente. Pause campanhas encerradas para manter a visão limpa.

Padrão recomendado: origem identifica a plataforma (`instagram`, `google`, `whatsapp`), mídia identifica o tipo (`organic`, `paid`, `referral`) e campanha usa nome curto, sem datas ambíguas. O cadastro e os primeiros marcos do produto preservam essa atribuição.

## CRM de leads

Cadastre negócio, pessoa e pelo menos WhatsApp ou e-mail. Marque consentimento somente quando houver autorização real. Mova o lead por: novo, contatado, qualificado, teste, cliente ou perdido. Nunca automatize contato comercial para quem não consentiu ou solicitou saída.

## Calendário editorial

Crie o conteúdo como rascunho, envie para revisão e aprove antes de agendar. A automação organiza a fila; a publicação social permanece com confirmação humana para evitar peças erradas ou fora de contexto.

Distribuição mensal recomendada:

- 30% demonstração real do produto;
- 20% conteúdo específico por nicho;
- 20% dores e organização da operação;
- 15% educação prática;
- 10% prova e bastidores;
- 5% oferta direta.

## Automações de ciclo de vida

A rotina fica ativa por padrão e roda a cada seis horas. Ela considera apenas empresas com opt-in ativo, seleciona onboarding incompleto após 24 horas e avisos de trial a 5 e 2 dias do fim. Cada disparo recebe chave idempotente e registro em `marketing_automation_runs`, evitando repetição no mesmo dia. Falhas de SMTP ficam registradas para diagnóstico.

Para desligar imediatamente, configure `MARKETING_AUTOMATION_ENABLED=false` e reinicie o serviço. Templates e SMTP são administrados em **Comunicação**.

## Rotina semanal

Segunda: revisar métricas, leads atrasados e pauta. Terça a quinta: produzir, aprovar e publicar. Sexta: registrar resultados, pausar o que terminou e transformar aprendizados em novas hipóteses. Uma campanha deve mudar uma variável principal por vez.

## Indicadores

Acompanhe visitas por UTM, cadastro iniciado, cadastro concluído, primeiro produto, publicação do cardápio, primeiro pedido e contratação. Para conteúdo, registre alcance, retenção, cliques e cadastros; curtidas isoladas não são o objetivo final.

## SEO

As páginas de solução, nicho e os seis guias públicos entram automaticamente no sitemap. Após publicar um conteúdo novo, confira a URL, links internos, Search Console e indexação. Atualize páginas existentes quando houver informação melhor em vez de criar variações rasas.
