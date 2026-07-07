create extension if not exists "pgcrypto";

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  billing_email text,
  phone text,
  status text not null default 'trial' check (status in ('onboarding', 'active', 'trial', 'payment_pending', 'grace_period', 'past_due', 'suspended', 'cancelled', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  public_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists stores_slug_unique_idx on public.stores (slug);
create index if not exists stores_company_active_idx on public.stores (company_id, is_active, name);

alter table public.companies
  drop constraint if exists companies_status_check,
  add constraint companies_status_check check (status in ('onboarding', 'active', 'trial', 'payment_pending', 'grace_period', 'past_due', 'suspended', 'cancelled', 'archived'));

create table if not exists public.store_domains (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  domain text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'active', 'disabled')),
  verification_token text not null default encode(gen_random_bytes(16), 'hex'),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists store_domains_domain_unique_idx
  on public.store_domains (domain);

create index if not exists store_domains_store_status_idx
  on public.store_domains (store_id, status, created_at desc);

create table if not exists public.payment_transaction_index (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  transaction_id text not null,
  order_id uuid,
  order_public_code text,
  company_id uuid,
  store_id uuid,
  financial_status text not null default 'pending',
  amount numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.payment_transaction_index
  add column if not exists provider text,
  add column if not exists transaction_id text,
  add column if not exists order_id uuid,
  add column if not exists order_public_code text,
  add column if not exists company_id uuid,
  add column if not exists store_id uuid,
  add column if not exists financial_status text not null default 'pending',
  add column if not exists amount numeric(10,2),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists payment_transaction_index_provider_transaction_idx
  on public.payment_transaction_index (provider, transaction_id);

create index if not exists payment_transaction_index_order_code_idx
  on public.payment_transaction_index (order_public_code);

create index if not exists payment_transaction_index_store_idx
  on public.payment_transaction_index (store_id, created_at desc);

create table if not exists public.store_settings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  name text not null default 'Menu da Casa',
  slug text not null default 'menu-da-casa',
  description text,
  whatsapp_number text,
  address text,
  page_title text,
  favicon_url text,
  logo_url text,
  cover_url text,
  is_open boolean not null default true,
  accepts_delivery boolean not null default true,
  accepts_pickup boolean not null default true,
  delivery_fee numeric(10, 2) not null default 0,
  delivery_neighborhood_fees jsonb not null default '{}'::jsonb,
  minimum_order numeric(10, 2) not null default 0,
  payment_methods text[] not null default array['Pix', 'Cartao', 'Dinheiro'],
  business_hours jsonb not null default '{}'::jsonb,
  loyalty_program jsonb not null default '{}'::jsonb,
  theme_settings jsonb not null default '{}'::jsonb,
  print_settings jsonb not null default '{}'::jsonb,
  integration_settings jsonb not null default '{}'::jsonb,
  onboarding_completed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_settings
  add column if not exists store_id uuid references public.stores(id) on delete cascade,
  add column if not exists page_title text,
  add column if not exists favicon_url text,
  add column if not exists business_hours jsonb not null default '{}'::jsonb,
  add column if not exists delivery_neighborhood_fees jsonb not null default '{}'::jsonb,
  add column if not exists loyalty_program jsonb not null default '{}'::jsonb,
  add column if not exists theme_settings jsonb not null default '{}'::jsonb,
  add column if not exists print_settings jsonb not null default '{}'::jsonb,
  add column if not exists integration_settings jsonb not null default '{}'::jsonb,
  add column if not exists onboarding_completed boolean not null default true;

create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.menu_categories
  add column if not exists store_id uuid references public.stores(id) on delete cascade;

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  category_id uuid not null references public.menu_categories(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10, 2) not null check (price >= 0),
  image_url text,
  tags text[] not null default '{}',
  is_featured boolean not null default false,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.menu_items
  add column if not exists store_id uuid references public.stores(id) on delete cascade;

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  name text not null,
  email text not null,
  password_hash text not null,
  role text not null default 'admin' check (role in ('owner', 'manager', 'superadmin', 'admin', 'waiter', 'attendant', 'delivery', 'kitchen')),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_users
  add column if not exists company_id uuid references public.companies(id) on delete set null,
  alter column role set default 'admin',
  drop constraint if exists admin_users_role_check,
  add constraint admin_users_role_check check (role in ('owner', 'manager', 'superadmin', 'admin', 'waiter', 'attendant', 'delivery', 'kitchen'));

create table if not exists public.admin_user_store_access (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner', 'manager', 'admin', 'waiter', 'kitchen', 'attendant', 'delivery')),
  permissions text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists admin_user_store_access_unique_idx
  on public.admin_user_store_access (admin_user_id, store_id);

create index if not exists admin_user_store_access_store_idx
  on public.admin_user_store_access (store_id, is_active, role);

create table if not exists public.admin_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  email text not null,
  phone text,
  name text,
  role text not null default 'attendant' check (role in ('admin', 'waiter', 'attendant', 'delivery', 'kitchen')),
  token_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled', 'expired')),
  invited_by uuid references public.admin_users(id) on delete set null,
  accepted_by uuid references public.admin_users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists admin_invitations_token_hash_unique_idx
  on public.admin_invitations (token_hash);

create index if not exists admin_invitations_store_status_idx
  on public.admin_invitations (store_id, status, created_at desc);

alter table public.admin_invitations
  add column if not exists phone text;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  birth_date date,
  password_hash text,
  notes text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers
  add column if not exists store_id uuid references public.stores(id) on delete cascade,
  add column if not exists password_hash text,
  add column if not exists last_login_at timestamptz,
  add column if not exists birth_date date;

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text not null default 'Principal',
  street text not null,
  postal_code text,
  number text,
  complement text,
  neighborhood text,
  city text,
  reference text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_addresses
  add column if not exists store_id uuid references public.stores(id) on delete cascade,
  add column if not exists postal_code text;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  public_code text not null,
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'new' check (status in (
    'new',
    'accepted',
    'preparing',
    'ready',
    'out_for_delivery',
    'completed',
    'cancelled'
  )),
  fulfillment_method text not null default 'delivery' check (fulfillment_method in ('delivery', 'pickup', 'counter', 'table', 'tab')),
  payment_method text not null,
  dining_table_id uuid,
  customer_tab_id uuid,
  table_snapshot jsonb,
  tab_snapshot jsonb,
  customer_snapshot jsonb not null default '{}',
  address_snapshot jsonb,
  subtotal numeric(10, 2) not null default 0,
  delivery_fee numeric(10, 2) not null default 0,
  discount numeric(10, 2) not null default 0,
  total numeric(10, 2) not null default 0,
  notes text,
  payment_details jsonb not null default '{}'::jsonb,
  financial_status text not null default 'pending' check (financial_status in ('pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded')),
  payment_provider text,
  payment_transaction_id text,
  paid_amount numeric(10, 2),
  paid_at timestamptz,
  payment_expires_at timestamptz,
  refunded_amount numeric(10, 2),
  refunded_at timestamptz,
  reconciliation_status text not null default 'pending' check (reconciliation_status in ('pending', 'matched', 'divergent', 'ignored')),
  reconciled_at timestamptz,
  promotion_code text,
  whatsapp_message text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists store_id uuid references public.stores(id) on delete cascade,
  add column if not exists archived_at timestamptz,
  add column if not exists promotion_code text,
  add column if not exists payment_details jsonb not null default '{}'::jsonb,
  add column if not exists financial_status text not null default 'pending',
  add column if not exists payment_provider text,
  add column if not exists payment_transaction_id text,
  add column if not exists paid_amount numeric(10, 2),
  add column if not exists paid_at timestamptz,
  add column if not exists payment_expires_at timestamptz,
  add column if not exists refunded_amount numeric(10, 2),
  add column if not exists refunded_at timestamptz,
  add column if not exists reconciliation_status text not null default 'pending',
  add column if not exists reconciled_at timestamptz,
  add column if not exists dining_table_id uuid,
  add column if not exists customer_tab_id uuid,
  add column if not exists table_snapshot jsonb,
  add column if not exists tab_snapshot jsonb;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'orders_fulfillment_method_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders drop constraint orders_fulfillment_method_check;
  end if;
  alter table public.orders
    add constraint orders_fulfillment_method_check
    check (fulfillment_method in ('delivery', 'pickup', 'counter', 'table', 'tab'));
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'orders_reconciliation_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders drop constraint orders_reconciliation_status_check;
  end if;
  alter table public.orders
    add constraint orders_reconciliation_status_check
    check (reconciliation_status in ('pending', 'matched', 'divergent', 'ignored'));
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'orders_financial_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders drop constraint orders_financial_status_check;
  end if;
  alter table public.orders
    add constraint orders_financial_status_check
    check (financial_status in ('pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded'));
end $$;

create table if not exists public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  name text not null,
  code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dining_tables
  add column if not exists store_id uuid references public.stores(id) on delete cascade;

create table if not exists public.customer_tabs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  name text not null,
  customer_name text,
  dining_table_id uuid references public.dining_tables(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  payment_method text,
  discount numeric(10, 2) not null default 0,
  total numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_dining_table_id_fkey'
  ) then
    alter table public.orders
      add constraint orders_dining_table_id_fkey
      foreign key (dining_table_id) references public.dining_tables(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'orders_customer_tab_id_fkey'
  ) then
    alter table public.orders
      add constraint orders_customer_tab_id_fkey
      foreign key (customer_tab_id) references public.customer_tabs(id) on delete set null;
  end if;
end $$;

alter table public.customer_tabs
  add column if not exists store_id uuid references public.stores(id) on delete cascade,
  add column if not exists payment_method text,
  add column if not exists discount numeric(10, 2) not null default 0,
  add column if not exists total numeric(10, 2) not null default 0;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  item_snapshot jsonb not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10, 2) not null,
  total numeric(10, 2) not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.order_items
  add column if not exists store_id uuid references public.stores(id) on delete cascade;

create table if not exists public.order_print_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  print_type text not null check (print_type in ('kitchen', 'customer', 'both')),
  paper_width text not null default '80' check (paper_width in ('58', '80')),
  copies integer not null default 1,
  reason text not null default 'manual' check (reason in ('manual', 'auto', 'retry', 'preview')),
  status text not null default 'attempted' check (status in ('attempted', 'blocked', 'completed')),
  created_at timestamptz not null default now()
);

alter table public.order_print_logs
  add column if not exists store_id uuid references public.stores(id) on delete cascade;

create table if not exists public.order_whatsapp_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_status text not null,
  recipient_phone text,
  message text not null,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent', 'failed', 'skipped')),
  provider text,
  provider_message_id text,
  error_message text,
  is_manual boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.order_whatsapp_logs
  add column if not exists store_id uuid references public.stores(id) on delete cascade;

create unique index if not exists order_whatsapp_logs_auto_unique_idx
  on public.order_whatsapp_logs (order_id, order_status)
  where is_manual = false;

create table if not exists public.order_payment_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  transaction_id text,
  financial_status text not null,
  amount numeric(10, 2),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.order_payment_events
  add column if not exists store_id uuid references public.stores(id) on delete cascade;

create unique index if not exists order_payment_events_provider_event_unique_idx
  on public.order_payment_events (provider, provider_event_id);

create table if not exists public.menu_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  name text not null,
  description text,
  min_choices integer not null default 0,
  max_choices integer not null default 1,
  is_required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.menu_modifier_groups
  add column if not exists store_id uuid references public.stores(id) on delete cascade,
  add column if not exists description text;

create table if not exists public.menu_modifiers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  group_id uuid not null references public.menu_modifier_groups(id) on delete cascade,
  name text not null,
  price_delta numeric(10, 2) not null default 0,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.menu_modifiers
  add column if not exists store_id uuid references public.stores(id) on delete cascade;

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  name text not null,
  code text not null,
  description text,
  promotion_type text not null default 'general',
  discount_type text not null default 'fixed' check (discount_type in ('fixed', 'percent', 'free_delivery')),
  discount_value numeric(10, 2) not null default 0,
  minimum_order numeric(10, 2) not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses integer,
  max_uses_per_customer integer not null default 1,
  allowed_category_ids uuid[] not null default '{}',
  combo_item_ids uuid[] not null default '{}',
  recurring_min_orders integer not null default 2,
  birthday_window_days integer not null default 7,
  used_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.promotions
  add column if not exists store_id uuid references public.stores(id) on delete cascade,
  add column if not exists promotion_type text not null default 'general',
  add column if not exists max_uses_per_customer integer not null default 1,
  add column if not exists allowed_category_ids uuid[] not null default '{}',
  add column if not exists combo_item_ids uuid[] not null default '{}',
  add column if not exists recurring_min_orders integer not null default 2,
  add column if not exists birthday_window_days integer not null default 7;

create table if not exists public.app_sessions (
  token text primary key,
  company_id uuid references public.companies(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  type text not null check (type in ('admin', 'customer')),
  owner_id uuid not null,
  data jsonb not null default '{}',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_sessions
  add column if not exists company_id uuid references public.companies(id) on delete cascade,
  add column if not exists store_id uuid references public.stores(id) on delete cascade;

create table if not exists public.platform_features (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  category text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists platform_features_code_unique_idx
  on public.platform_features (code);

alter table public.platform_features
  add column if not exists sort_order integer not null default 0;

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  monthly_price numeric(10, 2) not null default 0,
  annual_price numeric(10, 2) not null default 0,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscription_plans_code_unique_idx
  on public.subscription_plans (code);

create table if not exists public.plan_features (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  feature_id uuid not null references public.platform_features(id) on delete cascade,
  is_enabled boolean not null default true,
  limit_value integer,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists plan_features_plan_feature_unique_idx
  on public.plan_features (plan_id, feature_id);

create table if not exists public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  status text not null default 'trial' check (status in ('trial', 'active', 'payment_pending', 'grace_period', 'cancelled', 'expired', 'suspended')),
  trial_ends_at timestamptz,
  current_period_starts_at timestamptz,
  current_period_ends_at timestamptz,
  next_renewal_at timestamptz,
  cancelled_at timestamptz,
  suspended_at timestamptz,
  billing_provider text,
  external_subscription_id text,
  last_payment_at timestamptz,
  payment_due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_subscriptions_company_status_idx
  on public.company_subscriptions (company_id, status, created_at desc);

alter table public.company_subscriptions
  add column if not exists billing_provider text,
  add column if not exists external_subscription_id text,
  add column if not exists last_payment_at timestamptz,
  add column if not exists payment_due_at timestamptz;

create table if not exists public.company_feature_overrides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  feature_id uuid not null references public.platform_features(id) on delete cascade,
  override_type text not null check (override_type in ('allow', 'block', 'limit')),
  limit_value integer,
  starts_at timestamptz,
  ends_at timestamptz,
  reason text,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_feature_overrides_company_feature_idx
  on public.company_feature_overrides (company_id, feature_id, ends_at);

create table if not exists public.company_usage_counters (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  feature_id uuid references public.platform_features(id) on delete cascade,
  usage_key text not null,
  period_start date not null,
  period_end date not null,
  used_value integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists company_usage_counters_unique_idx
  on public.company_usage_counters (company_id, usage_key, period_start, period_end);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  feature_id uuid references public.platform_features(id) on delete set null,
  usage_key text not null,
  quantity integer not null default 1,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_company_key_created_idx
  on public.usage_events (company_id, usage_key, created_at desc);

create index if not exists usage_events_store_key_created_idx
  on public.usage_events (store_id, usage_key, created_at desc);

create table if not exists public.onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  current_step text not null default 'welcome',
  completed_steps text[] not null default '{}',
  is_completed boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists onboarding_progress_company_store_unique_idx
  on public.onboarding_progress (company_id, store_id);

update public.store_settings s
set onboarding_completed = true
where s.onboarding_completed = false
  and not exists (
    select 1 from public.onboarding_progress p
    where p.store_id = s.store_id
  );

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid references public.company_subscriptions(id) on delete set null,
  event_type text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists subscription_events_company_created_idx
  on public.subscription_events (company_id, created_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  actor_admin_id uuid references public.admin_users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  severity text not null default 'info' check (severity in ('debug', 'info', 'warning', 'critical')),
  request_id text,
  before_data jsonb,
  after_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.audit_logs
  add column if not exists severity text not null default 'info',
  add column if not exists request_id text;

create index if not exists audit_logs_company_created_idx
  on public.audit_logs (company_id, created_at desc);

create index if not exists audit_logs_store_created_idx
  on public.audit_logs (store_id, created_at desc);

create index if not exists audit_logs_actor_created_idx
  on public.audit_logs (actor_admin_id, created_at desc);

create index if not exists audit_logs_action_created_idx
  on public.audit_logs (action, created_at desc);

create unique index if not exists customers_phone_unique_idx on public.customers (phone);
create unique index if not exists admin_users_email_unique_idx on public.admin_users (email);
create unique index if not exists orders_public_code_unique_idx on public.orders (public_code);

create index if not exists store_settings_store_idx
  on public.store_settings (store_id);

create index if not exists menu_categories_store_active_sort_idx
  on public.menu_categories (store_id, is_active, sort_order, name);

create index if not exists menu_items_store_category_available_sort_idx
  on public.menu_items (store_id, category_id, is_available, sort_order, name);

create index if not exists customers_store_phone_idx
  on public.customers (store_id, phone);

create index if not exists customer_addresses_store_customer_idx
  on public.customer_addresses (store_id, customer_id, is_default desc, updated_at desc);

create index if not exists orders_store_status_archived_created_idx
  on public.orders (store_id, status, archived_at, created_at desc);

create index if not exists orders_store_customer_created_idx
  on public.orders (store_id, customer_id, created_at desc);

create index if not exists order_items_store_order_idx
  on public.order_items (store_id, order_id);

create index if not exists order_print_logs_store_order_idx
  on public.order_print_logs (store_id, order_id, created_at desc);

create index if not exists order_whatsapp_logs_store_order_idx
  on public.order_whatsapp_logs (store_id, order_id, created_at desc);

create index if not exists order_payment_events_store_order_idx
  on public.order_payment_events (store_id, order_id, created_at desc);

create index if not exists dining_tables_store_active_idx
  on public.dining_tables (store_id, is_active, name);

drop index if exists public.dining_tables_code_key;
create unique index if not exists dining_tables_store_code_idx
  on public.dining_tables (store_id, code);

create index if not exists customer_tabs_store_status_idx
  on public.customer_tabs (store_id, status, opened_at desc);

create index if not exists promotions_store_code_idx
  on public.promotions (store_id, code);

create index if not exists app_sessions_store_owner_idx
  on public.app_sessions (store_id, type, owner_id);

create index if not exists menu_categories_active_sort_idx
  on public.menu_categories (is_active, sort_order, name);

create index if not exists menu_items_category_available_sort_idx
  on public.menu_items (category_id, is_available, sort_order, name);

create index if not exists menu_modifier_groups_item_sort_idx
  on public.menu_modifier_groups (menu_item_id, sort_order, name);

create index if not exists menu_modifiers_group_available_sort_idx
  on public.menu_modifiers (group_id, is_available, sort_order, name);

create unique index if not exists promotions_code_unique_idx
  on public.promotions (code);

create index if not exists promotions_active_dates_idx
  on public.promotions (is_active, starts_at, ends_at);

create index if not exists promotions_type_active_idx
  on public.promotions (promotion_type, is_active);

create index if not exists orders_customer_created_idx
  on public.orders (customer_id, created_at desc);

create index if not exists orders_status_created_idx
  on public.orders (status, created_at desc);

create index if not exists orders_archived_created_idx
  on public.orders (archived_at, created_at desc);

create index if not exists orders_created_idx
  on public.orders (created_at desc);

create index if not exists orders_status_archived_created_idx
  on public.orders (status, archived_at, created_at desc);

create index if not exists order_items_order_idx
  on public.order_items (order_id);

create index if not exists order_print_logs_order_created_idx
  on public.order_print_logs (order_id, created_at desc);

create index if not exists order_whatsapp_logs_order_created_idx
  on public.order_whatsapp_logs (order_id, created_at desc);

create index if not exists order_payment_events_order_created_idx
  on public.order_payment_events (order_id, created_at desc);

create index if not exists order_items_menu_item_idx
  on public.order_items (menu_item_id);

create index if not exists customer_addresses_customer_default_idx
  on public.customer_addresses (customer_id, is_default desc, updated_at desc);

create index if not exists app_sessions_owner_idx
  on public.app_sessions (type, owner_id);

create index if not exists app_sessions_expires_idx
  on public.app_sessions (expires_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists store_settings_updated_at on public.store_settings;
create trigger store_settings_updated_at
before update on public.store_settings
for each row execute function public.set_updated_at();

drop trigger if exists companies_updated_at on public.companies;
create trigger companies_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists stores_updated_at on public.stores;
create trigger stores_updated_at
before update on public.stores
for each row execute function public.set_updated_at();

drop trigger if exists store_domains_updated_at on public.store_domains;
create trigger store_domains_updated_at
before update on public.store_domains
for each row execute function public.set_updated_at();

drop trigger if exists payment_transaction_index_updated_at on public.payment_transaction_index;
create trigger payment_transaction_index_updated_at
before update on public.payment_transaction_index
for each row execute function public.set_updated_at();

drop trigger if exists admin_user_store_access_updated_at on public.admin_user_store_access;
create trigger admin_user_store_access_updated_at
before update on public.admin_user_store_access
for each row execute function public.set_updated_at();

drop trigger if exists menu_categories_updated_at on public.menu_categories;
create trigger menu_categories_updated_at
before update on public.menu_categories
for each row execute function public.set_updated_at();

drop trigger if exists menu_items_updated_at on public.menu_items;
create trigger menu_items_updated_at
before update on public.menu_items
for each row execute function public.set_updated_at();

drop trigger if exists customers_updated_at on public.customers;
create trigger customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists admin_users_updated_at on public.admin_users;
create trigger admin_users_updated_at
before update on public.admin_users
for each row execute function public.set_updated_at();

drop trigger if exists customer_addresses_updated_at on public.customer_addresses;
create trigger customer_addresses_updated_at
before update on public.customer_addresses
for each row execute function public.set_updated_at();

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists menu_modifier_groups_updated_at on public.menu_modifier_groups;
create trigger menu_modifier_groups_updated_at
before update on public.menu_modifier_groups
for each row execute function public.set_updated_at();

drop trigger if exists menu_modifiers_updated_at on public.menu_modifiers;
create trigger menu_modifiers_updated_at
before update on public.menu_modifiers
for each row execute function public.set_updated_at();

drop trigger if exists promotions_updated_at on public.promotions;
create trigger promotions_updated_at
before update on public.promotions
for each row execute function public.set_updated_at();

drop trigger if exists app_sessions_updated_at on public.app_sessions;
create trigger app_sessions_updated_at
before update on public.app_sessions
for each row execute function public.set_updated_at();

drop trigger if exists platform_features_updated_at on public.platform_features;
create trigger platform_features_updated_at
before update on public.platform_features
for each row execute function public.set_updated_at();

drop trigger if exists subscription_plans_updated_at on public.subscription_plans;
create trigger subscription_plans_updated_at
before update on public.subscription_plans
for each row execute function public.set_updated_at();

drop trigger if exists plan_features_updated_at on public.plan_features;
create trigger plan_features_updated_at
before update on public.plan_features
for each row execute function public.set_updated_at();

drop trigger if exists company_subscriptions_updated_at on public.company_subscriptions;
create trigger company_subscriptions_updated_at
before update on public.company_subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists company_feature_overrides_updated_at on public.company_feature_overrides;
create trigger company_feature_overrides_updated_at
before update on public.company_feature_overrides
for each row execute function public.set_updated_at();

drop trigger if exists company_usage_counters_updated_at on public.company_usage_counters;
create trigger company_usage_counters_updated_at
before update on public.company_usage_counters
for each row execute function public.set_updated_at();

alter table public.companies enable row level security;
alter table public.stores enable row level security;
alter table public.store_settings enable row level security;
alter table public.admin_user_store_access enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.admin_users enable row level security;
alter table public.admin_invitations enable row level security;
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_print_logs enable row level security;
alter table public.order_whatsapp_logs enable row level security;
alter table public.order_payment_events enable row level security;
alter table public.menu_modifier_groups enable row level security;
alter table public.menu_modifiers enable row level security;
alter table public.promotions enable row level security;
alter table public.app_sessions enable row level security;
alter table public.platform_features enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.plan_features enable row level security;
alter table public.company_subscriptions enable row level security;
alter table public.company_feature_overrides enable row level security;
alter table public.company_usage_counters enable row level security;
alter table public.store_domains enable row level security;
alter table public.payment_transaction_index enable row level security;
alter table public.usage_events enable row level security;
alter table public.onboarding_progress enable row level security;
alter table public.subscription_events enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "Public can read store settings" on public.store_settings;

drop policy if exists "Public can read active categories" on public.menu_categories;
create policy "Public can read active categories"
on public.menu_categories
for select
using (is_active = true);

drop policy if exists "Public can read available items" on public.menu_items;
create policy "Public can read available items"
on public.menu_items
for select
using (is_available = true);

drop policy if exists "Public can read modifier groups" on public.menu_modifier_groups;
create policy "Public can read modifier groups"
on public.menu_modifier_groups
for select
using (true);

drop policy if exists "Public can read available modifiers" on public.menu_modifiers;
create policy "Public can read available modifiers"
on public.menu_modifiers
for select
using (is_available = true);

insert into public.companies (name, billing_email, phone, status)
select 'Luske Alimentacao', null, null, 'trial'
where not exists (
  select 1 from public.companies where name = 'Luske Alimentacao'
);

insert into public.stores (company_id, name, slug, description, public_url, is_active)
select
  c.id,
  coalesce((select nullif(name, '') from public.store_settings order by created_at asc limit 1), 'LSK BURGUER'),
  'luske-burguer',
  coalesce((select description from public.store_settings order by created_at asc limit 1), 'Cardapio digital da Luske Burguer.'),
  '/luske-burguer',
  true
from public.companies c
where c.name = 'Luske Alimentacao'
and not exists (
  select 1 from public.stores where slug = 'luske-burguer'
);

insert into public.platform_features (code, name, description, category)
values
  ('digital_menu', 'Cardapio digital', 'Cardapio publico com categorias, produtos, fotos e adicionais.', 'core'),
  ('orders', 'Pedidos', 'Recebimento e acompanhamento de pedidos.', 'operation'),
  ('kitchen', 'Cozinha', 'Tela operacional de preparo.', 'operation'),
  ('basic_reports', 'Relatorios basicos', 'Resumo de vendas, pedidos e produtos.', 'reports'),
  ('store_settings', 'Configuracoes da loja', 'Dados da loja, horarios, formas de pagamento e tema.', 'settings'),
  ('admin_users', 'Usuarios administrativos', 'Contas e permissoes da equipe.', 'settings'),
  ('manual_whatsapp', 'WhatsApp manual', 'Abertura manual de mensagens para o cliente.', 'integrations'),
  ('tables', 'Mesas', 'Cadastro de mesas e pedidos por QR Code.', 'salon'),
  ('tabs', 'Comandas', 'Abertura, consumo e fechamento de comandas.', 'salon'),
  ('waiter', 'Garcom', 'Fluxo simplificado para atendimento no salao.', 'salon'),
  ('counter', 'Balcao', 'Pedido rapido no balcao.', 'operation'),
  ('thermal_printing', 'Impressao termica', 'Vias de cozinha, cliente e reimpressao.', 'operation'),
  ('customers', 'Clientes', 'Cadastro, enderecos e historico de clientes.', 'crm'),
  ('advanced_reports', 'Relatorios avancados', 'Comparativos e indicadores por periodo.', 'reports'),
  ('automatic_whatsapp', 'WhatsApp automatico', 'Mensagens automaticas por status do pedido.', 'integrations'),
  ('online_payment', 'Pagamento online', 'Pix online com status financeiro.', 'payments'),
  ('payment_transactions', 'Transacoes online', 'Limite mensal de transacoes de pagamento online.', 'payments'),
  ('promotions', 'Promocoes', 'Cupons e campanhas comerciais.', 'marketing'),
  ('loyalty', 'Fidelidade', 'Programa de pontos ou recompensas.', 'marketing'),
  ('cash_register', 'Caixa', 'Abertura, fechamento e movimentacoes.', 'finance'),
  ('stock', 'Estoque', 'Controle de insumos e movimentacoes.', 'inventory'),
  ('financial', 'Financeiro', 'Contas, despesas, receitas e fluxo de caixa.', 'finance'),
  ('fiscal', 'Fiscal', 'Preparacao para documentos fiscais.', 'fiscal'),
  ('multi_store', 'Multiunidade', 'Mais de uma loja por empresa.', 'platform'),
  ('api', 'API', 'API e webhooks avancados.', 'platform'),
  ('webhook_calls', 'Chamadas de webhook', 'Limite mensal de chamadas de webhook/API.', 'platform'),
  ('custom_domain', 'Dominio personalizado', 'Dominio proprio por loja.', 'platform')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_active = true;

insert into public.subscription_plans (code, name, description, monthly_price, annual_price, sort_order, is_active)
values
  ('essential', 'Essencial', 'Cardapio, pedidos, cozinha e relatorios basicos para comecar.', 0, 0, 10, true),
  ('operation', 'Operacao', 'Inclui mesas, comandas, balcao, clientes e impressao.', 0, 0, 20, true),
  ('growth', 'Crescimento', 'Inclui WhatsApp automatico, pagamento online, cupons e fidelidade.', 0, 0, 30, true),
  ('management_pro', 'Gestao Pro', 'Prepara a plataforma para caixa, estoque, financeiro e multiunidade.', 0, 0, 40, true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

insert into public.plan_features (plan_id, feature_id, is_enabled, limit_value, settings)
select p.id, f.id, true,
  case
    when p.code = 'essential' and f.code = 'customers' then null
    when p.code = 'essential' and f.code = 'digital_menu' then 100
    when p.code = 'essential' and f.code = 'admin_users' then 3
    when p.code = 'essential' and f.code = 'orders' then 300
    when p.code = 'essential' and f.code = 'manual_whatsapp' then 300
    when p.code = 'operation' and f.code = 'admin_users' then 8
    when p.code = 'operation' and f.code = 'orders' then 1500
    when p.code = 'operation' and f.code = 'thermal_printing' then 1500
    when p.code = 'growth' and f.code = 'admin_users' then 20
    when p.code = 'growth' and f.code = 'orders' then 5000
    when p.code = 'growth' and f.code = 'automatic_whatsapp' then 3000
    when p.code = 'growth' and f.code = 'payment_transactions' then 2000
    when p.code = 'management_pro' and f.code = 'custom_domain' then 5
    when p.code = 'management_pro' and f.code = 'webhook_calls' then 20000
    when p.code = 'essential' and f.code in ('orders', 'kitchen', 'basic_reports', 'store_settings', 'manual_whatsapp') then null
    when p.code = 'operation' and f.code in ('digital_menu', 'orders', 'kitchen', 'basic_reports', 'store_settings', 'manual_whatsapp', 'tables', 'tabs', 'waiter', 'counter', 'thermal_printing', 'customers', 'advanced_reports') then null
    when p.code = 'growth' and f.code not in ('cash_register', 'stock', 'financial', 'fiscal', 'multi_store', 'api', 'custom_domain') then null
    when p.code = 'management_pro' then null
    else null
  end,
  '{}'::jsonb
from public.subscription_plans p
join public.platform_features f on (
  (p.code = 'essential' and f.code in ('digital_menu', 'orders', 'kitchen', 'basic_reports', 'store_settings', 'admin_users', 'manual_whatsapp')) or
  (p.code = 'operation' and f.code in ('digital_menu', 'orders', 'kitchen', 'basic_reports', 'store_settings', 'admin_users', 'manual_whatsapp', 'tables', 'tabs', 'waiter', 'counter', 'thermal_printing', 'customers', 'advanced_reports')) or
  (p.code = 'growth' and f.code not in ('cash_register', 'stock', 'financial', 'fiscal', 'multi_store', 'api', 'custom_domain', 'webhook_calls')) or
  (p.code = 'management_pro')
)
on conflict (plan_id, feature_id) do update set
  is_enabled = excluded.is_enabled,
  limit_value = excluded.limit_value,
  settings = excluded.settings;

insert into public.company_subscriptions (
  company_id,
  plan_id,
  status,
  trial_ends_at,
  current_period_starts_at,
  current_period_ends_at,
  next_renewal_at,
  metadata
)
select
  c.id,
  p.id,
  'trial',
  now() + interval '14 days',
  now(),
  now() + interval '14 days',
  now() + interval '14 days',
  jsonb_build_object('source', 'initial_multitenant_migration')
from public.companies c
join public.subscription_plans p on p.code = 'management_pro'
where c.name = 'Luske Alimentacao'
and not exists (
  select 1 from public.company_subscriptions s where s.company_id = c.id
);

with default_store as (
  select s.id as store_id, s.company_id
  from public.stores s
  where s.slug = 'luske-burguer'
  limit 1
)
update public.store_settings t
set store_id = d.store_id
from default_store d
where t.store_id is null;

with default_store as (
  select s.id as store_id
  from public.stores s
  where s.slug = 'luske-burguer'
  limit 1
)
update public.menu_categories t
set store_id = d.store_id
from default_store d
where t.store_id is null;

update public.menu_items t
set store_id = c.store_id
from public.menu_categories c
where t.category_id = c.id
and t.store_id is null
and c.store_id is not null;

with default_store as (
  select s.id as store_id
  from public.stores s
  where s.slug = 'luske-burguer'
  limit 1
)
update public.menu_items t
set store_id = d.store_id
from default_store d
where t.store_id is null;

update public.menu_modifier_groups t
set store_id = i.store_id
from public.menu_items i
where t.menu_item_id = i.id
and t.store_id is null
and i.store_id is not null;

update public.menu_modifiers t
set store_id = g.store_id
from public.menu_modifier_groups g
where t.group_id = g.id
and t.store_id is null
and g.store_id is not null;

with default_store as (
  select s.id as store_id, s.company_id
  from public.stores s
  where s.slug = 'luske-burguer'
  limit 1
)
update public.admin_users t
set company_id = d.company_id
from default_store d
where t.company_id is null;

with default_store as (
  select s.id as store_id, s.company_id
  from public.stores s
  where s.slug = 'luske-burguer'
  limit 1
)
insert into public.admin_user_store_access (admin_user_id, company_id, store_id, role, permissions, is_active)
select
  a.id,
  d.company_id,
  d.store_id,
  a.role,
  '{}'::text[],
  a.is_active
from public.admin_users a
cross join default_store d
where not exists (
  select 1
  from public.admin_user_store_access access
  where access.admin_user_id = a.id
  and access.store_id = d.store_id
);

with default_store as (
  select s.id as store_id
  from public.stores s
  where s.slug = 'luske-burguer'
  limit 1
)
update public.customers t
set store_id = d.store_id
from default_store d
where t.store_id is null;

update public.customer_addresses t
set store_id = c.store_id
from public.customers c
where t.customer_id = c.id
and t.store_id is null
and c.store_id is not null;

with default_store as (
  select s.id as store_id
  from public.stores s
  where s.slug = 'luske-burguer'
  limit 1
)
update public.orders t
set store_id = d.store_id
from default_store d
where t.store_id is null;

update public.order_items t
set store_id = o.store_id
from public.orders o
where t.order_id = o.id
and t.store_id is null
and o.store_id is not null;

update public.order_print_logs t
set store_id = o.store_id
from public.orders o
where t.order_id = o.id
and t.store_id is null
and o.store_id is not null;

update public.order_whatsapp_logs t
set store_id = o.store_id
from public.orders o
where t.order_id = o.id
and t.store_id is null
and o.store_id is not null;

update public.order_payment_events t
set store_id = o.store_id
from public.orders o
where t.order_id = o.id
and t.store_id is null
and o.store_id is not null;

with default_store as (
  select s.id as store_id
  from public.stores s
  where s.slug = 'luske-burguer'
  limit 1
)
update public.dining_tables t
set store_id = d.store_id
from default_store d
where t.store_id is null;

update public.customer_tabs t
set store_id = dt.store_id
from public.dining_tables dt
where t.dining_table_id = dt.id
and t.store_id is null
and dt.store_id is not null;

with default_store as (
  select s.id as store_id
  from public.stores s
  where s.slug = 'luske-burguer'
  limit 1
)
update public.customer_tabs t
set store_id = d.store_id
from default_store d
where t.store_id is null;

with default_store as (
  select s.id as store_id
  from public.stores s
  where s.slug = 'luske-burguer'
  limit 1
)
update public.promotions t
set store_id = d.store_id
from default_store d
where t.store_id is null;

with default_store as (
  select s.id as store_id, s.company_id
  from public.stores s
  where s.slug = 'luske-burguer'
  limit 1
)
update public.app_sessions t
set store_id = coalesce(t.store_id, d.store_id),
    company_id = coalesce(t.company_id, d.company_id)
from default_store d
where t.store_id is null
or t.company_id is null;

insert into public.store_settings (
  store_id,
  name,
  slug,
  description,
  whatsapp_number,
  address,
  delivery_fee,
  minimum_order,
  payment_methods
)
select
  (select id from public.stores where slug = 'luske-burguer' limit 1),
  'Menu da Casa',
  'menu-da-casa',
  'Pedido rapido pelo cardapio digital.',
  '5511999999999',
  'Rua Exemplo, 100',
  5.00,
  20.00,
  array['Pix', 'Cartao na entrega', 'Dinheiro']
where not exists (select 1 from public.store_settings);

insert into public.menu_categories (store_id, name, description, sort_order)
select (select id from public.stores where slug = 'luske-burguer' limit 1), 'Entradas', 'Para abrir o apetite.', 10
where not exists (select 1 from public.menu_categories where name = 'Entradas');

insert into public.menu_categories (store_id, name, description, sort_order)
select (select id from public.stores where slug = 'luske-burguer' limit 1), 'Pratos', 'Receitas principais da casa.', 20
where not exists (select 1 from public.menu_categories where name = 'Pratos');

insert into public.menu_categories (store_id, name, description, sort_order)
select (select id from public.stores where slug = 'luske-burguer' limit 1), 'Hamburgueres', 'Burgers artesanais com pao macio, queijo e molhos da casa.', 25
where not exists (select 1 from public.menu_categories where name = 'Hamburgueres');

insert into public.menu_categories (store_id, name, description, sort_order)
select (select id from public.stores where slug = 'luske-burguer' limit 1), 'Bebidas', 'Geladas, quentes e especiais.', 30
where not exists (select 1 from public.menu_categories where name = 'Bebidas');

insert into public.menu_items (store_id, category_id, name, description, price, image_url, tags, is_featured, sort_order)
select
  store_id,
  id,
  'Bruschetta da Casa',
  'Tomate fresco, manjericao e azeite sobre pao tostado.',
  24.90,
  'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?auto=format&fit=crop&w=900&q=80',
  array['vegetariano'],
  true,
  10
from public.menu_categories
where name = 'Entradas'
and not exists (select 1 from public.menu_items where name = 'Bruschetta da Casa');

insert into public.menu_items (store_id, category_id, name, description, price, image_url, tags, is_featured, sort_order)
select
  store_id,
  id,
  'Risoto de Cogumelos',
  'Arroz arboreo cremoso, cogumelos salteados e parmesao.',
  54.90,
  'https://images.unsplash.com/photo-1476124369491-e7addf5db371?auto=format&fit=crop&w=900&q=80',
  array['vegetariano'],
  true,
  10
from public.menu_categories
where name = 'Pratos'
and not exists (select 1 from public.menu_items where name = 'Risoto de Cogumelos');

insert into public.menu_items (store_id, category_id, name, description, price, image_url, tags, is_featured, sort_order)
select
  store_id,
  id,
  'Luske Smash',
  'Dois smash burgers, cheddar cremoso, cebola caramelizada e molho da casa.',
  34.90,
  'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80',
  array['smash', 'cheddar'],
  true,
  10
from public.menu_categories
where name = 'Hamburgueres'
and not exists (select 1 from public.menu_items where name = 'Luske Smash');

insert into public.menu_items (store_id, category_id, name, description, price, image_url, tags, is_featured, sort_order)
select
  store_id,
  id,
  'Bacon Supreme',
  'Burger artesanal, bacon crocante, queijo prato, alface, tomate e maionese temperada.',
  39.90,
  'https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=900&q=80',
  array['bacon', 'artesanal'],
  true,
  20
from public.menu_categories
where name = 'Hamburgueres'
and not exists (select 1 from public.menu_items where name = 'Bacon Supreme');

insert into public.menu_items (store_id, category_id, name, description, price, image_url, tags, is_featured, sort_order)
select
  store_id,
  id,
  'Classic Salada',
  'Hamburguer, queijo, alface, tomate, picles e molho especial no pao brioche.',
  31.90,
  'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?auto=format&fit=crop&w=900&q=80',
  array['classico', 'brioche'],
  false,
  30
from public.menu_categories
where name = 'Hamburgueres'
and not exists (select 1 from public.menu_items where name = 'Classic Salada');

insert into public.menu_items (store_id, category_id, name, description, price, image_url, tags, is_featured, sort_order)
select
  store_id,
  id,
  'Chicken Crispy',
  'Frango crocante, queijo, alface americana e molho ranch no pao brioche.',
  32.90,
  'https://images.unsplash.com/photo-1615297928064-24977384d0da?auto=format&fit=crop&w=900&q=80',
  array['frango', 'crocante'],
  false,
  40
from public.menu_categories
where name = 'Hamburgueres'
and not exists (select 1 from public.menu_items where name = 'Chicken Crispy');

insert into public.menu_items (store_id, category_id, name, description, price, image_url, tags, is_featured, sort_order)
select
  store_id,
  id,
  'Limonada Siciliana',
  'Limao siciliano, hortela e gelo.',
  15.90,
  'https://images.unsplash.com/photo-1621263764928-df1444c5e859?auto=format&fit=crop&w=900&q=80',
  array['refrescante'],
  false,
  10
from public.menu_categories
where name = 'Bebidas'
and not exists (select 1 from public.menu_items where name = 'Limonada Siciliana');

insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;
