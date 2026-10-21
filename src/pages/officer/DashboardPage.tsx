import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronsUp,
  ClipboardList,
  Clock,
  Eye,
  Smartphone,
  XCircle,
} from 'lucide-react';
import type { Granularity } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useAlerts, useByDisease, useByLocation, useRefData, useReports, useSummary, useTimeseries } from '@/hooks/queries';
import { formatLongDate, relativeTime } from '@/lib/format';
import { isOpenAlert } from '@/lib/hotspot';
import { PageHeader, StatCard, Card, CardHeader } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/Button';
import { PriorityBadge, StatusBadge } from '@/components/ui/Badge';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState, ErrorState, LoadingBlock, Skeleton } from '@/components/ui/states';
import { ChartCard, HorizontalBars, TrendChart, VerifiedRejectedChart } from '@/components/charts/Charts';
import { ReportTable } from '@/components/reports/ReportTable';
import { SERIES } from '@/config/status';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const PERIODS: Record<Granularity, number> = { daily: 30, weekly: 12, monthly: 6 };

export function DashboardPage() {
  const { user } = useAuth();
  const ref = useRefData();
  const summary = useSummary();
  const alerts = useAlerts();
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const trend = useTimeseries(granularity, { periods: PERIODS[granularity] });
  const outcomes = useTimeseries('weekly', { periods: 8 });
  const byDisease = useByDisease({ days: 30 });
  const byVillage = useByLocation('village', { days: 30 });
  const recent = useReports({ page: 1, pageSize: 8, sortBy: 'receivedAt', sortDir: 'desc' });

  const s = summary.data;
  const openAlerts = alerts.data?.filter(isOpenAlert) ?? [];
  const outbreaks = openAlerts.filter((a) => a.level === 'outbreak');

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user?.name.split(' ')[0]}`}
        description={`Surveillance overview for Mandera South Constituency · ${formatLongDate(new Date().toISOString())}`}
        actions={
          <>
            {user?.role === 'admin' && (
              <ButtonLink to="/app/demo/simulator" variant="secondary" icon={<Smartphone className="h-4 w-4" />}>
                Test SMS
              </ButtonLink>
            )}
            <ButtonLink to="/app/reports?status=pending" icon={<ClipboardList className="h-4 w-4" />}>
              Review pending
            </ButtonLink>
          </>
        }
      />

      {/* Potential outbreak alerts: the most important signal, shown first */}
      {outbreaks.length > 0 && (
        <div className="mb-6 space-y-3">
          {outbreaks.slice(0, 2).map((a) => (
            <div key={a.id} className="flex flex-col gap-3 rounded-xl bg-red-50 p-4 ring-1 ring-inset ring-red-200 sm:flex-row sm:items-center" role="alert">
              <div className="flex items-start gap-3">
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                  <span className="absolute inset-0 animate-pulse-ring rounded-full bg-red-500" aria-hidden />
                  <AlertTriangle className="relative h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-red-700">Potential outbreak alert · requires verification</p>
                  <p className="mt-0.5 text-sm font-medium text-red-950">
                    {a.count} suspected {ref.diseaseName(a.diseaseId)} reports have been received from {ref.villageName(a.villageId)} within the last{' '}
                    {a.windowHours} hours.
                  </p>
                  <p className="mt-0.5 text-xs text-red-800">
                    Threshold {a.threshold} / {a.windowHours} h · latest report {relativeTime(a.lastAt)} · status: {a.status}
                  </p>
                </div>
              </div>
              <ButtonLink to={`/app/alerts?focus=${encodeURIComponent(a.id)}`} variant="danger" size="sm" className="sm:ml-auto">
                Review alert <ArrowRight className="h-4 w-4" />
              </ButtonLink>
            </div>
          ))}
        </div>
      )}

      {/* Summary cards */}
      {summary.error ? (
        <Card className="mb-6">
          <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
        </Card>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {!s
            ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)
            : [
                <StatCard key="t" compact label="Total reports" value={s.total} icon={ClipboardList} tone="brand" to="/app/reports" />,
                <StatCard key="p" compact label="Pending" value={s.byStatus.pending} icon={Clock} tone="amber" to="/app/reports?status=pending" />,
                <StatCard key="u" compact label="Under review" value={s.byStatus.under_review} icon={Eye} tone="sky" to="/app/reports?status=under_review" />,
                <StatCard key="v" compact label="Verified" value={s.byStatus.verified} icon={CheckCircle2} tone="emerald" to="/app/reports?status=verified" />,
                <StatCard key="r" compact label="Rejected" value={s.byStatus.rejected} icon={XCircle} tone="rose" to="/app/reports?status=rejected" />,
                <StatCard key="e" compact label="Escalated" value={s.byStatus.escalated} icon={ChevronsUp} tone="violet" to="/app/reports?status=escalated" />,
                <StatCard key="d" compact label="Reports today" value={s.today} icon={CalendarDays} tone="slate" to="/app/reports?range=today" />,
                <StatCard
                  key="w"
                  compact
                  label="This week"
                  value={s.thisWeek}
                  icon={CalendarRange}
                  tone="slate"
                  to="/app/reports?range=week"
                  trend={{ value: s.thisWeek - s.lastWeek, label: 'vs last week' }}
                />,
              ]}
        </div>
      )}

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Disease reports over time"
          description="All suspected reports received, with officer decisions"
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
        >
          {trend.data && <TrendChart data={trend.data} />}
        </ChartCard>

        <Card>
          <CardHeader
            title="Needs attention"
            description="High and critical reports awaiting action"
            actions={
              <Link to="/app/reports?priority=critical" className="text-xs font-medium text-brand-700 hover:underline">
                View all
              </Link>
            }
          />
          {summary.isLoading ? (
            <LoadingBlock rows={5} />
          ) : !s?.needsAttention.length ? (
            <EmptyState icon={CheckCircle2} title="Nothing urgent" message="No high or critical reports are waiting for action." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {s.needsAttention.map((r) => (
                <li key={r.id}>
                  <Link to={`/app/reports/${r.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm">
                        <span className="font-mono font-semibold text-ink">{r.id}</span>
                        <span className="truncate text-ink-soft">
                          {ref.diseaseName(r.diseaseId)} · {ref.villageName(r.villageId)}
                        </span>
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <StatusBadge status={r.status} />
                        <span className="text-xs text-ink-muted">{relativeTime(r.receivedAt)}</span>
                      </div>
                    </div>
                    <PriorityBadge priority={r.priority} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          title="Reports by disease"
          description="Last 30 days"
          isLoading={byDisease.isLoading}
          error={byDisease.error}
          isEmpty={byDisease.data?.length === 0}
          onRetry={() => byDisease.refetch()}
          table={byDisease.data && { columns: ['Disease', 'Reports', 'Verified', 'Rejected'], rows: byDisease.data.map((r) => [r.name, r.total, r.verified, r.rejected]) }}
        >
          {byDisease.data && <HorizontalBars data={byDisease.data} max={8} color={SERIES[0]} />}
        </ChartCard>
        <ChartCard
          title="Reports by location"
          description="Top villages, last 30 days"
          isLoading={byVillage.isLoading}
          error={byVillage.error}
          isEmpty={byVillage.data?.length === 0}
          onRetry={() => byVillage.refetch()}
          table={byVillage.data && { columns: ['Village', 'Reports', 'Verified', 'Rejected'], rows: byVillage.data.map((r) => [r.name, r.total, r.verified, r.rejected]) }}
        >
          {byVillage.data && <HorizontalBars data={byVillage.data} max={8} color={SERIES[6]} />}
        </ChartCard>
        <ChartCard
          className="lg:col-span-2 xl:col-span-1"
          title="Verified vs rejected"
          description="Officer decisions per week (by report date)"
          isLoading={outcomes.isLoading}
          error={outcomes.error}
          onRetry={() => outcomes.refetch()}
          table={outcomes.data && { columns: ['Week', 'Verified', 'Rejected'], rows: outcomes.data.map((b) => [b.label, b.verified, b.rejected]) }}
        >
          {outcomes.data && <VerifiedRejectedChart data={outcomes.data} />}
        </ChartCard>
      </div>

      <Card>
        <CardHeader
          title="Recent reports"
          description="Latest suspected disease reports received by SMS"
          actions={
            <ButtonLink to="/app/reports" variant="ghost" size="sm">
              View all reports <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          }
        />
        {recent.isLoading ? (
          <LoadingBlock rows={6} />
        ) : recent.error ? (
          <ErrorState error={recent.error} onRetry={() => recent.refetch()} />
        ) : !recent.data?.items.length ? (
          <EmptyState title="No reports yet" message="Reports sent by SMS will appear here." />
        ) : (
          <ReportTable reports={recent.data.items} showReporter={false} />
        )}
      </Card>
    </>
  );
}
