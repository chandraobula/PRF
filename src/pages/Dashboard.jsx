import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Car, Coffee, Plus, Sparkles, WalletCards,
  CalendarDays, AlertCircle, TrendingUp, TrendingDown,
  Utensils, Loader2
} from 'lucide-react';
import { getCurrentAccount } from '../services/authApi';
import { getFinanceDashboard, formatMoney } from '../services/financeApi';
import { getCarSummary } from '../services/carApi';
import { getPantrySummary } from '../services/pantryApi';
import { getMealPlan } from '../services/mealPlanApi';
import ContextBar from '../components/ContextBar';

const quickActions = [
  { label: 'Log expense', icon: WalletCards, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300', path: '/finance' },
  { label: 'My car', icon: Car, color: 'bg-violet-500/10 text-violet-600 dark:text-violet-300', path: '/car' },
  { label: 'Pantry', icon: Coffee, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-300', path: '/pantry' },
  { label: 'Ask LifeOS', icon: Sparkles, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-300', path: '/ai-assistant' },
];

export default function Dashboard() {
  const [currentUser, setCurrentUser] = useState(null);
  const [finance, setFinance] = useState(null);
  const [car, setCar] = useState(null);
  const [pantry, setPantry] = useState(null);
  const [meals, setMeals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadAll() {
      setIsLoading(true);
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      
      const [authRes, finRes, carRes, panRes, mealRes] = await Promise.allSettled([
        getCurrentAccount(),
        getFinanceDashboard(),
        getCarSummary(),
        getPantrySummary(),
        getMealPlan(todayStr, todayStr)
      ]);

      if (!active) return;
      if (authRes.status === 'fulfilled' && authRes.value?.user) setCurrentUser(authRes.value.user);
      if (finRes.status === 'fulfilled') setFinance(finRes.value || null);
      if (carRes.status === 'fulfilled') setCar(carRes.value || null);
      if (panRes.status === 'fulfilled') setPantry(panRes.value || null);
      if (mealRes.status === 'fulfilled') setMeals(mealRes.value?.entries || []);
      setIsLoading(false);
    }
    loadAll();
    return () => { active = false; };
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = currentUser?.displayName?.split(' ')[0] || 'there';

  const financeSummary = finance?.summary || {};
  const currency = financeSummary.currency || 'USD';
  const recentTx = finance?.recentTransactions || [];
  const vehicles = car?.vehicles || [];
  const activeVehicle = vehicles.find(v => v.id === car?.activeVehicle?.id) || car?.activeVehicle || vehicles[0];

  const isCredit = (type) => type === 'income' || type === 'refund';

  return (
    <div className="dashboard max-w-[1180px] mx-auto space-y-6 lg:space-y-8">
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-secondary mb-1">{greeting}, {name}</p>
          <h2 className="font-display text-[30px] sm:text-4xl font-bold tracking-[-0.04em] text-on-surface leading-tight">Here’s your day.</h2>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <ContextBar />
        </div>
      </section>

      <section className="focus-card relative overflow-hidden rounded-[24px] bg-primary text-white p-5 sm:p-7 shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
        <div className="absolute -right-16 -top-20 w-56 h-56 rounded-full bg-blue-500/30 blur-2xl" />
        <div className="absolute right-16 -bottom-28 w-52 h-52 rounded-full bg-teal-400/20 blur-2xl" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <span className="inline-flex items-center gap-2 text-xs font-bold tracking-wide uppercase text-white/70"><Sparkles className="w-4 h-4" /> Live System Status</span>
            <span className="px-2.5 py-1 rounded-full bg-white/10 text-xs font-semibold">
              {isLoading ? 'Syncing APIs...' : 'Connected to APIs'}
            </span>
          </div>
          <div className="sm:flex sm:items-end sm:justify-between sm:gap-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 flex-1 min-w-0">
              <div className="min-w-0">
                <p className="text-[13px] text-white/65 mb-1">Financial Net Cash Flow</p>
                <h3 className="font-display text-2xl sm:text-3xl font-bold tracking-tight truncate">
                  {isLoading ? '...' : formatMoney(financeSummary.netCashflowMinor || 0, currency)}
                </h3>
                <p className="text-sm text-white/65 mt-1 truncate">
                  {isLoading ? 'Loading finance data...' : `${financeSummary.transactionCount || 0} transactions tracked this month`}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[13px] text-white/65 mb-1">Active Vehicle Status</p>
                <h3 className="font-display text-2xl sm:text-3xl font-bold tracking-tight truncate">
                  {isLoading ? '...' : activeVehicle ? `${activeVehicle.make || ''} ${activeVehicle.model || 'Vehicle'}` : 'No Vehicle'}
                </h3>
                <p className="text-sm text-white/65 mt-1 truncate">
                  {isLoading ? 'Loading vehicle data...' : activeVehicle ? `Status: ${activeVehicle.status || 'parked'} · ${activeVehicle.odometerMiles || 0} mi` : 'Add your car in Car Hub'}
                </p>
              </div>
            </div>
            <Link to="/finance" className="mt-5 sm:mt-0 shrink-0 min-h-12 inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-surface-card text-primary text-sm font-bold hover:bg-surface-card/90 active:scale-[.98] transition-all">
              Open Finance <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="quick-actions-title">
        <div className="flex items-center justify-between mb-3"><h3 id="quick-actions-title" className="section-title">Quick actions</h3></div>
        <div className="grid grid-cols-4 gap-2 sm:gap-4">
          {quickActions.map(({ label, icon: Icon, color, path }) => <Link key={label} to={path} className="quick-action group min-w-0"><span className={`quick-action-icon ${color}`}><Icon className="w-5 h-5" /></span><span className="text-xs sm:text-sm font-semibold text-on-surface text-center leading-tight">{label}</span></Link>)}
        </div>
      </section>

      <section aria-labelledby="overview-title">
        <div className="flex items-center justify-between mb-3"><h3 id="overview-title" className="section-title">At a glance</h3></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <article className="metric-card">
            <div className="metric-icon bg-blue-500/10 text-blue-600 dark:text-blue-300"><WalletCards className="w-5 h-5" /></div>
            <p className="metric-label">Monthly Expenses</p>
            <p className="metric-value">{isLoading ? '—' : formatMoney(financeSummary.expenseMinor || 0, currency)}</p>
            <p className="metric-caption">{isLoading ? '...' : `${financeSummary.transactionCount || 0} total records`}</p>
          </article>
          <article className="metric-card">
            <div className="metric-icon bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"><Car className="w-5 h-5" /></div>
            <p className="metric-label">My Vehicles</p>
            <p className="metric-value">{isLoading ? '—' : `${vehicles.length} Registered`}</p>
            <p className="metric-caption truncate">{isLoading ? '...' : activeVehicle ? `${activeVehicle.make} ${activeVehicle.model}` : 'No active vehicle'}</p>
          </article>
          <article className="metric-card">
            <div className="metric-icon bg-violet-500/10 text-violet-600 dark:text-violet-300"><Coffee className="w-5 h-5" /></div>
            <p className="metric-label">Pantry Stock</p>
            <p className="metric-value">{isLoading ? '—' : `${pantry?.itemCount || 0} Items`}</p>
            <p className="metric-caption text-amber-600 dark:text-amber-400">{isLoading ? '...' : `${pantry?.lowStockCount || 0} low stock alerts`}</p>
          </article>
          <article className="metric-card">
            <div className="metric-icon bg-amber-500/10 text-amber-600 dark:text-amber-300"><CalendarDays className="w-5 h-5" /></div>
            <p className="metric-label">Today's Meals</p>
            <p className="metric-value">{isLoading ? '—' : `${meals.length} Planned`}</p>
            <p className="metric-caption truncate">{isLoading ? '...' : meals.length > 0 ? `Next: ${meals[0].mealSlot}` : 'No meals planned today'}</p>
          </article>
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="app-card p-4 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-title">Recent Transactions</h3>
              <Link to="/finance" className="text-sm font-semibold text-secondary hover:underline">View all</Link>
            </div>
            {isLoading ? (
              <div className="py-8 flex items-center justify-center text-text-muted gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading transactions...</div>
            ) : recentTx.length > 0 ? (
              <div className="divide-y divide-border-subtle">
                {recentTx.slice(0, 4).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isCredit(tx.type) ? 'bg-success-proactive/10 text-success-proactive' : 'bg-surface-container-high text-on-surface'}`}>
                        {isCredit(tx.type) ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate text-on-surface">{tx.merchant || tx.payee || 'Transaction'}</p>
                        <p className="text-xs text-text-muted mt-0.5 truncate">{tx.categoryName || tx.type || 'Uncategorized'} · {tx.occurredOn}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-bold tabular-nums shrink-0 ${isCredit(tx.type) ? 'text-success-proactive' : 'text-on-surface'}`}>
                      {isCredit(tx.type) ? '+' : '-'}{formatMoney(tx.amountMinor, tx.currency || currency)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center bg-surface-container-lowest rounded-2xl p-6 my-2">
                <WalletCards className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-50" />
                <p className="text-sm font-bold text-on-surface">No transactions recorded yet</p>
                <p className="text-xs text-text-muted mt-1 mb-4">Start logging expenses or income in Finance Hub to see real activity.</p>
                <Link to="/finance" className="inline-flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl bg-primary text-white">Log Transaction</Link>
              </div>
            )}
          </div>
        </div>

        <div className="app-card p-4 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-title">Today's Meal Plan</h3>
              <Link to="/meal-plan" className="text-sm font-semibold text-secondary hover:underline">Open Planner</Link>
            </div>
            {isLoading ? (
              <div className="py-8 flex items-center justify-center text-text-muted gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading meal plan...</div>
            ) : meals.length > 0 ? (
              <div className="divide-y divide-border-subtle mb-4">
                {meals.map((entry) => (
                  <div key={entry.id || entry.mealSlot} className="flex items-center gap-3 py-3">
                    <div className="w-20 shrink-0">
                      <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-secondary bg-secondary/10 rounded-md px-2 py-0.5">{entry.mealSlot}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-on-surface truncate">{entry.customTitle || entry.recipeTitle || entry.title || 'Planned Meal'}</p>
                      {entry.servings ? <p className="text-xs text-text-muted mt-0.5">{entry.servings} serving{entry.servings !== 1 ? 's' : ''}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center bg-surface-container-lowest rounded-2xl p-6 my-2">
                <Utensils className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-50" />
                <p className="text-sm font-bold text-on-surface">No meals planned for today</p>
                <p className="text-xs text-text-muted mt-1 mb-4">Use the AI Meal Planner to auto-fill your week based on your pantry stock.</p>
                <Link to="/meal-plan" className="inline-flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl bg-primary text-white">Plan Meals</Link>
              </div>
            )}

            {!isLoading && pantry?.lowStockCount > 0 && (
              <div className="mt-4 pt-4 border-t border-border-subtle flex items-center justify-between gap-3 text-amber-600 dark:text-amber-400 bg-amber-500/10 p-3 rounded-xl">
                <div className="flex items-center gap-2 text-xs font-bold min-w-0">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="truncate">{pantry.lowStockCount} item{pantry.lowStockCount !== 1 ? 's' : ''} running low in pantry</span>
                </div>
                <Link to="/pantry" className="text-xs font-extrabold underline shrink-0">Restock</Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
