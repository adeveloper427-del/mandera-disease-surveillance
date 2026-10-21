import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, MapPin, Minus } from 'lucide-react';
import { useAlerts, useMatrix, useRefData } from '@/hooks/queries';
import { analyticsService } from '@/services';
import { isOpenAlert } from '@/lib/hotspot';
import { CHART } from '@/config/status';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Select } from '@/components/ui/forms';
import { Tabs } from '@/components/ui/Tabs';
import { AlertLevelBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, LoadingBlock, Skeleton } from '@/components/ui/states';
import { TBody, THead, Table, Td, Th } from '@/components/ui/Table';
import { ChartCard, HorizontalBars, MultiLineChart, OutcomeBars } from '@/components/charts/Charts';

type Range = '7' | '30' | '90';

function Trend({ now, prev }: { now: number; prev: number }) {
  const diff = now - prev;
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-ink-muted" title="Compared with the previous period of the same length">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="font-medium text-ink-soft">
        {diff > 0 ? '+' : ''}
        {diff}
      </span>
      <span className="sr-only">{diff > 0 ? 'increase' : diff < 0 ? 'decrease' : 'no change'}</span> vs prev.
    </span>
  );
}

export function DiseaseMonitoringPage() {
  const ref = useRefData();
  const [range, setRange] = useState<Range>('30');
  const [wardId, setWardId] = useState('');
  const matrix = useMatrix({ days: Number(range), wardId: wardId || undefined });
  const alerts = useAlerts();
  const rows = matrix.data ?? [];
  const reported = rows.filter((r) => r.total > 0);
  const top5 = reported.slice(0, 5);

  // Weekly trend lines for the five most reported diseases.
  const trendQueries = useQueries({
    queries: top5.map((r) => ({
      queryKey: ['analytics', 'ts', 'weekly', { diseaseId: r.diseaseId, wardId, periods: 12 }],
      queryFn: () => analyticsService.timeseries('weekly', { diseaseId: r.diseaseId, wardId: wardId || undefined, periods: 12 }),
    })),
  });
  const trendData = useMemo(() => {
    const base = trendQueries[0]?.data;
    if (!base || trendQueries.some((q) => !q.data)) return null;
    return base.map((b, i) => {
      const row: Record<string, string | number> = { label: b.label };
      top5.forEach((r, j) => (row[r.diseaseId] = trendQueries[j].data![i].total));
      return row;
    });
  }, [trendQueries, top5]);

  const countRows = reported.map((r) => ({ id: r.diseaseId, name: ref.diseaseName(r.diseaseId), total: r.total, verified: r.verified, rejected: r.rejected, pending: r.pending }));
  const openAlerts = alerts.data?.filter(isOpenAlert) ?? [];

  return (
    <>
      <PageHeader
        title="Disease monitoring"
        description="Which suspected diseases are being reported, how often, where, and how many have been verified."
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
                { value: '7', label: '7 days' },
                { value: '30', label: '30 days' },
                { value: '90', label: '90 days' },
              ]}
            />
          </>
        }
      />

      {/* Most reported diseases */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {matrix.isLoading &&
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        {reported.slice(0, 4).map((r, i) => {
          const d = ref.diseases.find((x) => x.id === r.diseaseId);
          const alert = openAlerts.find((a) => a.diseaseId === r.diseaseId);
          const villages = Object.keys(r.villages).length;
          return (
            <Card key={r.diseaseId} as="article" className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">#{i + 1} most reported</p>
                  <h2 className="mt-1 text-lg font-semibold text-ink">{d?.name}</h2>
                  <p className="text-xs text-ink-muted">{d?.category}</p>
                </div>
                {alert && <AlertLevelBadge level={alert.level} />}
              </div>
              <p className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-semibold text-ink">{r.total}</span>
                <span className="text-sm text-ink-muted">suspected reports</span>
              </p>
              <div className="mt-1">
                <Trend now={r.total} prev={r.prevTotal} />
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center text-xs">
                <div>
                  <dt className="text-ink-muted">Verified</dt>
                  <dd className="font-semibold text-emerald-700">{r.verified}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Rejected</dt>
                  <dd className="font-semibold text-rose-700">{r.rejected}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Villages</dt>
                  <dd className="font-semibold text-ink">{villages}</dd>
                </div>
              </dl>
            </Card>
          );
        })}
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <ChartCard
          title="Disease frequency"
          description={`Suspected reports in the last ${range} days`}
          isLoading={matrix.isLoading}
          error={matrix.error}
          onRetry={() => matrix.refetch()}
          isEmpty={!matrix.isLoading && reported.length === 0}
          table={{ columns: ['Disease', 'Reports'], rows: countRows.map((r) => [r.name, r.total]) }}
          height={300}
        >
          <HorizontalBars data={countRows} max={10} />
        </ChartCard>
        <ChartCard
          title="Disease trends"
          description="Weekly reports for the five most reported diseases (last 12 weeks)"
          isLoading={matrix.isLoading || (top5.length > 0 && !trendData)}
          isEmpty={!matrix.isLoading && top5.length === 0}
          table={trendData ? { columns: ['Week', ...top5.map((r) => ref.diseaseName(r.diseaseId))], rows: trendData.map((row) => [row.label, ...top5.map((r) => row[r.diseaseId])]) } : undefined}
          height={300}
        >
          {trendData && <MultiLineChart data={trendData} series={top5.map((r) => ({ key: r.diseaseId, name: ref.diseaseName(r.diseaseId) }))} />}
        </ChartCard>
      </div>

      <ChartCard
        className="mb-6"
        title="Suspected, verified and rejected by disease"
        description="Officer decisions for reports received in the selected period"
        isLoading={matrix.isLoading}
        isEmpty={!matrix.isLoading && reported.length === 0}
        table={{ columns: ['Disease', 'Verified', 'Rejected', 'Awaiting decision'], rows: countRows.map((r) => [r.name, r.verified, r.rejected, r.pending]) }}
        height={300}
      >
        <OutcomeBars data={countRows} layout="horizontal" />
      </ChartCard>

      <Card>
        <CardHeader title="Disease summary" description="Locations affected and surveillance thresholds" />
        {matrix.isLoading ? (
          <LoadingBlock rows={6} />
        ) : matrix.error ? (
          <ErrorState error={matrix.error} onRetry={() => matrix.refetch()} />
        ) : reported.length === 0 ? (
          <EmptyState icon={Activity} title="No reports in this period" message="Choose a longer period or another ward." />
        ) : (
          <Table caption="Disease summary">
            <THead>
              <tr>
                <Th>Disease</Th>
                <Th className="text-right">Suspected</Th>
                <Th className="text-right">Verified</Th>
                <Th className="text-right">Rejected</Th>
                <Th className="text-right">Awaiting</Th>
                <Th>Locations affected</Th>
                <Th>Alert threshold</Th>
                <Th>
                  <span className="sr-only">Action</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => {
                const d = ref.diseases.find((x) => x.id === r.diseaseId);
                const villages = Object.entries(r.villages).sort((a, b) => b[1] - a[1]);
                return (
                  <tr key={r.diseaseId}>
                    <Td>
                      <span className="font-medium text-ink">{d?.name}</span>
                      <span className="block text-xs text-ink-muted">{d?.category}</span>
                    </Td>
                    <Td className="text-right font-semibold tabular-nums text-ink">{r.total}</Td>
                    <Td className="text-right tabular-nums">{r.verified}</Td>
                    <Td className="text-right tabular-nums">{r.rejected}</Td>
                    <Td className="text-right tabular-nums">{r.pending}</Td>
                    <Td className="whitespace-normal">
                      {villages.length === 0 ? (
                        <span className="text-ink-muted">—</span>
                      ) : (
                        <span className="flex max-w-xs flex-wrap gap-1">
                          {villages.slice(0, 4).map(([vid, n]) => (
                            <span key={vid} className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-ink-soft">
                              <MapPin className="h-3 w-3" aria-hidden />
                              {ref.villageName(vid)} ({n})
                            </span>
                          ))}
                          {villages.length > 4 && <span className="text-xs text-ink-muted">+{villages.length - 4} more</span>}
                        </span>
                      )}
                    </Td>
                    <Td className="text-xs">
                      {d?.alertThreshold} reports / {d?.alertWindowHours} h
                    </Td>
                    <Td className="text-right">
                      <Link to={`/app/reports?diseaseId=${r.diseaseId}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                        Reports <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      <p className="mt-4 text-xs text-ink-muted" style={{ color: CHART.axis }}>
        Counts are suspected reports submitted by residents. Thresholds are surveillance triggers for officer review, not diagnostic criteria.
      </p>
    </>
  );
}
