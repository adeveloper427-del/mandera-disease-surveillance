import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity,
  ClipboardList,
  Database,
  FileText,
  History,
  MapPinned,
  MessageSquareText,
  Radio,
  Settings,
  ShieldCheck,
  Stethoscope,
  UserCheck,
  Users,
  CalendarDays,
} from 'lucide-react';
import { useAdminSummary } from '@/hooks/queries';
import { formatDateTime } from '@/lib/format';
import { API_MODE } from '@/services/apiClient';
import { CHART, SERIES } from '@/config/status';
import { Card, CardBody, CardHeader, PageHeader, StatCard } from '@/components/ui/Card';
import { ErrorState, LoadingBlock, Skeleton } from '@/components/ui/states';
import { ChartCard, ChartTooltip, OutcomeMeter } from '@/components/charts/Charts';

const LINKS = [
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/diseases', label: 'Diseases', icon: Stethoscope },
  { to: '/admin/locations', label: 'Locations', icon: MapPinned },
  { to: '/admin/templates', label: 'SMS templates', icon: FileText },
  { to: '/admin/audit', label: 'Audit logs', icon: History },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminDashboardPage() {
  const q = useAdminSummary();
  const s = q.data;

  return (
    <>
      <PageHeader title="Administration" description="System-wide statistics, SMS activity and recent actions." />

      {!!s?.pendingApprovals && (
        <Link
          to="/admin/users?status=pending"
          className="mb-6 flex items-center gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-inset ring-amber-200 transition hover:bg-amber-100"
        >
          <UserCheck className="h-5 w-5 shrink-0" aria-hidden />
          <span className="flex-1">
            <strong>{s.pendingApprovals} health officer{s.pendingApprovals === 1 ? '' : 's'}</strong> waiting for account approval.
          </span>
          <span className="font-medium underline">Review requests</span>
        </Link>
      )}

      {q.error ? (
        <Card className="mb-6">
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {!s ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)
          ) : (
            <>
              <StatCard compact label="Total users" value={s.totalUsers} icon={Users} to="/admin/users" />
              <StatCard compact label="Active officers" value={s.activeOfficers} icon={UserCheck} tone="emerald" to="/admin/officers" />
              <StatCard compact label="Total reports" value={s.totalReports} icon={ClipboardList} tone="sky" to="/app/reports" />
              <StatCard compact label="Reports today" value={s.reportsToday} icon={CalendarDays} tone="amber" to="/app/reports?range=today" />
              <StatCard compact label="Diseases reported" value={s.diseasesReported} icon={Stethoscope} tone="violet" hint="Last 30 days" to="/app/diseases" />
              <StatCard compact label="Locations affected" value={s.locationsAffected} icon={MapPinned} tone="rose" hint="Last 30 days" to="/app/map" />
            </>
          )}
        </div>
      )}

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="SMS activity"
          description="Messages per day, last 14 days"
          isLoading={q.isLoading}
          table={s && { columns: ['Day', 'Inbound', 'Outbound', 'Failed'], rows: s.smsByDay.map((d) => [d.label, d.inbound, d.outbound, d.failed]) }}
        >
          {s && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.smsByDay} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={2}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" stroke={CHART.axis} tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} interval="preserveStartEnd" />
                <YAxis stroke={CHART.axis} tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(15,29,28,0.04)' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="inbound" name="Inbound" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={16} />
                <Bar dataKey="outbound" name="Outbound" fill={SERIES[2]} radius={[4, 4, 0, 0]} maxBarSize={16} />
                <Bar dataKey="failed" name="Failed" fill={SERIES[7]} radius={[4, 4, 0, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <Card>
          <CardHeader title="SMS summary" description="Last 30 days" actions={<Link to="/admin/sms" className="text-xs font-medium text-brand-700 hover:underline">Open SMS log</Link>} />
          <CardBody className="space-y-6">
            {!s ? (
              <LoadingBlock rows={3} />
            ) : (
              <>
                <div>
                  <p className="mb-2 text-sm font-medium text-ink">Inbound: {s.sms.inbound}</p>
                  <OutcomeMeter
                    segments={[
                      { label: 'Valid reports', value: s.sms.inbound - s.sms.invalid, color: SERIES[0] },
                      { label: 'Invalid', value: s.sms.invalid, color: SERIES[7] },
                    ]}
                  />
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-ink">Outbound: {s.sms.outbound}</p>
                  <OutcomeMeter
                    segments={[
                      { label: 'Delivered', value: s.sms.delivered, color: SERIES[2] },
                      { label: 'Pending / sent', value: s.sms.pending, color: SERIES[3] },
                      { label: 'Failed', value: s.sms.failed, color: SERIES[7] },
                    ]}
                  />
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="System activity"
            description="Most recent audited actions"
            actions={
              <Link to="/admin/audit" className="text-xs font-medium text-brand-700 hover:underline">
                View audit logs
              </Link>
            }
          />
          {!s ? (
            <LoadingBlock rows={6} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {s.recentActivity.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                    <Activity className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-ink">{a.details}</p>
                    <p className="text-xs text-ink-muted">
                      {a.actorName} · {formatDateTime(a.at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="System status" />
            <CardBody className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-ink-soft">
                  <Radio className="h-4 w-4" aria-hidden /> SMS gateway
                </span>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">Not connected</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-ink-soft">
                  <Database className="h-4 w-4" aria-hidden /> Data source
                </span>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                  {API_MODE === 'mock' ? 'Mock (browser)' : 'API'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-ink-soft">
                  <ShieldCheck className="h-4 w-4" aria-hidden /> Audit logging
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-600/20">Active</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-ink-soft">
                  <MessageSquareText className="h-4 w-4" aria-hidden /> Auto-replies
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-600/20">Enabled</span>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Quick links" />
            <div className="grid grid-cols-2 gap-2 p-4">
              {LINKS.map((l) => (
                <Link key={l.to} to={l.to} className="flex items-center gap-2 rounded-lg p-2.5 text-sm font-medium text-ink-soft ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-ink">
                  <l.icon className="h-4 w-4 text-brand-600" aria-hidden />
                  {l.label}
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
