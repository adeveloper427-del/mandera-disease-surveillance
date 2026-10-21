import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, Users, X } from 'lucide-react';
import { useAlerts, useMatrix, useRefData } from '@/hooks/queries';
import { isOpenAlert } from '@/lib/hotspot';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card';
import { Select } from '@/components/ui/forms';
import { Tabs } from '@/components/ui/Tabs';
import { AlertLevelBadge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { TBody, THead, Table, Td, Th } from '@/components/ui/Table';
import { MapLegend, SEVERITY_STYLE, SurveillanceMap, type MapMarker } from '@/components/map/SurveillanceMap';

type Range = '7' | '30' | '90';

export function MapPage() {
  const ref = useRefData();
  const [range, setRange] = useState<Range>('30');
  const [diseaseId, setDiseaseId] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const matrix = useMatrix({ days: Number(range) });
  const alerts = useAlerts();

  const openAlerts = useMemo(
    () => (alerts.data ?? []).filter(isOpenAlert).filter((a) => !diseaseId || a.diseaseId === diseaseId),
    [alerts.data, diseaseId],
  );

  const markers: MapMarker[] = useMemo(() => {
    const rows = (matrix.data ?? []).filter((r) => !diseaseId || r.diseaseId === diseaseId);
    return ref.villages
      .filter((v) => v.active)
      .map((v) => {
        const count = rows.reduce((s, r) => s + (r.villages[v.id] ?? 0), 0);
        const va = openAlerts.filter((a) => a.villageId === v.id);
        const severity = va.some((a) => a.level === 'outbreak') ? 'outbreak' : va.length ? 'hotspot' : count > 0 ? 'active' : 'none';
        return { village: v, count, severity };
      });
  }, [matrix.data, ref.villages, openAlerts, diseaseId]);

  const sel = markers.find((m) => m.village.id === selected);
  const selBreakdown = sel
    ? (matrix.data ?? [])
        .map((r) => ({ id: r.diseaseId, n: r.villages[sel.village.id] ?? 0 }))
        .filter((x) => x.n > 0 && (!diseaseId || x.id === diseaseId))
        .sort((a, b) => b.n - a.n)
    : [];
  const selAlerts = sel ? openAlerts.filter((a) => a.villageId === sel.village.id) : [];
  const sortedMarkers = [...markers].sort((a, b) => b.count - a.count);

  return (
    <>
      <PageHeader
        title="Locations & map"
        description="Where suspected disease reports are coming from, with potential hotspots highlighted."
        actions={
          <>
            <Select aria-label="Filter by disease" className="w-auto" value={diseaseId} onChange={(e) => setDiseaseId(e.target.value)}>
              <option value="">All diseases</option>
              {ref.diseases.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
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

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Disease reporting map" description="Select a village to see details" actions={<MapLegend />} />
          <CardBody className="p-3 sm:p-5">
            {matrix.isLoading || !ref.ready ? (
              <Skeleton className="h-[480px] w-full rounded-lg" />
            ) : matrix.error ? (
              <ErrorState error={matrix.error} onRetry={() => matrix.refetch()} />
            ) : (
              <SurveillanceMap wards={ref.wards} markers={markers} selectedId={selected} onSelect={setSelected} />
            )}
            <p className="mt-3 text-[11px] text-ink-muted">
              Village positions are approximate.
            </p>
          </CardBody>
        </Card>

        <Card>
          {sel ? (
            <>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-brand-600" aria-hidden />
                    {sel.village.name}
                  </span>
                }
                description={`${ref.wardById(sel.village.wardId)} ward`}
                actions={
                  <button onClick={() => setSelected(null)} className="rounded p-1 text-slate-400 hover:text-ink" aria-label="Close village details">
                    <X className="h-4 w-4" />
                  </button>
                }
              />
              <CardBody className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-ink-muted">Reports ({range} days)</p>
                    <p className="text-2xl font-semibold text-ink">{sel.count}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="flex items-center gap-1 text-xs text-ink-muted">
                      <Users className="h-3 w-3" aria-hidden /> Population (est.)
                    </p>
                    <p className="text-2xl font-semibold text-ink">{sel.village.population.toLocaleString()}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Status</p>
                  <p className="mt-1 flex items-center gap-2 text-sm text-ink">
                    <span className="h-3 w-3 rounded-full" style={{ background: SEVERITY_STYLE[sel.severity].fill }} aria-hidden />
                    {SEVERITY_STYLE[sel.severity].label}
                  </p>
                </div>
                {selAlerts.length > 0 && (
                  <div className="space-y-2">
                    {selAlerts.map((a) => (
                      <div key={a.id} className="rounded-lg bg-red-50/60 p-3 ring-1 ring-inset ring-red-200">
                        <AlertLevelBadge level={a.level} />
                        <p className="mt-1.5 text-sm text-ink">
                          {a.count} suspected {ref.diseaseName(a.diseaseId)} reports in {a.windowHours} h
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Reports by disease</p>
                  {selBreakdown.length === 0 ? (
                    <p className="mt-2 text-sm text-ink-muted">No reports in this period.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {selBreakdown.map((b) => (
                        <li key={b.id}>
                          <div className="flex justify-between text-sm">
                            <span className="text-ink">{ref.diseaseName(b.id)}</span>
                            <span className="font-semibold tabular-nums text-ink">{b.n}</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                            <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(b.n / selBreakdown[0].n) * 100}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <ButtonLink to={`/app/reports?villageId=${sel.village.id}${diseaseId ? `&diseaseId=${diseaseId}` : ''}`} variant="secondary" className="w-full">
                  View reports from {sel.village.name} <ArrowRight className="h-4 w-4" />
                </ButtonLink>
              </CardBody>
            </>
          ) : (
            <>
              <CardHeader title="Potential hotspots" description="Villages with active surveillance alerts" />
              {alerts.isLoading ? (
                <div className="space-y-3 p-5">
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </div>
              ) : openAlerts.length === 0 ? (
                <EmptyState title="No active hotspots" message="No village has crossed a surveillance threshold for this selection." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {openAlerts.map((a) => (
                    <li key={a.id}>
                      <button onClick={() => setSelected(a.villageId)} className="w-full px-5 py-3 text-left transition hover:bg-slate-50">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-ink">{ref.villageName(a.villageId)}</p>
                          <AlertLevelBadge level={a.level} />
                        </div>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {a.count} suspected {ref.diseaseName(a.diseaseId)} · {a.windowHours} h window
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-slate-100 p-4">
                <Link to="/app/alerts" className="text-sm font-medium text-brand-700 hover:underline">
                  Open Alerts & Hotspots →
                </Link>
              </div>
            </>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Location statistics" description={`Reports per village, last ${range} days`} />
        <Table caption="Reports per village">
          <THead>
            <tr>
              <Th>Village</Th>
              <Th>Ward</Th>
              <Th className="text-right">Reports</Th>
              <Th>Most reported</Th>
              <Th>Status</Th>
            </tr>
          </THead>
          <TBody>
            {sortedMarkers.map((m) => {
              const top = (matrix.data ?? [])
                .filter((r) => !diseaseId || r.diseaseId === diseaseId)
                .map((r) => ({ id: r.diseaseId, n: r.villages[m.village.id] ?? 0 }))
                .sort((a, b) => b.n - a.n)[0];
              return (
                <tr key={m.village.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(m.village.id)}>
                  <Td className="font-medium text-ink">
                    <button type="button" className="hover:underline" onClick={() => setSelected(m.village.id)}>
                      {m.village.name}
                    </button>
                  </Td>
                  <Td>{ref.wardById(m.village.wardId)}</Td>
                  <Td className="text-right font-semibold tabular-nums text-ink">{m.count}</Td>
                  <Td>{top && top.n > 0 ? `${ref.diseaseName(top.id)} (${top.n})` : '—'}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEVERITY_STYLE[m.severity].fill }} aria-hidden />
                      {SEVERITY_STYLE[m.severity].label}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
