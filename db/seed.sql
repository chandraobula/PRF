INSERT OR IGNORE INTO users (id, email, display_name)
VALUES ('demo-user', 'demo@lifeos.local', 'Demo User');

INSERT OR IGNORE INTO finance_profiles (user_id, currency, secondary_currency, enabled_currencies_json, date_format, month_start_day, dashboard_widgets_json)
VALUES (
  'demo-user',
  'USD',
  'INR',
  '["USD","INR"]',
  'YYYY-MM-DD',
  1,
  '["cash_flow","budgets","goals","insights","recent_transactions"]'
);

INSERT OR IGNORE INTO finance_categories (id, user_id, name, type, color, icon, sort_order, is_system)
VALUES
  ('cat-income-salary', 'demo-user', 'Salary', 'income', '#22C55E', 'BriefcaseBusiness', 10, 1),
  ('cat-income-freelance', 'demo-user', 'Freelance', 'income', '#14B8A6', 'Laptop', 20, 1),
  ('cat-income-interest', 'demo-user', 'Interest', 'income', '#0EA5E9', 'Percent', 30, 1),
  ('cat-exp-food', 'demo-user', 'Food', 'expense', '#F59E0B', 'Utensils', 10, 1),
  ('cat-exp-shopping', 'demo-user', 'Shopping', 'expense', '#A855F7', 'ShoppingBag', 20, 1),
  ('cat-exp-travel', 'demo-user', 'Travel', 'expense', '#06B6D4', 'Plane', 30, 1),
  ('cat-exp-fuel', 'demo-user', 'Fuel', 'expense', '#EF4444', 'Fuel', 40, 1),
  ('cat-exp-health', 'demo-user', 'Health', 'expense', '#10B981', 'HeartPulse', 50, 1),
  ('cat-exp-entertainment', 'demo-user', 'Entertainment', 'expense', '#6366F1', 'Clapperboard', 60, 1),
  ('cat-exp-education', 'demo-user', 'Education', 'expense', '#2563EB', 'GraduationCap', 70, 1),
  ('cat-exp-utilities', 'demo-user', 'Utilities', 'expense', '#64748B', 'Plug', 80, 1),
  ('cat-exp-rent', 'demo-user', 'Rent', 'expense', '#334155', 'Home', 90, 1),
  ('cat-exp-family', 'demo-user', 'Family', 'expense', '#EC4899', 'Users', 100, 1),
  ('cat-exp-pets', 'demo-user', 'Pets', 'expense', '#84CC16', 'PawPrint', 110, 1),
  ('cat-exp-taxes', 'demo-user', 'Taxes', 'expense', '#991B1B', 'ReceiptText', 120, 1),
  ('cat-exp-charity', 'demo-user', 'Charity', 'expense', '#16A34A', 'HandHeart', 130, 1),
  ('cat-exp-care', 'demo-user', 'Personal Care', 'expense', '#DB2777', 'Sparkles', 140, 1),
  ('cat-exp-misc', 'demo-user', 'Miscellaneous', 'expense', '#475569', 'Circle', 150, 1),
  ('cat-transfer', 'demo-user', 'Transfer', 'transfer', '#0058be', 'Repeat2', 10, 1);

INSERT OR IGNORE INTO finance_accounts (id, user_id, name, type, currency, opening_balance_minor, current_balance_minor, institution)
VALUES
  ('acct-checking', 'demo-user', 'Main Checking', 'bank', 'USD', 1850000, 2456200, 'LifeOS Demo Bank'),
  ('acct-inr-wallet', 'demo-user', 'India Wallet', 'wallet', 'INR', 12500000, 18425000, 'LifeOS Demo Bank'),
  ('acct-cash', 'demo-user', 'Cash Wallet', 'cash', 'USD', 30000, 18500, NULL),
  ('acct-card', 'demo-user', 'Everyday Card', 'credit_card', 'USD', 0, -132400, 'Demo Credit');

UPDATE finance_profiles
SET default_account_id = 'acct-checking'
WHERE user_id = 'demo-user' AND default_account_id IS NULL;

