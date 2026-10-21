import { useState, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { BarChart3, Table2 } from 'lucide-react';
import type { CountRow, TimeBucket } from '@/types';
import { CHART, SERIES } from '@/config/status';
import { Card, CardHeader } from '@/components/ui/Card';
import { ChartSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { Table, TBody, THead, Td, Th } from '@/components/ui/Table';

const axisProps = {
  stroke: CHART.axis,
  tick: { fill: CHART.axis, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: '#c3c2b7' },
};

export function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-pop ring-1 ring-slate-200">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey as string} className="flex items-center gap-2 text-ink-soft">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="font-semibold text-ink tabular-nums">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Card wrapper with loading / error / empty states and a table-view toggle for accessibility. */
export function ChartCard({
  title,
  description,
  actions,
  isLoading,
  error,
  onRetry,
  isEmpty,
  table,
  children,
  height = 280,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  isEmpty?: boolean;
  table?: { columns: string[]; rows: (string | number)[][] };
  children: ReactNode;
  height?: number;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        description={description}
        actions={
          <>
            {actions}
            {table && (
              <button
                type="button"
                onClick={() => setAsTable((v) => !v)}
                className="rounded-md p-1.5 text-ink-muted hover:bg-slate-100 hover:text-ink"
                aria-label={asTable ? 'Show chart' : 'Show data as table'}
                title={asTable ? 'Show chart' : 'Show data as table'}
              >
                {asTable ? <BarChart3 className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
              </button>
            )}
          </>
        }
      />
      <div className="p-4">
        {isLoading ? (
          <ChartSkeleton height={height} />
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : isEmpty ? (
          <EmptyState title="No data for this selection" message="Try a longer time range or different filters." />
        ) : asTable && table ? (
          <div className="overflow-y-auto" style={{ maxHeight: height }}>
            <Table caption={title}>
              <THead>
                <tr>
                  {table.columns.map((c) => (
                    <Th key={c}>{c}</Th>
                  ))}
                </tr>
              </THead>
              <TBody>
                {table.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <Td key={j} className={j > 0 ? 'tabular-nums' : 'font-medium text-ink'}>
                        {c}
                      </Td>
                    ))}
                  </tr>
                ))}
              </TBody>
            </Table>
          </div>
        ) : (
          <div style={{ height }}>{children}</div>
        )}
      </div>
    </Card>
  );
}

export function TrendChart({ data, showOutcomes = true }: { data: TimeBucket[]; showOutcomes?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.total} stopOpacity={0.18} />
            <stop offset="100%" stopColor={CHART.total} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
        <YAxis {...axisProps} allowDecimals={false} axisLine={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHART.axis, strokeDasharray: '3 3' }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Area type="monotone" dataKey="total" name="All reports" stroke={CHART.total} strokeWidth={2} fill="url(#gTotal)" activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
        {showOutcomes && (
          <Area type="monotone" dataKey="verified" name="Verified" stroke={CHART.verified} strokeWidth={2} fill="transparent" activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
        )}
        {showOutcomes && (
          <Area type="monotone" dataKey="rejected" name="Rejected" stroke={CHART.rejected} strokeWidth={2} strokeDasharray="4 3" fill="transparent" activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars: magnitude by category, one hue (sequential job, not identity). */
export function HorizontalBars({ data, max = 10, color = SERIES[0] }: { data: CountRow[]; max?: number; color?: string }) {
  const rows = data.slice(0, max);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }} barCategoryGap={6}>
        <CartesianGrid stroke={CHART.grid} horizontal={false} />
        <XAxis type="number" {...axisProps} allowDecimals={false} />
        <YAxis type="category" dataKey="name" {...axisProps} width={128} axisLine={false} tick={{ fill: '#475553', fontSize: 12 }} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(15,29,28,0.04)' }} />
        <Bar dataKey="total" name="Reports" fill={color} radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Stacked outcome bars per category (verified / rejected / awaiting decision). */
export function OutcomeBars({ data, max = 10, layout = 'vertical' }: { data: CountRow[]; max?: number; layout?: 'vertical' | 'horizontal' }) {
  const rows = data.slice(0, max);
  if (layout === 'horizontal')
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="name" {...axisProps} interval={0} tick={{ fill: CHART.axis, fontSize: 11 }} />
          <YAxis {...axisProps} allowDecimals={false} axisLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(15,29,28,0.04)' }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          <Bar dataKey="verified" name="Verified" stackId="a" fill={CHART.verified} stroke="#fff" strokeWidth={1} />
          <Bar dataKey="rejected" name="Rejected" stackId="a" fill={CHART.rejected} stroke="#fff" strokeWidth={1} />
          <Bar dataKey="pending" name="Awaiting decision" stackId="a" fill={CHART.pending} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barCategoryGap={6}>
        <CartesianGrid stroke={CHART.grid} horizontal={false} />
        <XAxis type="number" {...axisProps} allowDecimals={false} />
        <YAxis type="category" dataKey="name" {...axisProps} width={128} axisLine={false} tick={{ fill: '#475553', fontSize: 12 }} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(15,29,28,0.04)' }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Bar dataKey="verified" name="Verified" stackId="a" fill={CHART.verified} stroke="#fff" strokeWidth={1} maxBarSize={22} />
        <Bar dataKey="rejected" name="Rejected" stackId="a" fill={CHART.rejected} stroke="#fff" strokeWidth={1} maxBarSize={22} />
        <Bar dataKey="pending" name="Awaiting decision" stackId="a" fill={CHART.pending} stroke="#fff" strokeWidth={1} radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VerifiedRejectedChart({ data }: { data: TimeBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
        <YAxis {...axisProps} allowDecimals={false} axisLine={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(15,29,28,0.04)' }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Bar dataKey="verified" name="Verified" fill={CHART.verified} radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Bar dataKey="rejected" name="Rejected" fill={CHART.rejected} radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MultiLineChart({ data, series }: { data: Record<string, string | number>[]; series: { key: string; name: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={20} />
        <YAxis {...axisProps} allowDecimals={false} axisLine={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHART.axis, strokeDasharray: '3 3' }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Horizontal stacked meter with legend: shows share of outcomes. */
export function OutcomeMeter({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(', ')}>
        {segments.map((s) => (
          <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} className="h-full border-r-2 border-white last:border-r-0" />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-ink-soft">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.label}
            <span className="ml-auto font-semibold tabular-nums text-ink">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
