ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "marketing_first_touch" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "marketing_last_touch" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "marketing_content_items"
  ADD COLUMN IF NOT EXISTS "scenes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "hashtags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "assets" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "utm_url" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "is_pinned" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "reach" INTEGER NOT NULL DEFAULT 0 CHECK ("reach" >= 0),
  ADD COLUMN IF NOT EXISTS "views" INTEGER NOT NULL DEFAULT 0 CHECK ("views" >= 0),
  ADD COLUMN IF NOT EXISTS "retention_rate" NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK ("retention_rate" BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS "saves" INTEGER NOT NULL DEFAULT 0 CHECK ("saves" >= 0),
  ADD COLUMN IF NOT EXISTS "shares" INTEGER NOT NULL DEFAULT 0 CHECK ("shares" >= 0),
  ADD COLUMN IF NOT EXISTS "clicks" INTEGER NOT NULL DEFAULT 0 CHECK ("clicks" >= 0),
  ADD COLUMN IF NOT EXISTS "signups" INTEGER NOT NULL DEFAULT 0 CHECK ("signups" >= 0),
  ADD COLUMN IF NOT EXISTS "attributed_orders" INTEGER NOT NULL DEFAULT 0 CHECK ("attributed_orders" >= 0),
  ADD COLUMN IF NOT EXISTS "attributed_revenue_cents" INTEGER NOT NULL DEFAULT 0 CHECK ("attributed_revenue_cents" >= 0);

ALTER TABLE "marketing_leads"
  ADD COLUMN IF NOT EXISTS "next_action" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "cadence_step" INTEGER NOT NULL DEFAULT 0 CHECK ("cadence_step" BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS "cadence_started_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "do_not_contact" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "contact_history" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "marketing_experiments"
  ADD COLUMN IF NOT EXISTS "traffic_percentage" INTEGER NOT NULL DEFAULT 100 CHECK ("traffic_percentage" BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS "minimum_sample" INTEGER NOT NULL DEFAULT 100 CHECK ("minimum_sample" >= 10),
  ADD COLUMN IF NOT EXISTS "winner" TEXT NOT NULL DEFAULT '' CHECK ("winner" IN ('','a','b'));

CREATE TABLE IF NOT EXISTS "marketing_experiment_assignments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "experiment_id" UUID NOT NULL REFERENCES "marketing_experiments"("id") ON DELETE CASCADE,
  "visitor_key" TEXT NOT NULL,
  "variant" TEXT NOT NULL CHECK ("variant" IN ('a','b')),
  "exposed_at" TIMESTAMPTZ(6),
  "converted_at" TIMESTAMPTZ(6),
  "conversion_event" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("experiment_id", "visitor_key")
);
CREATE INDEX IF NOT EXISTS "marketing_experiment_assignment_metrics_idx" ON "marketing_experiment_assignments"("experiment_id", "variant", "converted_at");

CREATE TABLE IF NOT EXISTS "marketing_pilot_stores" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" UUID REFERENCES "companies"("id") ON DELETE SET NULL,
  "store_id" UUID REFERENCES "stores"("id") ON DELETE SET NULL,
  "business_name" TEXT NOT NULL,
  "niche" TEXT NOT NULL DEFAULT 'alimentacao',
  "contact_name" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'candidate' CHECK ("status" IN ('candidate','invited','active','interview','case_draft','approved','published','declined')),
  "image_authorized" BOOLEAN NOT NULL DEFAULT FALSE,
  "testimonial_authorized" BOOLEAN NOT NULL DEFAULT FALSE,
  "authorization_notes" TEXT NOT NULL DEFAULT '',
  "baseline" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "milestones" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "interview_notes" TEXT NOT NULL DEFAULT '',
  "case_study" TEXT NOT NULL DEFAULT '',
  "created_by" UUID REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "marketing_weekly_reports" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "week_start" DATE NOT NULL UNIQUE,
  "summary" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "recommendations" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMPTZ(6)
);

UPDATE "marketing_content_items"
SET
  "script" = CASE WHEN "script" = '' THEN
    '0–3s: ' || "hook" || E'\n3–10s: mostrar a situação real na loja.\n10–22s: demonstrar a função correspondente no TáPronto.\n22–28s: destacar o pedido mais claro e organizado.\n28–35s: ' || "cta" ELSE "script" END,
  "caption" = CASE WHEN "caption" = '' THEN
    "hook" || E'\n\nPedido organizado reduz pergunta repetida e retrabalho. Mostre ao cliente produtos, adicionais, entrega e pagamento com clareza.\n\n' || "cta" ELSE "caption" END,
  "scenes" = CASE WHEN "scenes" = '[]'::jsonb THEN jsonb_build_array(
    jsonb_build_object('time','0–3s','visual','texto grande','text',"hook"),
    jsonb_build_object('time','3–10s','visual','situação antes','text','A dor acontecendo na prática'),
    jsonb_build_object('time','10–22s','visual','captura do TáPronto','text','Veja como fica organizado'),
    jsonb_build_object('time','22–35s','visual','resultado e CTA','text',"cta")
  ) ELSE "scenes" END,
  "hashtags" = CASE WHEN cardinality("hashtags") = 0 THEN ARRAY['#cardapiodigital','#delivery','#restaurante','#pedidosonline','#tapronto'] ELSE "hashtags" END,
  "assets" = CASE WHEN "assets" = '[]'::jsonb THEN jsonb_build_array('captura vertical do recurso','mockup de celular','logo TáPronto','tela final com CTA') ELSE "assets" END,
  "utm_url" = CASE WHEN "utm_url" = '' THEN 'https://taprontomenu.com.br/?utm_source=' || "channel" || '&utm_medium=organic&utm_campaign=conteudo-' || left(regexp_replace(lower("title"), '[^a-z0-9]+', '-', 'g'), 64) ELSE "utm_url" END
WHERE "channel" <> 'blog';

INSERT INTO "marketing_content_items" ("title","channel","format","pillar","funnel_stage","niche","hook","script","caption","cta","status","is_pinned","scenes","hashtags","assets","utm_url") VALUES
('Como o TáPronto funciona','instagram','carousel','produto_na_pratica','consideration','alimentacao','Como o pedido sai do celular e chega completo na loja','1. Cliente abre o link. 2. Escolhe produtos e adicionais. 3. Define entrega e pagamento. 4. Confirma. 5. Loja acompanha por status.','Seu cliente pede pelo celular e sua equipe recebe tudo organizado: itens, adicionais, endereço, pagamento e observações.','Criar Meu Cardápio','draft',TRUE,'[{"slide":1,"text":"Como o TáPronto funciona"},{"slide":2,"text":"Cliente abre seu link"},{"slide":3,"text":"Escolhe produtos e adicionais"},{"slide":4,"text":"Define entrega e pagamento"},{"slide":5,"text":"Pedido chega completo"},{"slide":6,"text":"Equipe acompanha por status"},{"slide":7,"text":"Crie seu cardápio"}]','{"#cardapiodigital","#pedidosonline","#restaurante","#tapronto"}','["captura do cardápio","captura da sacola","captura do painel","mockup de celular"]','https://taprontomenu.com.br/?utm_source=instagram&utm_medium=organic&utm_campaign=fixado-como-funciona'),
('Pedido desorganizado versus pedido completo','instagram','carousel','dores_reais','awareness','alimentacao','O cliente pediu adicional. A cozinha recebeu?','Comparar conversa solta, informação faltando e retrabalho com um pedido que reúne item, adicional, entrega, pagamento e observação.','Na hora de pico, cada informação perdida vira atraso. Compare o pedido espalhado na conversa com o pedido completo no painel.','Ver Demonstração','draft',TRUE,'[{"slide":1,"text":"Pedido desorganizado ou pedido completo?"},{"slide":2,"text":"Conversa espalhada"},{"slide":3,"text":"Adicional esquecido"},{"slide":4,"text":"Endereço incompleto"},{"slide":5,"text":"Tudo reunido no pedido"},{"slide":6,"text":"Menos retrabalho"},{"slide":7,"text":"Veja a demonstração"}]','{"#whatsappbusiness","#delivery","#pedidos","#tapronto"}','["mockup de conversa fictícia","captura de pedido completo","comparativo antes e depois"]','https://taprontomenu.com.br/demonstracao?utm_source=instagram&utm_medium=organic&utm_campaign=fixado-antes-depois'),
('Para quem é, preços e como testar','instagram','carousel','oferta','conversion','alimentacao','Sua loja online em minutos, sem complicação','Mostrar nichos atendidos, principais recursos, ausência de comissão por pedido, planos e caminho para teste.','Feito para hamburguerias, pizzarias, marmitarias, bares, cafeterias e pequenos restaurantes que precisam organizar pedidos sem sistema complicado.','Testar o TáPronto','draft',TRUE,'[{"slide":1,"text":"Para quem é o TáPronto?"},{"slide":2,"text":"Pequenos negócios de alimentação"},{"slide":3,"text":"Cardápio e pedidos organizados"},{"slide":4,"text":"Planos para cada fase"},{"slide":5,"text":"Sem comissão por pedido"},{"slide":6,"text":"Teste pelo celular"},{"slide":7,"text":"Comece agora"}]','{"#empreendedorismo","#restaurante","#cardapiodigital","#tapronto"}','["cards de nichos","capturas do produto","captura atual da página de planos"]','https://taprontomenu.com.br/planos?utm_source=instagram&utm_medium=organic&utm_campaign=fixado-planos')
ON CONFLICT DO NOTHING;

INSERT INTO "marketing_content_items" ("title","channel","format","pillar","funnel_stage","niche","hook","cta","status","utm_url")
SELECT topic, 'blog', 'article', 'seo_continuo', stage, niche, hook, 'Criar Meu Cardápio', 'idea', 'https://taprontomenu.com.br/guias?utm_source=google&utm_medium=organic&utm_campaign=seo-continuo'
FROM (VALUES
 ('Cardápio digital para hamburgueria: guia completo','consideration','hamburgueria','Organize combos, pontos e adicionais sem confusão'),
 ('Cardápio digital para pizzaria: sabores, bordas e tamanhos','consideration','pizzaria','Como montar opções sem deixar o cliente perdido'),
 ('Cardápio digital para açaí: tamanhos e complementos','consideration','acai','Deixe cada combinação clara para cliente e cozinha'),
 ('Cardápio digital para marmitaria e cardápio do dia','consideration','marmitaria','Atualize o almoço sem reenviar imagens'),
 ('Cardápio digital para bar com QR Code na mesa','consideration','bar','Como organizar pedidos no salão pelo celular'),
 ('Como receber pedidos online sem aplicativo','awareness','alimentacao','O cliente pode pedir sem instalar nada'),
 ('Como organizar adicionais e evitar pedidos errados','awareness','alimentacao','O adicional precisa chegar claro à cozinha'),
 ('Como calcular taxa de entrega por bairro','awareness','delivery','Pare de calcular frete no meio da conversa'),
 ('Como criar cupom de desconto para restaurante','consideration','alimentacao','Use desconto com limite e objetivo definidos'),
 ('Como aumentar o ticket médio no cardápio digital','awareness','alimentacao','Combos e adicionais podem facilitar a escolha'),
 ('Como usar Pix online em pedidos de delivery','consideration','delivery','Confirme o pagamento antes de preparar'),
 ('Como organizar pedidos por status','consideration','alimentacao','Cada pedido precisa estar na etapa certa'),
 ('Como criar programa de fidelidade para restaurante','consideration','alimentacao','Recompense recorrência sem complicação'),
 ('Como melhorar a experiência do cliente no delivery','awareness','delivery','Clareza do cardápio à entrega'),
 ('Cardápio próprio ou marketplace: quando usar cada canal','awareness','delivery','Seu canal próprio também importa'),
 ('Como divulgar restaurante no Instagram com link de pedidos','awareness','alimentacao','Transforme visita ao perfil em próximo passo'),
 ('Checklist para abrir um delivery pequeno','awareness','delivery','O básico para começar com organização'),
 ('Indicadores simples para acompanhar pedidos do restaurante','retention','alimentacao','Veja pedidos, ticket e horários sem linguagem complicada')
) AS topics(topic,stage,niche,hook)
WHERE NOT EXISTS (SELECT 1 FROM "marketing_content_items" m WHERE m.title = topics.topic);
