import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Report, ReportQuery } from '@/types';
import { useRefData } from '@/hooks/queries';
import { formatDate, formatTime } from '@/lib/format';
import { PriorityBadge, StatusBadge } from '@/components/ui/Badge';
import { SortableTh, TBody, THead, Table, Td, Th } from '@/components/ui/Table';

type SortKey = NonNullable<ReportQuery['sortBy']>;

export function ReportTable({
  reports,
  sort,
  onSort,
  showReporter = true,
  showOfficer = false,
}: {
  reports: Report[];
  sort?: { by?: SortKey; dir?: 'asc' | 'desc' };
  onSort?: (k: SortKey) => void;
  showReporter?: boolean;
  showOfficer?: boolean;
}) {
  const ref = useRefData();
  const navigate = useNavigate();
  const header = (label: string, key: SortKey) =>
    onSort ? <SortableTh label={label} sortKey={key} current={sort?.by} dir={sort?.dir} onSort={onSort} /> : <Th>{label}</Th>;

  return (
    <Table caption="Disease reports">
      <THead>
        <tr>
          {header('Report ID', 'id')}
          <Th>Suspected disease</Th>
          <Th>Location</Th>
          {showReporter && <Th className="hidden xl:table-cell">Reporter</Th>}
          {header('Date', 'receivedAt')}
          {header('Status', 'status')}
          {header('Priority', 'priority')}
          {showOfficer && <Th className="hidden lg:table-cell">Officer</Th>}
          <Th className="text-right">
            <span className="sr-only">Action</span>
          </Th>
        </tr>
      </THead>
      <TBody>
        {reports.map((r) => (
          <tr
            key={r.id}
            className="cursor-pointer transition hover:bg-slate-50"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('a,button')) return;
              navigate(`/app/reports/${r.id}`);
            }}
          >
            <Td className="font-mono font-semibold text-ink">{r.id}</Td>
            <Td className="font-medium text-ink">{ref.diseaseName(r.diseaseId)}</Td>
            <Td>
              <span className="text-ink">{ref.villageName(r.villageId)}</span>
              <span className="block text-xs text-ink-muted">{ref.wardName(r.villageId)}</span>
            </Td>
            {showReporter && (
              <Td className="hidden xl:table-cell">
                <span className="text-ink">{r.reporterName}</span>
                <span className="block text-xs text-ink-muted">Age {r.age}</span>
              </Td>
            )}
            <Td>
              <span className="text-ink">{formatDate(r.receivedAt)}</span>
              <span className="block text-xs text-ink-muted">{formatTime(r.receivedAt)}</span>
            </Td>
            <Td>
              <StatusBadge status={r.status} />
            </Td>
            <Td>
              <PriorityBadge priority={r.priority} />
            </Td>
            {showOfficer && <Td className="hidden lg:table-cell">{r.assignedOfficerId ? ref.officerName(r.assignedOfficerId) : <span className="text-ink-muted">Not assigned</span>}</Td>}
            <Td className="text-right">
              <Link
                to={`/app/reports/${r.id}`}
                className="inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50"
                aria-label={`View report ${r.id}`}
              >
                View <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </Td>
          </tr>
        ))}
      </TBody>
    </Table>
  );
}
