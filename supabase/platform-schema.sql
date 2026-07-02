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

create unique index if not exists platform_stores_slug_unique_idx on public.stores (slug);
create index if not exists platform_stores_company_active_idx on public.stores (company_id, is_active, name);

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

create unique index if not exists platform_store_domains_domain_unique_idx on public.store_domains (domain);
create index if not exists platform_store_domains_store_status_idx on public.store_domains (store_id, status, created_at desc);

create table if not exists public.payment_transaction_index (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  transaction_id text not null,
  order_id uuid,
  order_public_code text,
  company_id uuid references public.companies(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  financial_status text not null default 'pending',
  amount numeric(10,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists platform_payment_transaction_index_provider_transaction_idx on public.payment_transaction_index (provider, transaction_id);
create index if not exists platform_payment_transaction_index_order_code_idx on public.payment_transaction_index (order_public_code);
create index if not exists platform_payment_transaction_index_store_idx on public.payment_transaction_index (store_id, created_at desc);

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

create unique index if not exists platform_admin_users_email_unique_idx on public.admin_users (email);

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

create unique index if not exists platform_admin_user_store_access_unique_idx on public.admin_user_store_access (admin_user_id, store_id);

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

create unique index if not exists platform_admin_invitations_token_hash_unique_idx on public.admin_invitations (token_hash);

create table if not exists public.app_sessions (
  token text primary key,
  company_id uuid references public.companies(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  type text not null check (type in ('admin', 'customer')),
  owner_id uuid not null,
  data jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_app_sessions_store_owner_idx on public.app_sessions (store_id, type, owner_id);
create index if not exists platform_app_sessions_expires_idx on public.app_sessions (expires_at);

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

create unique index if not exists platform_features_code_unique_idx on public.platform_features (code);

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

create unique index if not exists platform_subscription_plans_code_unique_idx on public.subscription_plans (code);

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

create unique index if not exists platform_plan_features_plan_feature_unique_idx on public.plan_features (plan_id, feature_id);

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

create index if not exists platform_company_subscriptions_company_status_idx on public.company_subscriptions (company_id, status, created_at desc);

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

create unique index if not exists platform_company_usage_counters_unique_idx on public.company_usage_counters (company_id, usage_key, period_start, period_end);

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

create index if not exists platform_usage_events_company_key_created_idx on public.usage_events (company_id, usage_key, created_at desc);

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

create unique index if not exists platform_onboarding_progress_company_store_unique_idx on public.onboarding_progress (company_id, store_id);

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

create index if not exists platform_audit_logs_company_created_idx on public.audit_logs (company_id, created_at desc);
create index if not exists platform_audit_logs_store_created_idx on public.audit_logs (store_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_updated_at on public.companies;
create trigger companies_updated_at before update on public.companies for each row execute function public.set_updated_at();
drop trigger if exists stores_updated_at on public.stores;
create trigger stores_updated_at before update on public.stores for each row execute function public.set_updated_at();
drop trigger if exists store_domains_updated_at on public.store_domains;
create trigger store_domains_updated_at before update on public.store_domains for each row execute function public.set_updated_at();
drop trigger if exists payment_transaction_index_updated_at on public.payment_transaction_index;
create trigger payment_transaction_index_updated_at before update on public.payment_transaction_index for each row execute function public.set_updated_at();
drop trigger if exists admin_users_updated_at on public.admin_users;
create trigger admin_users_updated_at before update on public.admin_users for each row execute function public.set_updated_at();
drop trigger if exists admin_user_store_access_updated_at on public.admin_user_store_access;
create trigger admin_user_store_access_updated_at before update on public.admin_user_store_access for each row execute function public.set_updated_at();
drop trigger if exists admin_invitations_updated_at on public.admin_invitations;
create trigger admin_invitations_updated_at before update on public.admin_invitations for each row execute function public.set_updated_at();
drop trigger if exists app_sessions_updated_at on public.app_sessions;
create trigger app_sessions_updated_at before update on public.app_sessions for each row execute function public.set_updated_at();
drop trigger if exists platform_features_updated_at on public.platform_features;
create trigger platform_features_updated_at before update on public.platform_features for each row execute function public.set_updated_at();
drop trigger if exists subscription_plans_updated_at on public.subscription_plans;
create trigger subscription_plans_updated_at before update on public.subscription_plans for each row execute function public.set_updated_at();
drop trigger if exists plan_features_updated_at on public.plan_features;
create trigger plan_features_updated_at before update on public.plan_features for each row execute function public.set_updated_at();
drop trigger if exists company_subscriptions_updated_at on public.company_subscriptions;
create trigger company_subscriptions_updated_at before update on public.company_subscriptions for each row execute function public.set_updated_at();
drop trigger if exists company_feature_overrides_updated_at on public.company_feature_overrides;
create trigger company_feature_overrides_updated_at before update on public.company_feature_overrides for each row execute function public.set_updated_at();
drop trigger if exists company_usage_counters_updated_at on public.company_usage_counters;
create trigger company_usage_counters_updated_at before update on public.company_usage_counters for each row execute function public.set_updated_at();
drop trigger if exists onboarding_progress_updated_at on public.onboarding_progress;
create trigger onboarding_progress_updated_at before update on public.onboarding_progress for each row execute function public.set_updated_at();

alter table public.companies enable row level security;
alter table public.stores enable row level security;
alter table public.store_domains enable row level security;
alter table public.payment_transaction_index enable row level security;
alter table public.admin_users enable row level security;
alter table public.admin_user_store_access enable row level security;
alter table public.admin_invitations enable row level security;
alter table public.app_sessions enable row level security;
alter table public.platform_features enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.plan_features enable row level security;
alter table public.company_subscriptions enable row level security;
alter table public.company_feature_overrides enable row level security;
alter table public.company_usage_counters enable row level security;
alter table public.usage_events enable row level security;
alter table public.onboarding_progress enable row level security;
alter table public.subscription_events enable row level security;
alter table public.audit_logs enable row level security;
