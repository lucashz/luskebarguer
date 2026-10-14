UPDATE "assisted_registrations"
SET "status" = 'ready_for_preview'::"AssistedRegistrationStatus"
WHERE "status" = 'ready_to_publish'::"AssistedRegistrationStatus";