INSERT OR IGNORE INTO finance_transactions (
  id,
  user_id,
  account_id,
  category_id,
  type,
  occurred_on,
  amount_minor,
  currency,
  merchant,
  payee,
  payment_method,
  notes,
  tags_json,
  source
)
VALUES
  ('tx-salary-july', 'demo-user', 'acct-checking', 'cat-income-salary', 'income', '2026-07-01', 420000, 'USD', 'TechCorp Salary', 'TechCorp', 'bank_transfer', 'Monthly salary', '["salary","recurring"]', 'manual'),
  ('tx-freelance-july', 'demo-user', 'acct-checking', 'cat-income-freelance', 'income', '2026-07-09', 65000, 'USD', 'Studio Project', 'Northstar Studio', 'bank_transfer', 'One-time freelance project', '["freelance"]', 'manual'),
  ('tx-rent-july', 'demo-user', 'acct-checking', 'cat-exp-rent', 'expense', '2026-07-02', 145000, 'USD', 'Apartment Rent', 'Lakeview Homes', 'bank_transfer', 'July rent', '["fixed","housing"]', 'recurring'),
  ('tx-whole-foods', 'demo-user', 'acct-card', 'cat-exp-food', 'expense', '2026-07-04', 12450, 'USD', 'Whole Foods Market', 'Whole Foods Market', 'credit_card', 'Weekly groceries', '["groceries"]', 'receipt'),
  ('tx-shell', 'demo-user', 'acct-card', 'cat-exp-fuel', 'expense', '2026-07-06', 4500, 'USD', 'Shell Gas Station', 'Shell', 'credit_card', 'Fuel refill', '["car"]', 'manual'),
  ('tx-netflix', 'demo-user', 'acct-card', 'cat-exp-entertainment', 'expense', '2026-07-08', 1599, 'USD', 'Netflix', 'Netflix', 'credit_card', 'Streaming subscription', '["subscription"]', 'recurring'),
  ('tx-utilities', 'demo-user', 'acct-checking', 'cat-exp-utilities', 'expense', '2026-07-10', 13280, 'USD', 'City Utilities', 'City Utilities', 'bank_transfer', 'Electric and water', '["utility"]', 'manual'),
  ('tx-starbucks', 'demo-user', 'acct-card', 'cat-exp-food', 'expense', '2026-07-12', 650, 'USD', 'Starbucks', 'Starbucks', 'credit_card', 'Coffee between meetings', '["dining"]', 'manual'),
  ('tx-course', 'demo-user', 'acct-card', 'cat-exp-education', 'expense', '2026-07-14', 4900, 'USD', 'Design Systems Course', 'LearnHub', 'credit_card', 'Professional learning', '["learning"]', 'manual'),
  ('tx-refund', 'demo-user', 'acct-card', 'cat-exp-shopping', 'refund', '2026-07-15', 2999, 'USD', 'Amazon Refund', 'Amazon', 'credit_card', 'Returned keyboard', '["refund"]', 'manual'),
  ('tx-inr-salary', 'demo-user', 'acct-inr-wallet', 'cat-income-salary', 'income', '2026-07-01', 25000000, 'INR', 'India Salary', 'India Salary', 'bank_transfer', 'Monthly INR salary', '["salary","india"]', 'manual'),
  ('tx-inr-rent', 'demo-user', 'acct-inr-wallet', 'cat-exp-rent', 'expense', '2026-07-02', 6500000, 'INR', 'Bengaluru Rent', 'Bengaluru Rent', 'upi', 'July rent', '["housing","india"]', 'recurring'),
  ('tx-inr-groceries', 'demo-user', 'acct-inr-wallet', 'cat-exp-food', 'expense', '2026-07-06', 524000, 'INR', 'BigBasket', 'BigBasket', 'upi', 'Weekly groceries', '["groceries","india"]', 'manual'),
  ('tx-inr-utilities', 'demo-user', 'acct-inr-wallet', 'cat-exp-utilities', 'expense', '2026-07-10', 385000, 'INR', 'BESCOM', 'BESCOM', 'upi', 'Electricity bill', '["utility","india"]', 'manual');

INSERT OR IGNORE INTO finance_budgets (
  id,
  user_id,
  category_id,
  name,
  period,
  period_start,
  period_end,
  currency,
  limit_minor,
  carry_forward_minor,
  alert_threshold_percent,
  is_flexible
)
VALUES
  ('budget-food-july', 'demo-user', 'cat-exp-food', 'Food budget', 'monthly', '2026-07-01', '2026-07-31', 'USD', 65000, 5000, 80, 1),
  ('budget-shopping-july', 'demo-user', 'cat-exp-shopping', 'Shopping budget', 'monthly', '2026-07-01', '2026-07-31', 'USD', 30000, 0, 75, 1),
  ('budget-entertainment-july', 'demo-user', 'cat-exp-entertainment', 'Entertainment budget', 'monthly', '2026-07-01', '2026-07-31', 'USD', 22000, 0, 80, 0),
  ('budget-utilities-july', 'demo-user', 'cat-exp-utilities', 'Utilities budget', 'monthly', '2026-07-01', '2026-07-31', 'USD', 18000, 0, 85, 0),
  ('budget-inr-food-july', 'demo-user', 'cat-exp-food', 'INR food budget', 'monthly', '2026-07-01', '2026-07-31', 'INR', 1800000, 0, 80, 1),
  ('budget-inr-rent-july', 'demo-user', 'cat-exp-rent', 'INR rent budget', 'monthly', '2026-07-01', '2026-07-31', 'INR', 7000000, 0, 90, 0),
  ('budget-inr-utilities-july', 'demo-user', 'cat-exp-utilities', 'INR utilities budget', 'monthly', '2026-07-01', '2026-07-31', 'INR', 500000, 0, 85, 0);

