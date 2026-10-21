import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Filter, RotateCcw, SearchX } from 'lucide-react';
import type { Priority, ReportQuery, ReportStatus } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useRefData, useReports, useSummary } from '@/hooks/queries';
import { useDebounce } from '@/hooks/useDebounce';
import { startOfDay, startOfWeek, toDateKey, formatDate, formatTime } from '@/lib/format';
import { exportCsv } from '@/lib/exporters';
import { reportService } from '@/services';
import { PRIORITY, STATUS } from '@/config/status';
import { PageHeader, Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, SearchInput, Select } from '@/components/ui/forms';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states';
import { Pagination } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { ReportTable } from '@/components/reports/ReportTable';

const FILTER_KEYS = ['diseaseId', 'wardId', 'villageId', 'priority', 'assignedTo', 'dateFrom', 'dateTo'] as const;

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const ref = useRefData();
  const summary = useSummary();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(() => FILTER_KEYS.some((k) => params.get(k)));
  const [search, setSearch] = useState(params.get('search') ?? '');
  const debounced = useDebounce(search, 350);

  // Shortcut ranges used by dashboard cards.
  useEffect(() => {
    const range = params.get('range');
    if (!range) return;
    const next = new URLSearchParams(params);
    next.delete('range');
    next.set('dateFrom', toDateKey(range === 'week' ? startOfWeek() : startOfDay()));
    next.set('dateTo', toDateKey(new Date()));
    setParams(next, { replace: true });
    setShowFilters(true);
  }, [params, setParams]);

  // Keep the search box in sync when the URL changes from elsewhere (e.g. header search).
  const urlSearch = params.get('search') ?? '';
  useEffect(() => {
    if (urlSearch !== debounced) setSearch(urlSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearch]);

  useEffect(() => {
    if (urlSearch === debounced) return;
    update({ search: debounced || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const update = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete('page');
    setParams(next, { replace: true });
  };

  const query: ReportQuery = useMemo(
    () => ({
      search: params.get('search') || undefined,
      status: (params.get('status') as ReportStatus) || undefined,
      priority: (params.get('priority') as Priority) || undefined,
      diseaseId: params.get('diseaseId') || undefined,
      wardId: params.get('wardId') || undefined,
      villageId: params.get('villageId') || undefined,
      assignedTo: params.get('assignedTo') || undefined,
      dateFrom: params.get('dateFrom') || undefined,
      dateTo: params.get('dateTo') || undefined,
      sortBy: (params.get('sortBy') as ReportQuery['sortBy']) || 'receivedAt',
      sortDir: (params.get('sortDir') as 'asc' | 'desc') || 'desc',
      page: Number(params.get('page')) || 1,
      pageSize: Number(params.get('pageSize')) || 10,
    }),
    [params],
  );

  const reports = useReports(query);
  const activeFilters = FILTER_KEYS.filter((k) => params.get(k)).length + (query.search ? 1 : 0);
  const villages = ref.villages.filter((v) => !query.wardId || v.wardId === query.wardId);
  const counts = summary.data?.byStatus;

  const onSort = (key: NonNullable<ReportQuery['sortBy']>) => {
    const dir = query.sortBy === key && query.sortDir === 'desc' ? 'asc' : 'desc';
    update({ sortBy: key, sortDir: dir }, false);
  };

  const exportView = async () => {
    setExporting(true);
    try {
      const all = await reportService.list({ ...query, page: 1, pageSize: 5000 });
      exportCsv(
        'disease-reports',
        ['Report ID', 'Date', 'Time', 'Reporter', 'Age', 'Phone', 'Village', 'Ward', 'Suspected disease', 'Status', 'Priority', 'Officer'],
        all.items.map((r) => [
          r.id,
          formatDate(r.receivedAt),
          formatTime(r.receivedAt),
          r.reporterName,
          r.age,
          r.phone,
          ref.villageName(r.villageId),
          ref.wardName(r.villageId),
          ref.diseaseName(r.diseaseId),
          STATUS[r.status].label,
          PRIORITY[r.priority].label,
          ref.officerName(r.assignedOfficerId),
        ]),
      );
      toast.success('Export ready', `${all.items.length} reports exported to CSV.`);
    } catch (err) {
      toast.error('Export failed', String((err as Error).message));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Disease reports"
        description="Search, filter and review every suspected disease report received by SMS."
        actions={
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportView} loading={exporting}>
            Export view (CSV)
          </Button>
        }
      />

      <div className="mb-4 overflow-x-auto">
        <Tabs
          value={(query.status ?? 'all') as ReportStatus | 'all'}
          onChange={(v) => update({ status: v === 'all' ? null : v })}
          items={[
            { value: 'all', label: 'All', count: summary.data?.total },
            ...(Object.keys(STATUS) as ReportStatus[]).map((s) => ({ value: s, label: STATUS[s].label, count: counts?.[s] })),
          ]}
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
          <SearchInput
            className="lg:max-w-md lg:flex-1"
            value={search}
            onChange={setSearch}
            placeholder="Search by report ID, reporter, phone, village or disease"
            label="Search reports"
          />
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <Select
              aria-label="Sort reports"
              className="w-auto"
              value={`${query.sortBy}:${query.sortDir}`}
              onChange={(e) => {
                const [sortBy, sortDir] = e.target.value.split(':');
                update({ sortBy, sortDir }, false);
              }}
            >
              <option value="receivedAt:desc">Newest first</option>
              <option value="receivedAt:asc">Oldest first</option>
              <option value="priority:desc">Highest priority</option>
              <option value="priority:asc">Lowest priority</option>
              <option value="id:asc">Report ID (A–Z)</option>
              <option value="status:asc">Status</option>
            </Select>
            <Button
              variant={showFilters ? 'outline' : 'secondary'}
              icon={<Filter className="h-4 w-4" />}
              onClick={() => setShowFilters((s) => !s)}
              aria-expanded={showFilters}
              aria-controls="report-filters"
            >
              Filters{activeFilters > 0 && ` (${activeFilters})`}
            </Button>
            {activeFilters > 0 && (
              <Button
                variant="ghost"
                icon={<RotateCcw className="h-4 w-4" />}
                onClick={() => {
                  setSearch('');
                  const next = new URLSearchParams();
                  if (query.status) next.set('status', query.status);
                  setParams(next, { replace: true });
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {showFilters && (
          <div id="report-filters" className="grid gap-3 border-b border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <Select aria-label="Filter by disease" value={query.diseaseId ?? ''} onChange={(e) => update({ diseaseId: e.target.value })}>
              <option value="">All diseases</option>
              {ref.diseases.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Select aria-label="Filter by ward" value={query.wardId ?? ''} onChange={(e) => update({ wardId: e.target.value, villageId: null })}>
              <option value="">All wards</option>
              {ref.wards.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
            <Select aria-label="Filter by village" value={query.villageId ?? ''} onChange={(e) => update({ villageId: e.target.value })}>
              <option value="">All villages</option>
              {villages.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
            <Select aria-label="Filter by priority" value={query.priority ?? ''} onChange={(e) => update({ priority: e.target.value })}>
              <option value="">All priorities</option>
              {(Object.keys(PRIORITY) as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY[p].label}
                </option>
              ))}
            </Select>
            <Select aria-label="Filter by assigned officer" value={query.assignedTo ?? ''} onChange={(e) => update({ assignedTo: e.target.value })}>
              <option value="">Any officer</option>
              {user && <option value={user.id}>Assigned to me</option>}
              <option value="unassigned">Not assigned</option>
              {ref.officers
                .filter((o) => o.user.id !== user?.id)
                .map((o) => (
                  <option key={o.user.id} value={o.user.id}>
                    {o.user.name}
                  </option>
                ))}
            </Select>
            <Input type="date" aria-label="From date" value={query.dateFrom ?? ''} max={query.dateTo} onChange={(e) => update({ dateFrom: e.target.value })} />
            <Input type="date" aria-label="To date" value={query.dateTo ?? ''} min={query.dateFrom} onChange={(e) => update({ dateTo: e.target.value })} />
          </div>
        )}

        {reports.isLoading ? (
          <LoadingBlock rows={8} label="Loading reports" />
        ) : reports.error ? (
          <ErrorState error={reports.error} onRetry={() => reports.refetch()} />
        ) : !reports.data?.items.length ? (
          <EmptyState
            icon={SearchX}
            title="No disease reports found for the selected filters."
            message="Try removing some filters or searching for a different term."
          />
        ) : (
          <div className={reports.isFetching ? 'opacity-70 transition-opacity' : ''}>
            <ReportTable reports={reports.data.items} sort={{ by: query.sortBy, dir: query.sortDir }} onSort={onSort} showOfficer />
            <Pagination
              page={reports.data.page}
              pageSize={reports.data.pageSize}
              total={reports.data.total}
              onPage={(p) => update({ page: String(p) }, false)}
              onPageSize={(s) => update({ pageSize: String(s) })}
            />
          </div>
        )}
      </Card>
    </>
  );
}
