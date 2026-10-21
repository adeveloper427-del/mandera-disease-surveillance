import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Info, Pencil, Plus, Power, Stethoscope } from 'lucide-react';
import { DISEASE_CATEGORIES, type Disease, type DiseaseCategory, type Priority } from '@/types';
import { useDiseases } from '@/hooks/queries';
import { diseaseService } from '@/services';
import { errorMessage } from '@/services/apiClient';
import { PRIORITY } from '@/config/status';
import { Card, PageHeader } from '@/components/ui/Card';
import { Badge, PriorityBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, SearchInput, Select, Textarea, Toggle } from '@/components/ui/forms';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states';
import { TBody, THead, Table, Td, Th } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';

const EMPTY: Partial<Disease> = { name: '', category: 'Waterborne', description: '', alertThreshold: 10, alertWindowHours: 24, basePriority: 'medium', active: true, aliases: [] };

function DiseaseModal({ open, disease, onClose }: { open: boolean; disease: Disease | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<Partial<Disease>>(EMPTY);
  const [aliases, setAliases] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setForm(disease ?? EMPTY);
    setAliases((disease?.aliases ?? []).join(', '));
    setErrors({});
  }, [open, disease]);

  const save = useMutation({
    mutationFn: (data: Partial<Disease>) => (disease ? diseaseService.update(disease.id, data) : diseaseService.create(data)),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['diseases'] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
      toast.success(disease ? 'Disease updated' : 'Disease added', d.name);
      onClose();
    },
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.name?.trim()) e.name = 'Enter the disease name.';
    if (!(Number(form.alertThreshold) >= 1)) e.alertThreshold = 'Must be at least 1.';
    if (!(Number(form.alertWindowHours) >= 1 && Number(form.alertWindowHours) <= 720)) e.alertWindowHours = 'Between 1 and 720 hours.';
    setErrors(e);
    if (Object.keys(e).length) return;
    save.mutate({
      ...form,
      name: form.name!.trim(),
      alertThreshold: Number(form.alertThreshold),
      alertWindowHours: Number(form.alertWindowHours),
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
    });
  };
  const set = <K extends keyof Disease>(k: K, v: Disease[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={disease ? `Edit ${disease.name}` : 'Add disease'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {disease ? 'Save changes' : 'Add disease'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Disease name" required error={errors.name}>
            {(id, d) => <Input id={id} aria-describedby={d} value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} />}
          </Field>
          <Field label="Category" required>
            {(id) => (
              <Select id={id} value={form.category} onChange={(e) => set('category', e.target.value as DiseaseCategory)}>
                {DISEASE_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Description">
          {(id) => <Textarea id={id} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} rows={2} />}
        </Field>
        <Field label="Accepted SMS spellings" hint="Comma-separated, e.g. local names or abbreviations residents may type">
          {(id, d) => <Input id={id} aria-describedby={d} value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="e.g. Kolera, AWD" />}
        </Field>
        <fieldset className="rounded-lg bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
          <legend className="sr-only">Surveillance settings</legend>
          <p className="mb-3 text-sm font-semibold text-ink">Surveillance threshold</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Alert threshold (reports)" required error={errors.alertThreshold}>
              {(id, d) => <Input id={id} aria-describedby={d} type="number" min={1} value={form.alertThreshold ?? ''} onChange={(e) => set('alertThreshold', Number(e.target.value))} invalid={!!errors.alertThreshold} />}
            </Field>
            <Field label="Time window (hours)" required error={errors.alertWindowHours}>
              {(id, d) => <Input id={id} aria-describedby={d} type="number" min={1} max={720} value={form.alertWindowHours ?? ''} onChange={(e) => set('alertWindowHours', Number(e.target.value))} invalid={!!errors.alertWindowHours} />}
            </Field>
            <Field label="Base priority">
              {(id) => (
                <Select id={id} value={form.basePriority} onChange={(e) => set('basePriority', e.target.value as Priority)}>
                  {(Object.keys(PRIORITY) as Priority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY[p].label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <p className="mt-3 flex gap-1.5 text-xs text-ink-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Alert raised when {form.alertThreshold || 'N'} suspected reports come from one village within {form.alertWindowHours || 'H'} hours. This triggers officer review only. It is not a diagnostic rule.
          </p>
        </fieldset>
        <Toggle checked={!!form.active} onChange={(v) => set('active', v)} label="Active" description="Disabled diseases are not accepted in new SMS reports." />
      </div>
    </Modal>
  );
}

export function DiseasesPage() {
  const diseases = useDiseases();
  const qc = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<Disease | null | undefined>(undefined);
  const [toggling, setToggling] = useState<Disease | null>(null);

  const toggle = useMutation({
    mutationFn: (d: Disease) => diseaseService.update(d.id, { active: !d.active }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['diseases'] });
      toast.success(d.active ? 'Disease enabled' : 'Disease disabled', d.name);
      setToggling(null);
    },
    onError: (err) => toast.error('Update failed', errorMessage(err)),
  });

  const list = (diseases.data ?? []).filter(
    (d) => (!search || d.name.toLowerCase().includes(search.toLowerCase())) && (!category || d.category === category),
  );

  return (
    <>
      <PageHeader
        title="Diseases"
        description="Reportable diseases, accepted SMS spellings and surveillance alert thresholds."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(null)}>
            Add disease
          </Button>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <SearchInput className="sm:max-w-sm sm:flex-1" value={search} onChange={setSearch} placeholder="Search diseases" label="Search diseases" />
          <Select aria-label="Filter by category" className="sm:w-56" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {DISEASE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        {diseases.isLoading ? (
          <LoadingBlock rows={6} />
        ) : diseases.error ? (
          <ErrorState error={diseases.error} onRetry={() => diseases.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState icon={Stethoscope} title="No diseases found" />
        ) : (
          <Table caption="Reportable diseases">
            <THead>
              <tr>
                <Th>Disease</Th>
                <Th>Category</Th>
                <Th>Alert threshold</Th>
                <Th>Base priority</Th>
                <Th className="hidden lg:table-cell">SMS spellings</Th>
                <Th>Status</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {list.map((d) => (
                <tr key={d.id} className={d.active ? '' : 'bg-slate-50/60'}>
                  <Td className="max-w-xs whitespace-normal">
                    <p className="font-medium text-ink">{d.name}</p>
                    <p className="text-xs text-ink-muted line-clamp-2">{d.description}</p>
                  </Td>
                  <Td>{d.category}</Td>
                  <Td>
                    <span className="font-medium text-ink">{d.alertThreshold}</span> reports / {d.alertWindowHours} h
                  </Td>
                  <Td>
                    <PriorityBadge priority={d.basePriority} />
                  </Td>
                  <Td className="hidden max-w-[200px] truncate text-xs lg:table-cell">{d.aliases.join(', ') || '—'}</Td>
                  <Td>
                    <Badge className={d.active ? 'bg-emerald-50 text-emerald-800 ring-emerald-600/20' : 'bg-slate-100 text-slate-700 ring-slate-500/20'}>{d.active ? 'Active' : 'Disabled'}</Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(d)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Power className="h-3.5 w-3.5" />} onClick={() => setToggling(d)}>
                        {d.active ? 'Disable' : 'Enable'}
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <DiseaseModal open={editing !== undefined} disease={editing ?? null} onClose={() => setEditing(undefined)} />
      <ConfirmDialog
        open={!!toggling}
        onClose={() => setToggling(null)}
        onConfirm={() => toggling && toggle.mutate(toggling)}
        loading={toggle.isPending}
        tone={toggling?.active ? 'danger' : 'primary'}
        title={toggling?.active ? `Disable ${toggling?.name}?` : `Enable ${toggling?.name}?`}
        confirmLabel={toggling?.active ? 'Disable' : 'Enable'}
        message={
          toggling?.active
            ? 'New SMS reports naming this disease will be rejected with an "unknown disease" reply. Existing reports are kept.'
            : 'Residents will be able to report this disease by SMS again.'
        }
      />
    </>
  );
}
