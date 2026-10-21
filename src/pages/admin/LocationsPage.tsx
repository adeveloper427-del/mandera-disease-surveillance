import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronDown, ChevronRight, MapPin, Pencil, Plus, Power } from 'lucide-react';
import type { Village, Ward } from '@/types';
import { useLocations } from '@/hooks/queries';
import { locationService } from '@/services';
import { errorMessage } from '@/services/apiClient';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Toggle } from '@/components/ui/forms';
import { Modal } from '@/components/ui/Modal';
import { Alert, ErrorState, LoadingBlock } from '@/components/ui/states';
import { TBody, THead, Table, Td, Th } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';

function WardModal({ ward, open, onClose }: { ward: Ward | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setName(ward?.name ?? '');
      setErr(null);
    }
  }, [open, ward]);
  const save = useMutation({
    mutationFn: () => (ward ? locationService.updateWard(ward.id, name.trim()) : locationService.createWard(name.trim())),
    onSuccess: (w) => {
      qc.invalidateQueries({ queryKey: ['locations'] });
      toast.success(ward ? 'Ward renamed' : 'Ward added', w.name);
      onClose();
    },
    onError: (e) => setErr(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={ward ? 'Rename ward' : 'Add ward'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => (name.trim().length < 2 ? setErr('Enter a ward name.') : save.mutate())} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {err && <Alert tone="danger">{err}</Alert>}
        <Field label="Ward name" required>
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

function VillageModal({ village, wardId, wards, open, onClose }: { village: Village | null; wardId?: string; wards: Ward[]; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', wardId: '', lat: '', lng: '', population: '', aliases: '', active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(
      village
        ? { name: village.name, wardId: village.wardId, lat: String(village.lat), lng: String(village.lng), population: String(village.population), aliases: village.aliases.join(', '), active: village.active }
        : { name: '', wardId: wardId ?? wards[0]?.id ?? '', lat: '', lng: '', population: '', aliases: '', active: true },
    );
    setErrors({});
    setErr(null);
  }, [open, village, wardId, wards]);

  const save = useMutation({
    mutationFn: () => {
      const data = {
        name: form.name.trim(),
        wardId: form.wardId,
        lat: Number(form.lat),
        lng: Number(form.lng),
        population: Number(form.population) || 0,
        aliases: form.aliases.split(',').map((a) => a.trim()).filter(Boolean),
        active: form.active,
      };
      return village ? locationService.updateVillage(village.id, data) : locationService.createVillage(data);
    },
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ['locations'] });
      toast.success(village ? 'Village updated' : 'Village added', v.name);
      onClose();
    },
    onError: (e) => setErr(errorMessage(e)),
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = 'Enter the village name.';
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (!form.lat || Number.isNaN(lat) || lat < -5 || lat > 5.5) e.lat = 'Latitude between -5 and 5.5.';
    if (!form.lng || Number.isNaN(lng) || lng < 33 || lng > 42.5) e.lng = 'Longitude between 33 and 42.5.';
    setErrors(e);
    if (!Object.keys(e).length) save.mutate();
  };
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={village ? `Edit ${village.name}` : 'Add village'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save village
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {err && <Alert tone="danger">{err}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Village name" required error={errors.name} hint="Residents type this name in their SMS">
            {(id, d) => <Input id={id} aria-describedby={d} value={form.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} />}
          </Field>
          <Field label="Ward" required>
            {(id) => (
              <Select id={id} value={form.wardId} onChange={(e) => set('wardId', e.target.value)}>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Latitude" required error={errors.lat}>
            {(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={form.lat} onChange={(e) => set('lat', e.target.value)} invalid={!!errors.lat} placeholder="2.81" />}
          </Field>
          <Field label="Longitude" required error={errors.lng}>
            {(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={form.lng} onChange={(e) => set('lng', e.target.value)} invalid={!!errors.lng} placeholder="40.93" />}
          </Field>
          <Field label="Estimated population">
            {(id) => <Input id={id} type="number" min={0} value={form.population} onChange={(e) => set('population', e.target.value)} />}
          </Field>
          <Field label="Other spellings" hint="Comma-separated">
            {(id, d) => <Input id={id} aria-describedby={d} value={form.aliases} onChange={(e) => set('aliases', e.target.value)} placeholder="e.g. El Wak" />}
          </Field>
        </div>
        <Toggle checked={form.active} onChange={(v) => set('active', v)} label="Active" description="Inactive villages are not accepted in new SMS reports." />
      </div>
    </Modal>
  );
}

export function LocationsPage() {
  const tree = useLocations();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [wardModal, setWardModal] = useState<{ ward: Ward | null } | null>(null);
  const [villageModal, setVillageModal] = useState<{ village: Village | null; wardId?: string } | null>(null);

  const toggleVillage = useMutation({
    mutationFn: (v: Village) => locationService.updateVillage(v.id, { active: !v.active }),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ['locations'] });
      toast.success(v.active ? 'Village enabled' : 'Village disabled', v.name);
    },
    onError: (e) => toast.error('Update failed', errorMessage(e)),
  });

  const data = tree.data;
  const allOpen = data ? data.wards.every((w) => open[w.id] !== false) : true;

  return (
    <>
      <PageHeader
        title="Locations"
        description="Constituency → wards → villages. Reports are linked to a village, and village names are matched against incoming SMS."
        actions={
          <>
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setWardModal({ ward: null })}>
              Add ward
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setVillageModal({ village: null })}>
              Add village
            </Button>
          </>
        }
      />
      {tree.isLoading ? (
        <Card>
          <LoadingBlock rows={8} />
        </Card>
      ) : tree.error || !data ? (
        <Card>
          <ErrorState error={tree.error} onRetry={() => tree.refetch()} />
        </Card>
      ) : (
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-brand-600" aria-hidden /> {data.constituency.name} Constituency
              </span>
            }
            description={`${data.constituency.county} · ${data.wards.length} wards · ${data.villages.length} villages`}
            actions={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setOpen(Object.fromEntries(data.wards.map((w) => [w.id, !allOpen])))}
              >
                {allOpen ? 'Collapse all' : 'Expand all'}
              </Button>
            }
          />
          <ul className="divide-y divide-slate-100">
            {data.wards.map((w) => {
              const villages = data.villages.filter((v) => v.wardId === w.id);
              const isOpen = open[w.id] !== false;
              return (
                <li key={w.id}>
                  <div className="flex items-center gap-2 bg-slate-50/60 px-5 py-3">
                    <button
                      type="button"
                      className="flex flex-1 items-center gap-2 text-left"
                      onClick={() => setOpen((o) => ({ ...o, [w.id]: !isOpen }))}
                      aria-expanded={isOpen}
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4 text-ink-muted" aria-hidden /> : <ChevronRight className="h-4 w-4 text-ink-muted" aria-hidden />}
                      <span className="font-semibold text-ink">{w.name}</span>
                      <span className="text-xs text-ink-muted">Ward · {villages.length} villages</span>
                    </button>
                    <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setWardModal({ ward: w })}>
                      Rename
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setVillageModal({ village: null, wardId: w.id })}>
                      Village
                    </Button>
                  </div>
                  {isOpen &&
                    (villages.length === 0 ? (
                      <p className="px-12 py-4 text-sm text-ink-muted">No villages in this ward yet.</p>
                    ) : (
                      <Table caption={`Villages in ${w.name}`}>
                        <THead>
                          <tr>
                            <Th className="pl-12">Village</Th>
                            <Th className="hidden md:table-cell">Other spellings</Th>
                            <Th className="hidden sm:table-cell">Coordinates</Th>
                            <Th className="text-right">Population</Th>
                            <Th>Status</Th>
                            <Th>
                              <span className="sr-only">Actions</span>
                            </Th>
                          </tr>
                        </THead>
                        <TBody>
                          {villages.map((v) => (
                            <tr key={v.id} className={v.active ? '' : 'bg-slate-50/60'}>
                              <Td className="pl-12 font-medium text-ink">
                                <span className="flex items-center gap-1.5">
                                  <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                                  {v.name}
                                </span>
                              </Td>
                              <Td className="hidden text-xs md:table-cell">{v.aliases.join(', ') || '—'}</Td>
                              <Td className="hidden font-mono text-xs sm:table-cell">
                                {v.lat.toFixed(2)}, {v.lng.toFixed(2)}
                              </Td>
                              <Td className="text-right tabular-nums">{v.population.toLocaleString()}</Td>
                              <Td>
                                <Badge className={v.active ? 'bg-emerald-50 text-emerald-800 ring-emerald-600/20' : 'bg-slate-100 text-slate-700 ring-slate-500/20'}>{v.active ? 'Active' : 'Inactive'}</Badge>
                              </Td>
                              <Td className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setVillageModal({ village: v })} aria-label={`Edit ${v.name}`}>
                                    Edit
                                  </Button>
                                  <Button size="sm" variant="ghost" icon={<Power className="h-3.5 w-3.5" />} onClick={() => toggleVillage.mutate(v)} aria-label={`${v.active ? 'Disable' : 'Enable'} ${v.name}`}>
                                    {v.active ? 'Disable' : 'Enable'}
                                  </Button>
                                </div>
                              </Td>
                            </tr>
                          ))}
                        </TBody>
                      </Table>
                    ))}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <WardModal open={!!wardModal} ward={wardModal?.ward ?? null} onClose={() => setWardModal(null)} />
      <VillageModal open={!!villageModal} village={villageModal?.village ?? null} wardId={villageModal?.wardId} wards={data?.wards ?? []} onClose={() => setVillageModal(null)} />
    </>
  );
}
