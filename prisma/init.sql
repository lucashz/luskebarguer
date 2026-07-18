-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('onboarding', 'active', 'trial', 'payment_pending', 'grace_period', 'past_due', 'suspended', 'cancelled', 'archived');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('owner', 'manager', 'superadmin', 'admin', 'waiter', 'attendant', 'delivery', 'kitchen');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('new', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "FulfillmentMethod" AS ENUM ('delivery', 'pickup', 'counter', 'table', 'tab');

-- CreateEnum
CREATE TYPE "FinancialStatus" AS ENUM ('pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('pending', 'matched', 'divergent', 'ignored');

-- CreateEnum
CREATE TYPE "TabStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "PromotionDiscountType" AS ENUM ('fixed', 'percent', 'free_delivery');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('admin', 'customer');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trial', 'active', 'payment_pending', 'grace_period', 'past_due', 'blocked', 'cancelled', 'expired', 'suspended');

-- CreateEnum
CREATE TYPE "OverrideType" AS ENUM ('allow', 'block', 'limit');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('debug', 'info', 'warning', 'critical');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "document" TEXT,
    "billing_email" TEXT,
    "phone" TEXT,
    "status" "CompanyStatus" NOT NULL DEFAULT 'trial',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "public_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_domains" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verification_token" TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'::text),
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID,
    "name" TEXT NOT NULL DEFAULT 'Menu da Casa',
    "slug" TEXT NOT NULL DEFAULT 'menu-da-casa',
    "description" TEXT,
    "whatsapp_number" TEXT,
    "address" TEXT,
    "page_title" TEXT,
    "favicon_url" TEXT,
    "logo_url" TEXT,
    "cover_url" TEXT,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "accepts_delivery" BOOLEAN NOT NULL DEFAULT true,
    "accepts_pickup" BOOLEAN NOT NULL DEFAULT true,
    "delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "delivery_neighborhood_fees" JSONB NOT NULL DEFAULT '{}',
    "minimum_order" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payment_methods" TEXT[] DEFAULT ARRAY['Pix', 'Cartao', 'Dinheiro']::TEXT[],
    "business_hours" JSONB NOT NULL DEFAULT '{}',
    "loyalty_program" JSONB NOT NULL DEFAULT '{}',
    "theme_settings" JSONB NOT NULL DEFAULT '{}',
    "print_settings" JSONB NOT NULL DEFAULT '{}',
    "integration_settings" JSONB NOT NULL DEFAULT '{}',
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'admin',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_user_store_access" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'admin',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_user_store_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT,
    "role" "AdminRole" NOT NULL DEFAULT 'attendant',
    "token_hash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "invited_by" UUID,
    "accepted_by" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL DEFAULT (now() + '7 days'::interval),
    "accepted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "birth_date" DATE,
    "password_hash" TEXT,
    "notes" TEXT,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID,
    "customer_id" UUID NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Principal',
    "street" TEXT NOT NULL,
    "postal_code" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "reference" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "image_url" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_modifier_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID,
    "menu_item_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "min_choices" INTEGER NOT NULL DEFAULT 0,
    "max_choices" INTEGER NOT NULL DEFAULT 1,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_modifiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID,
    "group_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_delta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID,
    "public_code" TEXT NOT NULL,
    "customer_id" UUID,
    "status" "OrderStatus" NOT NULL DEFAULT 'new',
    "fulfillment_method" "FulfillmentMethod" NOT NULL DEFAULT 'delivery',
    "payment_method" TEXT NOT NULL,
    "dining_table_id" UUID,
    "customer_tab_id" UUID,
    "table_snapshot" JSONB,
    "tab_snapshot" JSONB,
    "customer_snapshot" JSONB NOT NULL DEFAULT '{}',
    "address_snapshot" JSONB,
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "payment_details" JSONB NOT NULL DEFAULT '{}',
    "financial_status" "FinancialStatus" NOT NULL DEFAULT 'pending',
    "payment_provider" TEXT,
    "payment_transaction_id" TEXT,
    "paid_amount" DECIMAL(10,2),
    "paid_at" TIMESTAMPTZ(6),
    "payment_expires_at" TIMESTAMPTZ(6),
    "refunded_amount" DECIMAL(10,2),
    "refunded_at" TIMESTAMPTZ(6),
    "reconciliation_status" "ReconciliationStatus" NOT NULL DEFAULT 'pending',
    "reconciled_at" TIMESTAMPTZ(6),
    "promotion_code" TEXT,
    "whatsapp_message" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dining_tables" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dining_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_tabs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID,
    "name" TEXT NOT NULL,
    "customer_name" TEXT,
    "dining_table_id" UUID,
    "status" "TabStatus" NOT NULL DEFAULT 'open',
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "payment_method" TEXT,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_tabs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID,
    "order_id" UUID NOT NULL,
    "menu_item_id" UUID,
    "item_snapshot" JSONB NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_print_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID,
    "order_id" UUID,
    "print_type" TEXT NOT NULL,
    "paper_width" TEXT NOT NULL DEFAULT '80',
    "copies" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'attempted',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_print_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_whatsapp_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID,
    "order_id" UUID NOT NULL,
    "order_status" TEXT NOT NULL,
    "recipient_phone" TEXT,
    "message" TEXT NOT NULL,
    "delivery_status" TEXT NOT NULL DEFAULT 'pending',
    "provider" TEXT,
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "is_manual" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_whatsapp_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_payment_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID,
    "order_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "transaction_id" TEXT,
    "financial_status" TEXT NOT NULL,
    "amount" DECIMAL(10,2),
    "raw_payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "promotion_type" TEXT NOT NULL DEFAULT 'general',
    "discount_type" "PromotionDiscountType" NOT NULL DEFAULT 'fixed',
    "discount_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "minimum_order" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "max_uses" INTEGER,
    "max_uses_per_customer" INTEGER NOT NULL DEFAULT 1,
    "allowed_category_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "combo_item_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "recurring_min_orders" INTEGER NOT NULL DEFAULT 2,
    "birthday_window_days" INTEGER NOT NULL DEFAULT 7,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_sessions" (
    "token" TEXT NOT NULL,
    "company_id" UUID,
    "store_id" UUID,
    "type" "SessionType" NOT NULL,
    "owner_id" UUID NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_sessions_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "payment_transaction_index" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "order_id" UUID,
    "order_public_code" TEXT,
    "company_id" UUID,
    "store_id" UUID,
    "financial_status" TEXT NOT NULL DEFAULT 'pending',
    "amount" DECIMAL(10,2),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transaction_index_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_features" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthly_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "annual_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_features" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plan_id" UUID NOT NULL,
    "feature_id" UUID NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "limit_value" INTEGER,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "plan_id" UUID,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'trial',
    "trial_ends_at" TIMESTAMPTZ(6),
    "current_period_starts_at" TIMESTAMPTZ(6),
    "current_period_ends_at" TIMESTAMPTZ(6),
    "next_renewal_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "suspended_at" TIMESTAMPTZ(6),
    "billing_provider" TEXT,
    "external_subscription_id" TEXT,
    "last_payment_at" TIMESTAMPTZ(6),
    "payment_due_at" TIMESTAMPTZ(6),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_feature_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "feature_id" UUID NOT NULL,
    "override_type" "OverrideType" NOT NULL,
    "limit_value" INTEGER,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_feature_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_usage_counters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "feature_id" UUID,
    "usage_key" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "used_value" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "store_id" UUID,
    "feature_id" UUID,
    "usage_key" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "store_id" UUID,
    "current_step" TEXT NOT NULL DEFAULT 'welcome',
    "completed_steps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "subscription_id" UUID,
    "event_type" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payment_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "subscription_id" UUID,
    "plan_id" UUID,
    "provider" TEXT NOT NULL,
    "external_transaction_id" TEXT,
    "external_event_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amount_cents" INTEGER NOT NULL DEFAULT 0,
    "checkout_url" TEXT,
    "raw_payload" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "paid_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID,
    "store_id" UUID,
    "actor_admin_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "severity" "AuditSeverity" NOT NULL DEFAULT 'info',
    "request_id" TEXT,
    "before_data" JSONB,
    "after_data" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_slug_key" ON "stores"("slug");

-- CreateIndex
CREATE INDEX "stores_company_id_is_active_name_idx" ON "stores"("company_id", "is_active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "store_domains_domain_key" ON "store_domains"("domain");

-- CreateIndex
CREATE INDEX "store_domains_store_id_status_created_at_idx" ON "store_domains"("store_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "store_settings_store_id_idx" ON "store_settings"("store_id");

-- CreateIndex
CREATE INDEX "admin_users_email_idx" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_user_store_access_store_id_is_active_role_idx" ON "admin_user_store_access"("store_id", "is_active", "role");

-- CreateIndex
CREATE UNIQUE INDEX "admin_user_store_access_admin_user_id_store_id_key" ON "admin_user_store_access"("admin_user_id", "store_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_invitations_token_hash_key" ON "admin_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "admin_invitations_store_id_status_created_at_idx" ON "admin_invitations"("store_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "customers_store_id_phone_idx" ON "customers"("store_id", "phone");

-- CreateIndex
CREATE INDEX "customer_addresses_store_id_customer_id_is_default_updated__idx" ON "customer_addresses"("store_id", "customer_id", "is_default", "updated_at");

-- CreateIndex
CREATE INDEX "menu_categories_store_id_is_active_sort_order_name_idx" ON "menu_categories"("store_id", "is_active", "sort_order", "name");

-- CreateIndex
CREATE INDEX "menu_items_store_id_category_id_is_available_sort_order_nam_idx" ON "menu_items"("store_id", "category_id", "is_available", "sort_order", "name");

-- CreateIndex
CREATE INDEX "menu_modifier_groups_store_id_menu_item_id_sort_order_idx" ON "menu_modifier_groups"("store_id", "menu_item_id", "sort_order");

-- CreateIndex
CREATE INDEX "menu_modifiers_store_id_group_id_sort_order_idx" ON "menu_modifiers"("store_id", "group_id", "sort_order");

-- CreateIndex
CREATE INDEX "orders_store_id_status_archived_at_created_at_idx" ON "orders"("store_id", "status", "archived_at", "created_at");

-- CreateIndex
CREATE INDEX "orders_store_id_customer_id_created_at_idx" ON "orders"("store_id", "customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "dining_tables_store_id_code_key" ON "dining_tables"("store_id", "code");

-- CreateIndex
CREATE INDEX "dining_tables_store_id_is_active_name_idx" ON "dining_tables"("store_id", "is_active", "name");

-- CreateIndex
CREATE INDEX "customer_tabs_store_id_status_opened_at_idx" ON "customer_tabs"("store_id", "status", "opened_at");

-- CreateIndex
CREATE INDEX "order_items_store_id_order_id_idx" ON "order_items"("store_id", "order_id");

-- CreateIndex
CREATE INDEX "order_print_logs_store_id_order_id_created_at_idx" ON "order_print_logs"("store_id", "order_id", "created_at");

-- CreateIndex
CREATE INDEX "order_whatsapp_logs_store_id_order_id_created_at_idx" ON "order_whatsapp_logs"("store_id", "order_id", "created_at");

-- CreateIndex
CREATE INDEX "order_payment_events_store_id_order_id_created_at_idx" ON "order_payment_events"("store_id", "order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "order_payment_events_provider_provider_event_id_key" ON "order_payment_events"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "promotions_store_id_code_idx" ON "promotions"("store_id", "code");

-- CreateIndex
CREATE INDEX "app_sessions_store_id_type_owner_id_idx" ON "app_sessions"("store_id", "type", "owner_id");

-- CreateIndex
CREATE INDEX "payment_transaction_index_order_public_code_idx" ON "payment_transaction_index"("order_public_code");

-- CreateIndex
CREATE INDEX "payment_transaction_index_store_id_created_at_idx" ON "payment_transaction_index"("store_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transaction_index_provider_transaction_id_key" ON "payment_transaction_index"("provider", "transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_features_code_key" ON "platform_features"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "plan_features_plan_id_feature_id_key" ON "plan_features"("plan_id", "feature_id");

-- CreateIndex
CREATE INDEX "company_subscriptions_company_id_status_created_at_idx" ON "company_subscriptions"("company_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "company_feature_overrides_company_id_feature_id_ends_at_idx" ON "company_feature_overrides"("company_id", "feature_id", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "company_usage_counters_company_id_usage_key_period_start_pe_key" ON "company_usage_counters"("company_id", "usage_key", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "usage_events_company_id_usage_key_created_at_idx" ON "usage_events"("company_id", "usage_key", "created_at");

-- CreateIndex
CREATE INDEX "usage_events_store_id_usage_key_created_at_idx" ON "usage_events"("store_id", "usage_key", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_progress_company_id_store_id_key" ON "onboarding_progress"("company_id", "store_id");

-- CreateIndex
CREATE INDEX "subscription_events_company_id_created_at_idx" ON "subscription_events"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "subscription_payment_transactions_company_id_created_at_idx" ON "subscription_payment_transactions"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "subscription_payment_transactions_subscription_id_created_at_idx" ON "subscription_payment_transactions"("subscription_id", "created_at");

-- CreateIndex
CREATE INDEX "subscription_payment_transactions_provider_status_created_at_idx" ON "subscription_payment_transactions"("provider", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payment_transactions_provider_external_transaction_id_key" ON "subscription_payment_transactions"("provider", "external_transaction_id") WHERE "external_transaction_id" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payment_transactions_provider_external_event_id_key" ON "subscription_payment_transactions"("provider", "external_event_id") WHERE "external_event_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "audit_logs_company_id_created_at_idx" ON "audit_logs"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_store_id_created_at_idx" ON "audit_logs"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_admin_id_created_at_idx" ON "audit_logs"("actor_admin_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_domains" ADD CONSTRAINT "store_domains_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_store_access" ADD CONSTRAINT "admin_user_store_access_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_store_access" ADD CONSTRAINT "admin_user_store_access_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_store_access" ADD CONSTRAINT "admin_user_store_access_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_invitations" ADD CONSTRAINT "admin_invitations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_invitations" ADD CONSTRAINT "admin_invitations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_invitations" ADD CONSTRAINT "admin_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_invitations" ADD CONSTRAINT "admin_invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_modifier_groups" ADD CONSTRAINT "menu_modifier_groups_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_modifier_groups" ADD CONSTRAINT "menu_modifier_groups_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_modifiers" ADD CONSTRAINT "menu_modifiers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_modifiers" ADD CONSTRAINT "menu_modifiers_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "menu_modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_dining_table_id_fkey" FOREIGN KEY ("dining_table_id") REFERENCES "dining_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_tab_id_fkey" FOREIGN KEY ("customer_tab_id") REFERENCES "customer_tabs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_tabs" ADD CONSTRAINT "customer_tabs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_tabs" ADD CONSTRAINT "customer_tabs_dining_table_id_fkey" FOREIGN KEY ("dining_table_id") REFERENCES "dining_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_print_logs" ADD CONSTRAINT "order_print_logs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_print_logs" ADD CONSTRAINT "order_print_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_whatsapp_logs" ADD CONSTRAINT "order_whatsapp_logs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_whatsapp_logs" ADD CONSTRAINT "order_whatsapp_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payment_events" ADD CONSTRAINT "order_payment_events_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payment_events" ADD CONSTRAINT "order_payment_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_sessions" ADD CONSTRAINT "app_sessions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_sessions" ADD CONSTRAINT "app_sessions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "platform_features"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_subscriptions" ADD CONSTRAINT "company_subscriptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_subscriptions" ADD CONSTRAINT "company_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_feature_overrides" ADD CONSTRAINT "company_feature_overrides_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_feature_overrides" ADD CONSTRAINT "company_feature_overrides_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "platform_features"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_feature_overrides" ADD CONSTRAINT "company_feature_overrides_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_usage_counters" ADD CONSTRAINT "company_usage_counters_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_usage_counters" ADD CONSTRAINT "company_usage_counters_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "platform_features"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "platform_features"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "company_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payment_transactions" ADD CONSTRAINT "subscription_payment_transactions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payment_transactions" ADD CONSTRAINT "subscription_payment_transactions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "company_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payment_transactions" ADD CONSTRAINT "subscription_payment_transactions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_admin_id_fkey" FOREIGN KEY ("actor_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
