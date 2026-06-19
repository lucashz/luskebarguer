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
  minimum_order numeric(10, 2) not null default 0,
  payment_methods text[] not null default array['Pix', 'Cartao', 'Dinheiro'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  role text not null default 'manager' check (role in ('owner', 'manager')),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  password_hash text,
  notes text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers
  add column if not exists password_hash text,
  add column if not exists last_login_at timestamptz;

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text not null default 'Principal',
  street text not null,
  number text,
  complement text,
  neighborhood text,
  city text,
  reference text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  fulfillment_method text not null default 'delivery' check (fulfillment_method in ('delivery', 'pickup')),
  payment_method text not null,
  customer_snapshot jsonb not null default '{}',
  address_snapshot jsonb,
  subtotal numeric(10, 2) not null default 0,
  delivery_fee numeric(10, 2) not null default 0,
  discount numeric(10, 2) not null default 0,
  total numeric(10, 2) not null default 0,
  notes text,
  whatsapp_message text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists archived_at timestamptz;

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

create table if not exists public.menu_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  name text not null,
  min_choices integer not null default 0,
  max_choices integer not null default 1,
  is_required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
alter table public.menu_modifier_groups enable row level security;
alter table public.menu_modifiers enable row level security;
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
