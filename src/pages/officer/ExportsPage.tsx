import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FileText,
  History,
  MapPin,
  Siren,
  Stethoscope,
  XCircle,
  Calendar,
  type LucideIcon,
} from 'lucide-react';
import type { ExportResult, GeneratedReportParams, GeneratedReportType } from '@/types';
import { useExportHistory, useRefData } from '@/hooks/queries';
import { exportService } from '@/services';
import { errorMessage } from '@/services/apiClient';
import { exportExcel, exportPdf } from '@/lib/exporters';
import { formatDateTime, startOfDay, startOfWeek, toDateKey } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/forms';
import { Alert, EmptyState, LoadingBlock } from '@/components/ui/states';
import { TBody, THead, Table, Td, Th } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';

const TYPES: { value: GeneratedReportType; label: string; description: string; icon: LucideIcon }[] = [
  { value: 'daily', label: 'Daily disease report', description: "Today's reports", icon: CalendarDays },
  { value: 'weekly', label: 'Weekly disease report', description: 'This week (Mon–today)', icon: CalendarRange },
  { value: 'monthly', label: 'Monthly disease report', description: 'This calendar month', icon: Calendar },
  { value: 'disease', label: 'Disease-specific report', description: 'One disease, any period', icon: Stethoscope },
  { value: 'location', label: 'Location-specific report', description: 'One village, any period', icon: MapPin },
  { value: 'verified', label: 'Verified reports', description: 'Officer-verified only', icon: CheckCircle2 },
  { value: 'pending', label: 'Pending reports', description: 'Awaiting review', icon: Clock },
  { value: 'rejected', label: 'Rejected reports', description: 'Officer-rejected only', icon: XCircle },
  { value: 'hotspot', label: 'Potential hotspot report', description: 'Current surveillance alerts', icon: Siren },
];

function defaultRange(type: GeneratedReportType): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const to = toDateKey(today);
  if (type === 'daily') return { dateFrom: toDateKey(startOfDay()), dateTo: to };
  if (type === 'weekly') return { dateFrom: toDateKey(startOfWeek()), dateTo: to };
  if (type === 'monthly') return { dateFrom: toDateKey(new Date(today.getFullYear(), today.getMonth(), 1)), dateTo: to };
  const from = new Date(today);
  from.setDate(from.getDate() - 29);
  return { dateFrom: toDateKey(from), dateTo: to };
}

