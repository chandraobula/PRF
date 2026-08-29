-- Per-user default currency that actually sticks.
--
-- user_preferences.currency already existed but was seeded 'INR' for everyone,
-- so a US user had to switch the Finance Hub to USD on every visit. This adds
-- the flag that tells apart "nobody has ever picked one" from "the user picked
-- this", which is what lets first login auto-detect from the browser's timezone
-- without ever overwriting a deliberate choice.
--
--   default  — untouched seed value, safe to auto-detect over
--   detected — set from the browser's timezone/locale on first login
--   manual   — the user chose it in Settings; auto-detect never touches it again
--
-- Apply locally with:
--   node scripts/wrangler-local.mjs d1 execute DB --local --persist-to .wrangler/state --file=db/migrations/012_currency_preference.sql --yes
-- Apply to production with:
--   npx wrangler d1 execute DB --remote --file=db/migrations/012_currency_preference.sql

ALTER TABLE user_preferences ADD COLUMN currency_source TEXT NOT NULL DEFAULT 'default';

-- Existing users are excluded from auto-detection on purpose. The finance
-- stack is currency-scoped (the summary defaults to finance_profiles.currency
-- and every query filters on it), so flipping someone who already has INR
-- records over to USD would show them an empty Finance Hub until they toggled
-- back — data intact, but alarming. Anyone with real finance data keeps
-- exactly what they have today and can change it in Settings whenever they
-- want; only genuinely empty accounts, which have nothing to hide, and
-- accounts created after this deploy get detection.
UPDATE user_preferences
SET currency_source = 'manual'
WHERE user_id IN (SELECT user_id FROM finance_transactions)
   OR user_id IN (SELECT user_id FROM finance_receipts)
   OR user_id IN (SELECT user_id FROM finance_budgets)
   OR user_id IN (SELECT user_id FROM finance_goals);
