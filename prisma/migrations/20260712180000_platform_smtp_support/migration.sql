CREATE TABLE IF NOT EXISTS "platform_smtp_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "host" text,
  "port" integer DEFAULT 587,
  "username" text,
  "password_token" text,
  "from_email" text,
  "from_name" text,
  "reply_to" text,
  "use_tls" boolean DEFAULT true,
  "is_active" boolean DEFAULT false,
  "last_test_status" text,
  "last_test_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "email_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "template_key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "variables" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "is_active" boolean NOT NULL DEFAULT true,
  "updated_by" uuid REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid REFERENCES "companies"("id") ON DELETE CASCADE,
  "store_id" uuid REFERENCES "stores"("id") ON DELETE SET NULL,
  "admin_user_id" uuid REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "created_by_admin_id" uuid REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "assigned_to_admin_id" uuid REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "subject" text NOT NULL,
  "category" text,
  "status" text NOT NULL DEFAULT 'open',
  "priority" text NOT NULL DEFAULT 'medium',
  "source" text NOT NULL DEFAULT 'admin',
  "last_message_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "support_ticket_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_id" uuid NOT NULL REFERENCES "support_tickets"("id") ON DELETE CASCADE,
  "author_admin_id" uuid REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "author_type" text NOT NULL DEFAULT 'admin',
  "message" text NOT NULL,
  "is_internal" boolean NOT NULL DEFAULT false,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "support_tickets_company_status_idx" ON "support_tickets" ("company_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "support_tickets_store_idx" ON "support_tickets" ("store_id", "created_at");
CREATE INDEX IF NOT EXISTS "support_ticket_messages_ticket_idx" ON "support_ticket_messages" ("ticket_id", "created_at");

INSERT INTO "email_templates" ("template_key", "name", "subject", "body", "variables")
VALUES
  ('welcome', 'Boas-vindas', 'Bem-vindo ao {{store_name}}', 'Olá {{customer_name}}, seja bem-vindo ao {{store_name}}. Acesse {{dashboard_url}} para começar.', ARRAY['store_name','customer_name','dashboard_url']),
  ('password_recovery', 'Recuperação de senha', 'Recupere sua senha', 'Olá {{customer_name}}, use o link {{dashboard_url}} para recuperar sua senha.', ARRAY['customer_name','dashboard_url']),
  ('trial_ending', 'Trial acabando', 'Seu teste termina em breve', 'Olá {{company_name}}, seu teste do plano {{plan_name}} termina em {{due_date}}.', ARRAY['company_name','plan_name','due_date','payment_url']),
  ('payment_pending', 'Pagamento pendente', 'Pagamento pendente do plano {{plan_name}}', 'Olá {{company_name}}, regularize o pagamento até {{due_date}} em {{payment_url}}.', ARRAY['company_name','plan_name','due_date','payment_url']),
  ('payment_approved', 'Pagamento aprovado', 'Pagamento aprovado', 'Olá {{company_name}}, o pagamento do plano {{plan_name}} foi aprovado.', ARRAY['company_name','plan_name']),
  ('account_suspended', 'Conta suspensa', 'Sua conta foi suspensa', 'Olá {{company_name}}, sua conta foi suspensa. Acesse {{payment_url}} ou fale com o suporte.', ARRAY['company_name','payment_url']),
  ('support_replied', 'Suporte respondeu', 'O suporte respondeu seu chamado', 'Olá {{customer_name}}, respondemos seu chamado. Acesse {{dashboard_url}} para acompanhar.', ARRAY['customer_name','dashboard_url'])
ON CONFLICT ("template_key") DO NOTHING;