INSERT OR IGNORE INTO finance_goals (
  id,
  user_id,
  name,
  goal_type,
  target_amount_minor,
  saved_amount_minor,
  currency,
  target_date,
  priority,
  recommendation
)
VALUES
  ('goal-emergency-fund', 'demo-user', 'Emergency fund', 'emergency_fund', 1200000, 685000, 'USD', '2026-12-31', 1, 'Add 858 dollars each month to finish this by year end.'),
  ('goal-vacation', 'demo-user', 'Japan trip', 'vacation', 450000, 172500, 'USD', '2027-04-15', 3, 'Skipping two delivery meals each week keeps this goal on schedule.'),
  ('goal-vehicle', 'demo-user', 'Vehicle upgrade', 'vehicle', 900000, 210000, 'USD', '2027-10-01', 4, 'Move card cashback into this goal monthly.'),
  ('goal-inr-emergency', 'demo-user', 'INR emergency reserve', 'emergency_fund', 90000000, 42000000, 'INR', '2026-12-31', 2, 'Save 80000 rupees monthly to stay on track.');

INSERT OR IGNORE INTO finance_goal_milestones (id, goal_id, name, target_amount_minor, completed_at)
VALUES
  ('milestone-emergency-25', 'goal-emergency-fund', '25 percent saved', 300000, '2026-06-08'),
  ('milestone-emergency-50', 'goal-emergency-fund', '50 percent saved', 600000, '2026-07-11'),
  ('milestone-vacation-25', 'goal-vacation', 'Flights reserve', 112500, '2026-07-03');

INSERT OR IGNORE INTO finance_ai_insights (
  id,
  user_id,
  insight_type,
  title,
  body,
  severity,
  action_label,
  action_url,
  related_entity_type,
  related_entity_id
)
VALUES
  ('insight-food-july', 'demo-user', 'recommendation', 'Food spending is pacing well', 'You have used 20 percent of the food budget halfway through the month. Keep groceries planned and dining out stays easy to absorb.', 'positive', 'Review food budget', '/finance', 'budget', 'budget-food-july'),
  ('insight-subscription-july', 'demo-user', 'subscription', 'One subscription renews soon', 'Netflix renewed this month. If it is unused, canceling it adds 16 dollars back into your monthly plan.', 'info', 'View transaction', '/finance', 'transaction', 'tx-netflix'),
  ('insight-utilities-july', 'demo-user', 'anomaly', 'Utilities are up this month', 'Your utility bill is trending 18 percent above the previous month. Check whether this is seasonal before changing the budget.', 'warning', 'Compare utilities', '/finance', 'category', 'cat-exp-utilities');

INSERT OR IGNORE INTO finance_habits (id, user_id, habit_type, name, current_streak, best_streak, last_completed_on, cadence)
VALUES
  ('habit-daily-checkin', 'demo-user', 'daily_check_in', 'Daily money check-in', 6, 11, '2026-07-18', 'daily'),
  ('habit-weekly-review', 'demo-user', 'weekly_review', 'Weekly finance review', 3, 5, '2026-07-12', 'weekly');

INSERT OR IGNORE INTO finance_notifications (
  id,
  user_id,
  notification_type,
  title,
  body,
  due_at,
  status
)
VALUES
  ('notice-budget-food', 'demo-user', 'budget_limit', 'Food budget is healthy', 'You are safely under your alert threshold.', '2026-07-20T09:00:00Z', 'pending'),
  ('notice-weekly-review', 'demo-user', 'weekly_summary', 'Weekly review due', 'Review your cash flow and goals this weekend.', '2026-07-19T09:00:00Z', 'pending');

INSERT OR IGNORE INTO finance_liabilities (
  id,
  user_id,
  name,
  provider,
  liability_type,
  currency,
  original_amount_minor,
  paid_amount_minor,
  apr_percent,
  monthly_payment_minor,
  next_payment_on
)
VALUES
  ('liability-education', 'demo-user', 'Education Loan', 'Sallie Mae', 'loan', 'USD', 4500000, 1250000, 4.5, 45000, '2026-08-01'),
  ('liability-car', 'demo-user', 'Car Finance', 'Chase Auto', 'loan', 'USD', 2800000, 840000, 6.2, 51200, '2026-08-05'),
  ('liability-card', 'demo-user', 'Credit Card', 'Amex Platinum', 'credit_card', 'USD', 540000, 210000, 22.4, 15000, '2026-08-10');

INSERT OR IGNORE INTO finance_reports (
  id,
  user_id,
  report_type,
  period_start,
  period_end,
  title,
  payload_json
)
VALUES (
  'report-july-preview',
  'demo-user',
  'monthly',
  '2026-07-01',
  '2026-07-31',
  'July finance preview',
  '{"focus":"Keep recurring expenses predictable and protect the emergency fund contribution."}'
);
