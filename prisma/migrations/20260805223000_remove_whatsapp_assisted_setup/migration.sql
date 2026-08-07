UPDATE "plan_addons"
SET "is_active" = false,
    "updated_at" = now()
WHERE "code" = 'whatsapp_setup_assisted';
