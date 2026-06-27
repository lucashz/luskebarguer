create extension if not exists "pgcrypto";

create table if not exists public.store_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Menu da Casa',
  slug text not null default 'menu-da-casa',
  description text,
  whatsapp_number text,
  address text,
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
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_settings
  add column if not exists business_hours jsonb not null default '{}'::jsonb,
  add column if not exists delivery_neighborhood_fees jsonb not null default '{}'::jsonb,
  add column if not exists loyalty_program jsonb not null default '{}'::jsonb,
  add column if not exists theme_settings jsonb not null default '{}'::jsonb,
  add column if not exists print_settings jsonb not null default '{}'::jsonb,
  add column if not exists onboarding_completed boolean not null default false;

create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
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

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  password_hash text not null,
  role text not null default 'admin' check (role in ('owner', 'manager', 'admin', 'waiter', 'kitchen')),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_users
  alter column role set default 'admin',
  drop constraint if exists admin_users_role_check,
  add constraint admin_users_role_check check (role in ('owner', 'manager', 'admin', 'waiter', 'kitchen'));

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
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
  add column if not exists password_hash text,
  add column if not exists last_login_at timestamptz,
  add column if not exists birth_date date;

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
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
  add column if not exists postal_code text;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
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
  promotion_code text,
  whatsapp_message text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists archived_at timestamptz,
  add column if not exists promotion_code text,
  add column if not exists payment_details jsonb not null default '{}'::jsonb,
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

create table if not exists public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_tabs (
  id uuid primary key default gen_random_uuid(),
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
  add column if not exists payment_method text,
  add column if not exists discount numeric(10, 2) not null default 0,
  add column if not exists total numeric(10, 2) not null default 0;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  item_snapshot jsonb not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10, 2) not null,
  total numeric(10, 2) not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_print_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  print_type text not null check (print_type in ('kitchen', 'customer', 'both')),
  paper_width text not null default '80' check (paper_width in ('58', '80')),
  copies integer not null default 1,
  reason text not null default 'manual' check (reason in ('manual', 'auto', 'retry', 'preview')),
  status text not null default 'attempted' check (status in ('attempted', 'blocked', 'completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.menu_modifier_groups (
  id uuid primary key default gen_random_uuid(),
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
  add column if not exists description text;

create table if not exists public.menu_modifiers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.menu_modifier_groups(id) on delete cascade,
  name text not null,
  price_delta numeric(10, 2) not null default 0,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
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
  add column if not exists promotion_type text not null default 'general',
  add column if not exists max_uses_per_customer integer not null default 1,
  add column if not exists allowed_category_ids uuid[] not null default '{}',
  add column if not exists combo_item_ids uuid[] not null default '{}',
  add column if not exists recurring_min_orders integer not null default 2,
  add column if not exists birthday_window_days integer not null default 7;

create table if not exists public.app_sessions (
  token text primary key,
  type text not null check (type in ('admin', 'customer')),
  owner_id uuid not null,
  data jsonb not null default '{}',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customers_phone_unique_idx on public.customers (phone);
create unique index if not exists admin_users_email_unique_idx on public.admin_users (email);
create unique index if not exists orders_public_code_unique_idx on public.orders (public_code);

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

alter table public.store_settings enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.admin_users enable row level security;
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_print_logs enable row level security;
alter table public.menu_modifier_groups enable row level security;
alter table public.menu_modifiers enable row level security;
alter table public.promotions enable row level security;
alter table public.app_sessions enable row level security;

drop policy if exists "Public can read store settings" on public.store_settings;
create policy "Public can read store settings"
on public.store_settings
for select
using (true);

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

insert into public.store_settings (
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
  'Menu da Casa',
  'menu-da-casa',
  'Pedido rapido pelo cardapio digital.',
  '5511999999999',
  'Rua Exemplo, 100',
  5.00,
  20.00,
  array['Pix', 'Cartao na entrega', 'Dinheiro']
where not exists (select 1 from public.store_settings);

insert into public.menu_categories (name, description, sort_order)
select 'Entradas', 'Para abrir o apetite.', 10
where not exists (select 1 from public.menu_categories where name = 'Entradas');

insert into public.menu_categories (name, description, sort_order)
select 'Pratos', 'Receitas principais da casa.', 20
where not exists (select 1 from public.menu_categories where name = 'Pratos');

insert into public.menu_categories (name, description, sort_order)
select 'Hamburgueres', 'Burgers artesanais com pao macio, queijo e molhos da casa.', 25
where not exists (select 1 from public.menu_categories where name = 'Hamburgueres');

insert into public.menu_categories (name, description, sort_order)
select 'Bebidas', 'Geladas, quentes e especiais.', 30
where not exists (select 1 from public.menu_categories where name = 'Bebidas');

insert into public.menu_items (category_id, name, description, price, image_url, tags, is_featured, sort_order)
select
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

insert into public.menu_items (category_id, name, description, price, image_url, tags, is_featured, sort_order)
select
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

insert into public.menu_items (category_id, name, description, price, image_url, tags, is_featured, sort_order)
select
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

insert into public.menu_items (category_id, name, description, price, image_url, tags, is_featured, sort_order)
select
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

insert into public.menu_items (category_id, name, description, price, image_url, tags, is_featured, sort_order)
select
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

insert into public.menu_items (category_id, name, description, price, image_url, tags, is_featured, sort_order)
select
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

insert into public.menu_items (category_id, name, description, price, image_url, tags, is_featured, sort_order)
select
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