export function ExportsPage() {
  const ref = useRefData();
  const history = useExportHistory();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useState<GeneratedReportParams>({ type: 'weekly', ...defaultRange('weekly') });
  const [result, setResult] = useState<ExportResult | null>(null);
  const [downloading, setDownloading] = useState<'pdf' | 'xlsx' | null>(null);

  const generate = useMutation({
    mutationFn: exportService.generate,
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['exports'] });
      toast.success('Report generated', `${r.title}: ${r.rows.length} rows.`);
    },
  });

  const fixedRange = ['daily', 'weekly', 'monthly', 'hotspot'].includes(params.type);
  const valid =
    (params.type !== 'disease' || !!params.diseaseId) && (params.type !== 'location' || !!params.villageId) && params.dateFrom <= params.dateTo;

  const download = async (format: 'pdf' | 'xlsx') => {
    if (!result) return;
    setDownloading(format);
    try {
      if (format === 'pdf') await exportPdf(result);
      else await exportExcel(result);
      await exportService.logDownload(result.record.id, format);
      toast.success('Download started', `${result.title} (${format.toUpperCase()})`);
    } catch (err) {
      toast.error('Export failed', errorMessage(err));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <>
      <PageHeader title="Reports & exports" description="Generate standard surveillance reports and export them as PDF or Excel for meetings and county reporting." />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="1. Choose a report" />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Report type">
              {TYPES.map((t) => {
                const active = params.type === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setParams((p) => ({ ...p, type: t.value, ...defaultRange(t.value) }));
                      setResult(null);
                    }}
                    className={cn(
                      'flex items-start gap-3 rounded-lg p-3 text-left ring-1 ring-inset transition',
                      active ? 'bg-brand-50 ring-2 ring-brand-500' : 'ring-slate-200 hover:bg-slate-50',
                    )}
                  >
                    <t.icon className={cn('mt-0.5 h-5 w-5 shrink-0', active ? 'text-brand-700' : 'text-slate-400')} aria-hidden />
                    <span>
                      <span className="block text-sm font-medium text-ink">{t.label}</span>
                      <span className="block text-xs text-ink-muted">{t.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="2. Set parameters" />
          <CardBody className="space-y-4">
            {params.type === 'disease' && (
              <Field label="Disease" required>
                {(id) => (
                  <Select id={id} value={params.diseaseId ?? ''} onChange={(e) => setParams((p) => ({ ...p, diseaseId: e.target.value }))}>
                    <option value="">Select a disease…</option>
                    {ref.diseases.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            {params.type === 'location' && (
              <Field label="Village" required>
                {(id) => (
                  <Select id={id} value={params.villageId ?? ''} onChange={(e) => setParams((p) => ({ ...p, villageId: e.target.value }))}>
                    <option value="">Select a village…</option>
                    {ref.wards.map((w) => (
                      <optgroup key={w.id} label={w.name}>
                        {ref.villages
                          .filter((v) => v.wardId === w.id)
                          .map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="From">
                {(id) => <Input id={id} type="date" value={params.dateFrom} max={params.dateTo} disabled={fixedRange} onChange={(e) => setParams((p) => ({ ...p, dateFrom: e.target.value }))} />}
              </Field>
              <Field label="To">
                {(id) => <Input id={id} type="date" value={params.dateTo} min={params.dateFrom} disabled={fixedRange} onChange={(e) => setParams((p) => ({ ...p, dateTo: e.target.value }))} />}
              </Field>
            </div>
            {fixedRange && <p className="text-xs text-ink-muted">The period is set automatically for this report type.</p>}
            {generate.error && <Alert tone="danger">{errorMessage(generate.error)}</Alert>}
            <Button className="w-full" onClick={() => generate.mutate(params)} loading={generate.isPending} disabled={!valid} icon={<FileText className="h-4 w-4" />}>
              Generate report
            </Button>
          </CardBody>
        </Card>
      </div>

      {/* Preview */}
      <Card className="mt-6">
        <CardHeader
          title={result ? result.title : '3. Preview & export'}
          description={result?.subtitle ?? 'Generate a report to preview it here.'}
          actions={
            <>
              <Button variant="secondary" icon={<FileText className="h-4 w-4" />} disabled={!result} loading={downloading === 'pdf'} onClick={() => download('pdf')}>
                Export PDF
              </Button>
              <Button variant="secondary" icon={<FileSpreadsheet className="h-4 w-4" />} disabled={!result} loading={downloading === 'xlsx'} onClick={() => download('xlsx')}>
                Export Excel
              </Button>
            </>
          }
        />
        {generate.isPending ? (
          <LoadingBlock rows={6} label="Generating report" />
        ) : !result ? (
          <EmptyState icon={FileText} title="No report generated yet" message="Choose a report type and parameters, then select Generate report." />
        ) : (
          <>
            <div className="flex flex-wrap gap-6 border-b border-slate-100 px-5 py-4">
              {result.summary.map((s) => (
                <div key={s.label}>
                  <p className="text-xs uppercase tracking-wide text-ink-muted">{s.label}</p>
                  <p className="text-lg font-semibold text-ink">{s.value}</p>
                </div>
              ))}
            </div>
            {result.rows.length === 0 ? (
              <EmptyState title="No records match these parameters" message="Try a wider date range." />
            ) : (
              <>
                <Table caption={result.title}>
                  <THead>
                    <tr>
                      {result.columns.map((c) => (
                        <Th key={c}>{c}</Th>
                      ))}
                    </tr>
                  </THead>
                  <TBody>
                    {result.rows.slice(0, 15).map((r, i) => (
                      <tr key={i}>
                        {r.map((c, j) => (
                          <Td key={j} className={j === 0 ? 'font-mono font-medium text-ink' : ''}>
                            {c}
                          </Td>
                        ))}
                      </tr>
                    ))}
                  </TBody>
                </Table>
                {result.rows.length > 15 && (
                  <p className="border-t border-slate-100 px-5 py-3 text-xs text-ink-muted">
                    Showing 15 of {result.rows.length} rows. The export contains all rows.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Recently generated" description="Reports generated by you and other officers" />
        {history.isLoading ? (
          <LoadingBlock rows={3} />
        ) : !history.data?.length ? (
          <EmptyState icon={History} title="No reports generated yet" />
        ) : (
          <Table caption="Recently generated reports">
            <THead>
              <tr>
                <Th>Report</Th>
                <Th>Period</Th>
                <Th className="text-right">Rows</Th>
                <Th>Generated by</Th>
                <Th>Generated</Th>
              </tr>
            </THead>
            <TBody>
              {history.data.map((g) => (
                <tr key={g.id}>
                  <Td className="font-medium text-ink">{g.title}</Td>
                  <Td>
                    {g.params.dateFrom} → {g.params.dateTo}
                  </Td>
                  <Td className="text-right tabular-nums">{g.rowCount}</Td>
                  <Td>{ref.officerName(g.createdBy) === 'Unknown officer' ? 'Administrator' : ref.officerName(g.createdBy)}</Td>
                  <Td>{formatDateTime(g.createdAt)}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
