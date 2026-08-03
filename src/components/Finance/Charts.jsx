import { useState } from 'react';
import { ArrowDown, ArrowUp, Minus, Table2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatMoney, formatMoneyCompact } from '../../services/financeApi';

// ---------------------------------------------------------------------------
// Shared chart primitives.
//
// Colours come from the --viz-* tokens in index.css, which were validated with
// the data-viz palette checker (CVD separation + contrast) against this app's
// card surface in both themes. Marks follow the house specs: bars cap at 24px,
// 4px rounded data-end, square at the baseline, 2px surface gap between
// touching bars, hairline gridlines.
// ---------------------------------------------------------------------------

const MONTH_SHORT = new Intl.DateTimeFormat(undefined, { month: 'short' });

function monthLabel(monthStart) {
  return MONTH_SHORT.format(new Date(`${monthStart}T00:00:00`));
}

function niceCeiling(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

// ---------------------------------------------------------------------------
// Cash flow trend — grouped columns, two series (income vs expense)
// ---------------------------------------------------------------------------

export function CashflowTrend({ trend, currency }) {
  const [hovered, setHovered] = useState(null);
  const [showTable, setShowTable] = useState(false);

  const hasData = trend.some((month) => month.incomeMinor > 0 || month.expenseMinor > 0);
  const peak = niceCeiling(Math.max(...trend.map((m) => Math.max(m.incomeMinor, m.expenseMinor)), 1));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(peak * fraction));

  if (!hasData) {
    return <EmptyChart message="No transactions in the last 6 months yet." />;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Two series → a legend is always present. */}
        <div className="flex items-center gap-4">
          <LegendKey color="var(--viz-income)" label="Income" />
          <LegendKey color="var(--viz-expense)" label="Expenses" />
        </div>
        <button
          type="button"
          onClick={() => setShowTable((open) => !open)}
          className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[12px] font-semibold text-text-muted transition-colors hover:bg-surface-container-low hover:text-on-surface"
          aria-expanded={showTable}
        >
          <Table2 className="h-3.5 w-3.5" />
          {showTable ? 'Hide table' : 'View as table'}
        </button>
      </div>

      <div>
        <div className="flex">
          {/* Y axis carries the values that aren't directly labelled. */}
          <div className="relative mr-2 h-[180px] w-12 shrink-0" aria-hidden="true">
            {ticks.map((tick, index) => (
              <span
                key={tick}
                className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-text-muted"
                style={{ bottom: `${(index / (ticks.length - 1)) * 100}%` }}
              >
                {tick === 0 ? '0' : formatMoneyCompact(tick, currency)}
              </span>
            ))}
          </div>

          <div className="relative min-w-0 flex-1">
            {/* Recessive hairline gridlines, drawn behind the marks and scoped
                to the plot area so they never run under the axis labels. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[180px]" aria-hidden="true">
              {ticks.map((tick, index) => (
                <div
                  key={tick}
                  className="absolute inset-x-0 border-t"
                  style={{ bottom: `${(index / (ticks.length - 1)) * 100}%`, borderColor: 'var(--viz-grid)' }}
                />
              ))}
            </div>

            <div className="relative flex h-[180px] items-end gap-1 sm:gap-2">
              {trend.map((month) => (
                <div
                  key={month.month}
                  className="group relative flex h-full flex-1 items-end justify-center"
                  onMouseEnter={() => setHovered(month.month)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {hovered === month.month && (
                    <TrendTooltip month={month} currency={currency} />
                  )}

                  {/* 2px surface gap does the separating — no strokes on the marks. */}
                  <div className="flex h-full w-full items-end justify-center gap-[2px]">
                    <Column value={month.incomeMinor} peak={peak} color="var(--viz-income)" label={`Income ${formatMoney(month.incomeMinor, currency)}`} />
                    <Column value={month.expenseMinor} peak={peak} color="var(--viz-expense)" label={`Expenses ${formatMoney(month.expenseMinor, currency)}`} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2 flex gap-1 sm:gap-2">
              {trend.map((month, index) => (
                <p
                  key={month.month}
                  className={cn(
                    'flex-1 text-center text-[11px] font-semibold',
                    index === trend.length - 1 ? 'text-on-surface' : 'text-text-muted',
                  )}
                >
                  {monthLabel(month.monthStart)}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showTable && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border-subtle">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant">
                <th className="p-2.5 text-left font-semibold">Month</th>
                <th className="p-2.5 text-right font-semibold">Income</th>
                <th className="p-2.5 text-right font-semibold">Expenses</th>
                <th className="p-2.5 text-right font-semibold">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {trend.map((month) => (
                <tr key={month.month}>
                  <td className="p-2.5 font-semibold text-on-surface">{monthLabel(month.monthStart)}</td>
                  <td className="p-2.5 text-right tabular-nums text-on-surface-variant">{formatMoney(month.incomeMinor, currency)}</td>
                  <td className="p-2.5 text-right tabular-nums text-on-surface-variant">{formatMoney(month.expenseMinor, currency)}</td>
                  <td className={cn('p-2.5 text-right font-semibold tabular-nums', month.netMinor < 0 ? 'text-error' : 'text-on-surface')}>
                    {formatMoney(month.netMinor, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Column({ value, peak, color, label }) {
  const height = Math.max((value / peak) * 100, value > 0 ? 1.5 : 0);

  return (
    <div
      className="w-full max-w-[24px] rounded-t-[4px] transition-[height] duration-500"
      style={{ height: `${height}%`, backgroundColor: color }}
      role="img"
      aria-label={label}
    />
  );
}

function TrendTooltip({ month, currency }) {
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max -translate-x-1/2 rounded-xl border border-border-subtle bg-surface-card px-3 py-2 shadow-ambient">
      <p className="text-[11px] font-bold text-on-surface">{monthLabel(month.monthStart)}</p>
      <dl className="mt-1 space-y-0.5 text-[11px]">
        <TooltipRow color="var(--viz-income)" label="Income" value={formatMoney(month.incomeMinor, currency)} />
        <TooltipRow color="var(--viz-expense)" label="Expenses" value={formatMoney(month.expenseMinor, currency)} />
        <div className="mt-1 border-t border-border-subtle pt-1 text-on-surface-variant">
          Net <span className="font-bold tabular-nums text-on-surface">{formatMoney(month.netMinor, currency)}</span>
        </div>
      </dl>
    </div>
  );
}

function TooltipRow({ color, label, value }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <dt className="text-text-muted">{label}</dt>
      <dd className="ml-auto font-semibold tabular-nums text-on-surface">{value}</dd>
    </div>
  );
}

function LegendKey({ color, label }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] font-semibold text-on-surface-variant">
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Category movers — diverging bars around a zero baseline
// ---------------------------------------------------------------------------

export function CategoryMovers({ deltas, currency }) {
  const rows = deltas.slice(0, 7);
  const widest = Math.max(...rows.map((row) => Math.abs(row.deltaMinor)), 1);

  if (!rows.length) {
    return <EmptyChart message="Not enough history yet — check back after a second month of tracking." />;
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-[11px] font-semibold text-text-muted">
        <span>Spent less</span>
        <span>vs last month</span>
        <span>Spent more</span>
      </div>

      {rows.map((row) => {
        const up = row.deltaMinor > 0;
        const width = (Math.abs(row.deltaMinor) / widest) * 50;

        return (
          <div key={row.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
            <div>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-semibold text-on-surface">{row.name}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-text-muted">
                  {formatMoney(row.currentMinor, currency)}
                </span>
              </div>

              <div className="relative h-3">
                {/* Zero baseline — the diverging midpoint is neutral, never a hue. */}
                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2" style={{ backgroundColor: 'var(--viz-grid)' }} />
                <div
                  className={cn('absolute top-0 h-3', up ? 'left-1/2 rounded-r-[4px]' : 'right-1/2 rounded-l-[4px]')}
                  style={{
                    width: `${Math.max(width, row.deltaMinor === 0 ? 0 : 1)}%`,
                    backgroundColor: up ? 'var(--viz-up)' : 'var(--viz-down)',
                  }}
                />
              </div>
            </div>

            {/* Signed value + arrow: direction never rides on colour alone. */}
            <div className={cn('flex w-[92px] items-center justify-end gap-1 text-[12px] font-bold tabular-nums', up ? 'text-error' : 'text-success-proactive')}>
              {row.deltaMinor === 0 ? <Minus className="h-3 w-3" /> : up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              <span>
                {up ? '+' : ''}{formatMoneyCompact(row.deltaMinor, currency)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top merchants — one series, so no legend; bar length carries magnitude
// ---------------------------------------------------------------------------

export function MerchantBars({ merchants, currency }) {
  const widest = Math.max(...merchants.map((row) => row.amountMinor), 1);

  if (!merchants.length) {
    return <EmptyChart message="No spending recorded this month." />;
  }

  return (
    <div className="space-y-3">
      {merchants.map((merchant) => (
        <div key={merchant.name}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="truncate text-[13px] font-semibold text-on-surface">{merchant.name}</span>
            <span className="shrink-0 text-[12px] font-bold tabular-nums text-on-surface">
              {formatMoney(merchant.amountMinor, currency)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-container">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${(merchant.amountMinor / widest) * 100}%`, backgroundColor: 'var(--viz-income)' }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-[11px] text-text-muted">
              {merchant.transactionCount}&times;
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pace meter — spend so far against the trailing average
// ---------------------------------------------------------------------------

export function PaceMeter({ spentMinor, benchmarkMinor, currency, daysElapsed, daysInMonth }) {
  const percent = benchmarkMinor > 0 ? Math.round((spentMinor / benchmarkMinor) * 100) : 0;
  const expectedPercent = Math.round((daysElapsed / daysInMonth) * 100);
  const isOverPace = percent > expectedPercent + 5;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-semibold text-on-surface-variant">
          {formatMoney(spentMinor, currency)} of {formatMoney(benchmarkMinor, currency)} typical
        </p>
        <p className={cn('text-[13px] font-bold tabular-nums', isOverPace ? 'text-error' : 'text-success-proactive')}>
          {percent}%
        </p>
      </div>

      <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-surface-container">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.min(percent, 100)}%`,
            backgroundColor: isOverPace ? 'var(--viz-up)' : 'var(--viz-income)',
          }}
        />
        {/* Where you'd be if spending were perfectly even across the month. */}
        <div
          className="absolute inset-y-0 w-0.5 bg-on-surface/50"
          style={{ left: `${Math.min(expectedPercent, 100)}%` }}
          title="Even pace for today"
        />
      </div>

      <p className="mt-2 text-[11px] leading-4 text-text-muted">
        Day {daysElapsed} of {daysInMonth}. The marker shows an even pace — you're{' '}
        <span className={isOverPace ? 'font-semibold text-error' : 'font-semibold text-success-proactive'}>
          {isOverPace ? 'ahead of' : 'on or under'}
        </span>{' '}
        your usual burn.
      </p>
    </div>
  );
}

function EmptyChart({ message }) {
  return (
    <div className="flex min-h-[140px] items-center justify-center rounded-xl border border-dashed border-border-subtle px-4 text-center">
      <p className="text-sm text-text-muted">{message}</p>
    </div>
  );
}
