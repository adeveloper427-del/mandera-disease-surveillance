import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, ClipboardList, Gauge, Timer } from 'lucide-react';
import type { Granularity } from '@/types';
import { useByDisease, usePerformance, useRefData, useTimeseries } from '@/hooks/queries';
import { CHART, SERIES } from '@/config/status';
import { PageHeader, StatCard } from '@/components/ui/Card';
import { Select } from '@/components/ui/forms';
import { Tabs } from '@/components/ui/Tabs';
import { Skeleton } from '@/components/ui/states';
import { ChartCard, ChartTooltip, OutcomeBars, OutcomeMeter, TrendChart, VerifiedRejectedChart } from '@/components/charts/Charts';

type Range = '30' | '90' | '365';

export function AnalyticsPage() {
  const ref = useRefData();
  const [range, setRange] = useState<Range>('90');
  const [wardId, setWardId] = useState('');
  const [granularity, setGranularity] = useState<Granularity>('weekly');
  const scope = { days: Number(range), wardId: wardId || undefined };
  const perf = usePerformance(scope);
  const trend = useTimeseries(granularity, { wardId: wardId || undefined, periods: granularity === 'daily' ? 30 : granularity === 'weekly' ? 12 : 6 });
  const byDisease = useByDisease(scope);
  const p = perf.data;
  const totalInRange = p?.ageGroups.reduce((s, g) => s + g.total, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Trends, response performance and who is affected, to support planning and reporting."
        actions={
          <>
            <Select aria-label="Filter by ward" className="w-auto" value={wardId} onChange={(e) => setWardId(e.target.value)}>
              <option value="">All wards</option>
              {ref.wards.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
            <Tabs
              value={range}
              onChange={setRange}
              items={[
                { value: '30', label: '30 days' },
                { value: '90', label: '90 days' },
                { value: '365', label: '12 months' },
              ]}
            />
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!p ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[100px] rounded-xl" />)
        ) : (
          <>
            <StatCard label="Reports in period" value={totalInRange} icon={ClipboardList} tone="brand" />
            <StatCard label="Decisions made" value={p.decided} icon={Gauge} tone="sky" hint="Verified or rejected" />
            <StatCard label="Verification rate" value={`${Math.round(p.verificationRate * 100)}%`} icon={CheckCircle2} tone="emerald" hint="Of decided reports" />
            <StatCard
              label="Avg. time to decision"
              value={p.avgDecisionHours === null ? '—' : p.avgDecisionHours < 24 ? `${p.avgDecisionHours.toFixed(1)} h` : `${(p.avgDecisionHours / 24).toFixed(1)} days`}
              icon={Timer}
              tone="amber"
              hint="From SMS received to decision"
            />
          </>
        )}
      </div>

      <ChartCard
        className="mb-6"
        title="Reporting trend"
        description="Suspected reports and officer decisions"
        isLoading={trend.isLoading}
        error={trend.error}
        onRetry={() => trend.refetch()}
        actions={
          <Tabs
            size="sm"
            value={granularity}
            onChange={setGranularity}
            items={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
          />
        }
        table={trend.data && { columns: ['Period', 'Reports', 'Verified', 'Rejected'], rows: trend.data.map((b) => [b.label, b.total, b.verified, b.rejected]) }}
        height={300}
      >
        {trend.data && <TrendChart data={trend.data} />}
      </ChartCard>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Reports by ward"
          description="Outcome of reports from each ward"
          isLoading={perf.isLoading}
          error={perf.error}
          isEmpty={p?.byWard.length === 0}
          table={p && { columns: ['Ward', 'Reports', 'Verified', 'Rejected', 'Awaiting'], rows: p.byWard.map((w) => [w.name, w.total, w.verified, w.rejected, w.pending]) }}
        >
          {p && <OutcomeBars data={p.byWard} />}
        </ChartCard>
        <ChartCard
          title="Age of people reported"
          description="Suspected cases by age group"
          isLoading={perf.isLoading}
          error={perf.error}
          table={p && { columns: ['Age group', 'Reports'], rows: p.ageGroups.map((g) => [g.label, g.total]) }}
        >
          {p && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={p.ageGroups} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" stroke={CHART.axis} tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} />
                <YAxis stroke={CHART.axis} tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(15,29,28,0.04)' }} />
                <Bar dataKey="total" name="Reports" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Outcomes by disease"
          description={`Reports received in the last ${range === '365' ? '12 months' : `${range} days`}`}
          isLoading={byDisease.isLoading}
          error={byDisease.error}
          isEmpty={byDisease.data?.length === 0}
          table={byDisease.data && { columns: ['Disease', 'Verified', 'Rejected', 'Awaiting'], rows: byDisease.data.map((r) => [r.name, r.verified, r.rejected, r.pending]) }}
          height={320}
        >
          {byDisease.data && <OutcomeBars data={byDisease.data} />}
        </ChartCard>
        <div className="space-y-6">
          <ChartCard title="Decision split" description="All decided reports in period" isLoading={perf.isLoading} height={120}>
            {p && (
              <OutcomeMeter
                segments={[
                  { label: 'Verified', value: Math.round(p.decided * p.verificationRate), color: CHART.verified },
                  { label: 'Rejected', value: p.decided - Math.round(p.decided * p.verificationRate), color: CHART.rejected },
                ]}
              />
            )}
          </ChartCard>
          <ChartCard title="Report channel" description="How reports reached the system" isLoading={perf.isLoading} height={120}>
            {p && <OutcomeMeter segments={p.bySource.map((s, i) => ({ label: s.label, value: s.total, color: SERIES[i === 0 ? 0 : 3] }))} />}
          </ChartCard>
        </div>
      </div>

      <ChartCard className="mt-6" title="Verified vs rejected over time" description={`Grouped ${granularity}, by date the report was received`} isLoading={trend.isLoading} height={260}>
        {trend.data && <VerifiedRejectedChart data={trend.data} />}
      </ChartCard>
    </>
  );
}
