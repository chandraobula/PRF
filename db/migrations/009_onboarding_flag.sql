-- Track whether a user has completed onboarding.
-- Set to 1 at successful account creation. Once true, never shown again.
-- For existing users, set it to 1 since they implicitly completed onboarding
-- by using the system before this feature existed.
ALTER TABLE users ADD COLUMN has_completed_onboarding INTEGER NOT NULL DEFAULT 1;
