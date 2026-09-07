-- Composite and partial indexes for the Finance Hub's most frequent reads.
-- The partial transaction index stays small by excluding soft-deleted rows.
CREATE INDEX IF NOT EXISTS idx_finance_transactions_active_currency_date
  ON finance_transactions (user_id, currency, occurred_on DESC, created_at DESC)
  WHERE status != 'deleted';

CREATE INDEX IF NOT EXISTS idx_finance_accounts_user_currency_active
  ON finance_accounts (user_id, currency, is_archived, created_at);

CREATE INDEX IF NOT EXISTS idx_finance_categories_user_type_name
  ON finance_categories (user_id, type, name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_finance_budgets_user_currency_period
  ON finance_budgets (user_id, currency, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_finance_goals_user_currency_status
  ON finance_goals (user_id, currency, status, target_date);

CREATE INDEX IF NOT EXISTS idx_finance_liabilities_user_currency_status
  ON finance_liabilities (user_id, currency, status, next_payment_on);
