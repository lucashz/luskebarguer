create table if not exists "admin_password_reset_tokens" (
  "id" uuid primary key default gen_random_uuid(),
  "admin_user_id" uuid not null references "admin_users"("id") on delete cascade,
  "token_hash" text not null unique,
  "status" text not null default 'pending',
  "expires_at" timestamptz not null,
  "used_at" timestamptz,
  "created_at" timestamptz not null default now()
);

create index if not exists "admin_password_reset_tokens_admin_status_created_idx"
  on "admin_password_reset_tokens" ("admin_user_id", "status", "created_at");

update "email_templates"
set
  "subject" = 'Recupere sua senha de acesso',
  "body" = 'Olá {{customer_name}},

Recebemos uma solicitação para recuperar o acesso ao painel da sua loja.

Clique no link abaixo para criar uma nova senha:
{{reset_url}}

Este link expira em {{due_date}}.

Se você não solicitou isso, ignore este e-mail.',
  "variables" = array[
    'store_name',
    'company_name',
    'customer_name',
    'plan_name',
    'due_date',
    'dashboard_url',
    'payment_url',
    'support_url',
    'cardapio_url',
    'platform_url',
    'reset_url'
  ],
  "updated_at" = now()
where "template_key" = 'password_recovery';
