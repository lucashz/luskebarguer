-- Force existing Admin Master sessions through the new second factor.
DELETE FROM "app_sessions"
WHERE "type" = 'admin'
  AND "owner_id" IN (
    SELECT "id"
    FROM "admin_users"
    WHERE "role" = 'superadmin'
  );
