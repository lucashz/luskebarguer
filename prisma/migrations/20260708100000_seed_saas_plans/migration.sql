-- Seed the SaaS catalog used by the admin "Meu plano" page.
-- The schema already stores plans as subscription_plans + platform_features + plan_features.

INSERT INTO "platform_features" ("code", "name", "description", "category", "sort_order", "is_active")
VALUES
  ('digital_menu', 'Cardápio digital', 'Produtos, categorias, fotos e adicionais.', 'core', 10, true),
  ('orders', 'Pedidos', 'Recebimento e gestão de pedidos do mês.', 'core', 20, true),
  ('admin_users', 'Usuários da equipe', 'Contas de acesso ao painel administrativo.', 'team', 30, true),
  ('customers', 'Clientes', 'Cadastro, endereços e histórico de clientes.', 'crm', 40, true),
  ('tables', 'Mesas e QR Code', 'Mesas, comandas e pedidos por QR Code.', 'operation', 50, true),
  ('promotions', 'Cupons e promoções', 'Cupons, descontos e campanhas.', 'growth', 60, true),
  ('basic_reports', 'Relatórios', 'Faturamento, ticket médio, pedidos e fechamento.', 'analytics', 70, true),
  ('store_settings', 'Configurações da loja', 'Horários, entrega, pagamentos e identidade visual.', 'core', 80, true),
  ('manual_whatsapp', 'WhatsApp manual', 'Envio de pedido e mensagens pelo WhatsApp.', 'communication', 90, true),
  ('automatic_whatsapp', 'Automação WhatsApp', 'Mensagens automáticas via provedor integrado.', 'communication', 100, true),
  ('print_kitchen', 'Impressão e cozinha', 'Impressão, painel de cozinha e fluxo de preparo.', 'operation', 110, true),
  ('loyalty', 'Fidelidade', 'Programa de pontos e recompensas.', 'growth', 120, true),
  ('reorder', 'Peça novamente', 'Facilita recompra de pedidos anteriores.', 'growth', 130, true),
  ('cart_suggestions', 'Sugestões no carrinho', 'Recomendações para aumentar ticket médio.', 'growth', 140, true),
  ('custom_domain', 'Domínio personalizado', 'Cardápio em domínio próprio da loja.', 'brand', 150, true),
  ('priority_support', 'Suporte prioritário', 'Atendimento prioritário para operação crítica.', 'support', 160, true)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "category" = EXCLUDED."category",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = EXCLUDED."is_active";

INSERT INTO "subscription_plans" ("code", "name", "description", "monthly_price", "annual_price", "sort_order", "is_active", "settings")
VALUES
  ('trial', 'Teste grátis', 'Teste guiado para configurar a loja e validar o cardápio antes de assinar.', 0, 0, 5, true, '{"trial_days":14}'::jsonb),
  ('essential', 'Essencial', 'Cardápio digital completo para começar a vender online com operação simples.', 39.90, 399.00, 10, true, '{}'::jsonb),
  ('professional', 'Profissional', 'Operação completa para delivery, salão, equipe, relatórios e rotina de crescimento.', 89.90, 899.00, 20, true, '{}'::jsonb),
  ('premium', 'Premium', 'Experiência avançada com automações, domínio próprio, fidelidade e suporte prioritário.', 139.90, 1399.00, 30, true, '{}'::jsonb)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "monthly_price" = EXCLUDED."monthly_price",
  "annual_price" = EXCLUDED."annual_price",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = EXCLUDED."is_active",
  "settings" = EXCLUDED."settings";

WITH plan_limits(plan_code, feature_code, enabled, limit_value) AS (
  VALUES
    ('trial', 'digital_menu', true, 10),
    ('trial', 'orders', true, 30),
    ('trial', 'admin_users', true, 1),
    ('trial', 'customers', true, 30),
    ('trial', 'tables', true, 2),
    ('trial', 'store_settings', true, NULL),
    ('trial', 'manual_whatsapp', true, NULL),

    ('essential', 'digital_menu', true, 50),
    ('essential', 'orders', true, 300),
    ('essential', 'admin_users', true, 1),
    ('essential', 'customers', true, NULL),
    ('essential', 'tables', true, 10),
    ('essential', 'store_settings', true, NULL),
    ('essential', 'manual_whatsapp', true, NULL),

    ('professional', 'digital_menu', true, NULL),
    ('professional', 'orders', true, NULL),
    ('professional', 'admin_users', true, 8),
    ('professional', 'customers', true, NULL),
    ('professional', 'tables', true, NULL),
    ('professional', 'promotions', true, NULL),
    ('professional', 'basic_reports', true, NULL),
    ('professional', 'store_settings', true, NULL),
    ('professional', 'manual_whatsapp', true, NULL),
    ('professional', 'print_kitchen', true, NULL),

    ('premium', 'digital_menu', true, NULL),
    ('premium', 'orders', true, NULL),
    ('premium', 'admin_users', true, NULL),
    ('premium', 'customers', true, NULL),
    ('premium', 'tables', true, NULL),
    ('premium', 'promotions', true, NULL),
    ('premium', 'basic_reports', true, NULL),
    ('premium', 'store_settings', true, NULL),
    ('premium', 'manual_whatsapp', true, NULL),
    ('premium', 'automatic_whatsapp', true, NULL),
    ('premium', 'print_kitchen', true, NULL),
    ('premium', 'loyalty', true, NULL),
    ('premium', 'reorder', true, NULL),
    ('premium', 'cart_suggestions', true, NULL),
    ('premium', 'custom_domain', true, NULL),
    ('premium', 'priority_support', true, NULL)
)
INSERT INTO "plan_features" ("plan_id", "feature_id", "is_enabled", "limit_value")
SELECT p."id", f."id", pl.enabled, pl.limit_value
FROM plan_limits pl
JOIN "subscription_plans" p ON p."code" = pl.plan_code
JOIN "platform_features" f ON f."code" = pl.feature_code
ON CONFLICT ("plan_id", "feature_id") DO UPDATE SET
  "is_enabled" = EXCLUDED."is_enabled",
  "limit_value" = EXCLUDED."limit_value";
