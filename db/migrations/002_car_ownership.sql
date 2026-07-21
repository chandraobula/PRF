-- CarOS ownership fields (Phase): value + insurance / registration / warranty tracking.
-- Apply locally with:
--   node scripts/wrangler-local.mjs d1 execute DB --local --persist-to .wrangler/state --file=db/migrations/002_car_ownership.sql --yes

ALTER TABLE vehicles ADD COLUMN purchase_price_minor INTEGER;
ALTER TABLE vehicles ADD COLUMN current_value_minor INTEGER;
ALTER TABLE vehicles ADD COLUMN insurance_provider TEXT;
ALTER TABLE vehicles ADD COLUMN policy_number TEXT;
ALTER TABLE vehicles ADD COLUMN insurance_expires_on TEXT;
ALTER TABLE vehicles ADD COLUMN registration_expires_on TEXT;
ALTER TABLE vehicles ADD COLUMN warranty_expires_on TEXT;
