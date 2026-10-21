import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, Copy, KeyRound, MoreVertical, Pencil, Power, UserPlus, Users, X } from 'lucide-react';
import type { User } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useRefData, useUsers } from '@/hooks/queries';
import { userService } from '@/services';
import { errorMessage } from '@/services/apiClient';
import { formatPhone, relativeTime } from '@/lib/format';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SearchInput, Select } from '@/components/ui/forms';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Dropdown, MenuItem } from '@/components/ui/Tabs';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states';
import { TBody, THead, Table, Td, Th } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { UserFormModal } from '@/components/admin/UserFormModal';

type Action = 'status' | 'reset' | 'approve' | 'reject';

const STATUS_BADGE: Record<User['status'], { label: string; className: string; dot: string }> = {
  pending: { label: 'Pending approval', className: 'bg-amber-50 text-amber-800 ring-amber-600/20', dot: 'bg-amber-500' },
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20', dot: 'bg-emerald-500' },
  disabled: { label: 'Disabled', className: 'bg-slate-100 text-slate-700 ring-slate-500/20', dot: 'bg-slate-400' },
};

function confirmCopy(c: { type: Action; user: User } | null): {
  title: string;
  confirmLabel: string;
  message: string;
  tone: 'primary' | 'danger' | 'success';
} {
  const name = c?.user.name ?? '';
  switch (c?.type) {
    case 'approve':
      return { title: 'Approve account?', confirmLabel: 'Approve', tone: 'success', message: `${name} will be able to sign in as a health officer for the wards they selected.` };
    case 'reject':
      return { title: 'Reject request?', confirmLabel: 'Reject request', tone: 'danger', message: `The account request from ${name} will be deleted. They can register again later.` };
    case 'reset':
      return { title: 'Reset password?', confirmLabel: 'Reset password', tone: 'primary', message: `A new temporary password will be generated for ${name}. Their current password will stop working.` };
    default:
      return c?.user.status === 'active'
        ? { title: 'Disable account?', confirmLabel: 'Disable account', tone: 'danger', message: `${name} will be signed out and will no longer be able to sign in. Their reports and history are kept.` }
        : { title: 'Enable account?', confirmLabel: 'Enable account', tone: 'primary', message: `${name} will be able to sign in again.` };
  }
}

export function UsersPage() {
  const { user: me } = useAuth();
  const users = useUsers();
  const ref = useRefData();
  const qc = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [params] = useSearchParams();
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [editing, setEditing] = useState<User | null | undefined>(undefined);
  const [confirm, setConfirm] = useState<{ type: Action; user: User } | null>(null);
  const [temp, setTemp] = useState<{ user: User; password: string } | null>(null);

  const act = useMutation({
    mutationFn: async (c: { type: Action; user: User }) => {
      if (c.type === 'approve') return { user: await userService.approve(c.user.id), password: null };
      if (c.type === 'reject') {
        await userService.reject(c.user.id);
        return { user: { ...c.user, status: 'disabled' as const }, password: null };
      }
      if (c.type === 'status') return { user: await userService.setStatus(c.user.id, c.user.status === 'active' ? 'disabled' : 'active'), password: null };
      return { user: c.user, password: (await userService.resetPassword(c.user.id)).temporaryPassword };
    },
    onSuccess: (res, c) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['officers'] });
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ['analytics', 'admin'] });
      if (res.password) setTemp({ user: c.user, password: res.password });
      else if (c.type === 'approve') toast.success('Account approved', `${c.user.name} can now sign in.`);
      else if (c.type === 'reject') toast.success('Request rejected', `The request from ${c.user.name} was removed.`);
      else toast.success(res.user.status === 'active' ? 'Account enabled' : 'Account disabled', res.user.name);
    },
    onError: (err) => toast.error('Action failed', errorMessage(err)),
  });

  const pending = (users.data ?? []).filter((u) => u.status === 'pending');
  const list = (users.data ?? []).filter((u) => {
    const s = search.toLowerCase();
    return (
      (!s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s)) &&
      (!role || u.role === role) &&
      (!status || u.status === status)
    );
  });

  return (
    <>
      <PageHeader
        title="Users"
        description="Manage administrator and health officer accounts, roles, ward assignments and access."
        actions={
          <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setEditing(null)}>
            Add user
          </Button>
        }
      />
      {pending.length > 0 && (
        <Card className="mb-6 ring-amber-200">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" aria-hidden /> Health officers awaiting approval ({pending.length})
              </span>
            }
            description="These people registered themselves. They cannot sign in until you approve them."
          />
          <ul className="divide-y divide-slate-100">
            {pending.map((u) => (
              <li key={u.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{u.name}</p>
                  <p className="text-xs text-ink-muted">
                    {u.email} · {formatPhone(u.phone)} · {u.title}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    Wards: {u.wardIds.map(ref.wardById).join(', ') || '—'} · requested {relativeTime(u.createdAt)}
                  </p>
                  <p className={`mt-1 text-xs font-medium ${u.emailVerified === false ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {u.emailVerified === false ? 'Email not verified yet: approval unlocks after they enter their code' : 'Email verified'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="success" icon={<Check className="h-3.5 w-3.5" />} disabled={u.emailVerified === false} title={u.emailVerified === false ? 'Waiting for email verification' : undefined} onClick={() => setConfirm({ type: 'approve', user: u })}>
                    Approve
                  </Button>
                  <Button size="sm" variant="secondary" icon={<X className="h-3.5 w-3.5" />} onClick={() => setConfirm({ type: 'reject', user: u })}>
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <SearchInput className="sm:max-w-sm sm:flex-1" value={search} onChange={setSearch} placeholder="Search by name or email" label="Search users" />
          <Select aria-label="Filter by role" className="sm:w-48" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            <option value="admin">Administrator</option>
            <option value="officer">Health Officer</option>
          </Select>
          <Select aria-label="Filter by status" className="sm:w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            <option value="pending">Pending approval</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </Select>
        </div>
        {users.isLoading ? (
          <LoadingBlock rows={6} />
        ) : users.error ? (
          <ErrorState error={users.error} onRetry={() => users.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState icon={Users} title="No users match your filters" />
        ) : (
          <Table caption="User accounts">
            <THead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th className="hidden md:table-cell">Assigned location</Th>
                <Th>Status</Th>
                <Th className="hidden lg:table-cell">Last login</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {list.map((u) => (
                <tr key={u.id} className={u.status === 'disabled' ? 'bg-slate-50/60' : ''}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
                        {u.name
                          .split(' ')
                          .map((p) => p[0])
                          .slice(0, 2)
                          .join('')}
                      </span>
                      <div>
                        <p className="font-medium text-ink">
                          {u.name} {u.id === me?.id && <span className="text-xs font-normal text-ink-muted">(you)</span>}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {u.email}
                          {u.phone && ` · ${formatPhone(u.phone)}`}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <Badge className={u.role === 'admin' ? 'bg-violet-50 text-violet-800 ring-violet-600/20' : 'bg-sky-50 text-sky-800 ring-sky-600/20'}>
                      {u.role === 'admin' ? 'Administrator' : 'Health Officer'}
                    </Badge>
                  </Td>
                  <Td className="hidden whitespace-normal md:table-cell">{u.wardIds.length ? u.wardIds.map(ref.wardById).join(', ') : 'All wards'}</Td>
                  <Td>
                    <Badge className={STATUS_BADGE[u.status].className}>
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_BADGE[u.status].dot}`} aria-hidden />
                      {STATUS_BADGE[u.status].label}
                    </Badge>
                  </Td>
                  <Td className="hidden lg:table-cell">{u.lastLoginAt ? relativeTime(u.lastLoginAt) : 'Never'}</Td>
                  <Td className="text-right">
                    <Dropdown
                      label={`Actions for ${u.name}`}
                      trigger={({ toggle, open }) => (
                        <button onClick={toggle} aria-expanded={open} className="rounded-md p-1.5 text-ink-muted hover:bg-slate-100 hover:text-ink" aria-label={`Actions for ${u.name}`}>
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      )}
                    >
                      {(close) =>
                        u.status === 'pending' ? (
                          <div className="py-1">
                            <MenuItem icon={<Check className="h-4 w-4" />} onClick={() => { close(); setConfirm({ type: 'approve', user: u }); }}>
                              Approve account
                            </MenuItem>
                            <MenuItem danger icon={<X className="h-4 w-4" />} onClick={() => { close(); setConfirm({ type: 'reject', user: u }); }}>
                              Reject request
                            </MenuItem>
                          </div>
                        ) : (
                        <div className="py-1">
                          <MenuItem icon={<Pencil className="h-4 w-4" />} onClick={() => { close(); setEditing(u); }}>
                            Edit details & role
                          </MenuItem>
                          <MenuItem icon={<KeyRound className="h-4 w-4" />} onClick={() => { close(); setConfirm({ type: 'reset', user: u }); }}>
                            Reset password
                          </MenuItem>
                          <MenuItem
                            danger={u.status === 'active'}
                            disabled={u.id === me?.id}
                            icon={<Power className="h-4 w-4" />}
                            onClick={() => { close(); setConfirm({ type: 'status', user: u }); }}
                          >
                            {u.status === 'active' ? 'Disable account' : 'Enable account'}
                          </MenuItem>
                        </div>
                        )
                      }
                    </Dropdown>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <UserFormModal open={editing !== undefined} user={editing} onClose={() => setEditing(undefined)} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && act.mutate(confirm)}
        loading={act.isPending}
        {...confirmCopy(confirm)}
      />

      <Modal open={!!temp} onClose={() => setTemp(null)} title="Password reset" description={`Share the temporary password with ${temp?.user.name} securely.`} footer={<Button onClick={() => setTemp(null)}>Done</Button>}>
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
          <p className="font-mono text-lg font-semibold text-ink">{temp?.password}</p>
          <button
            type="button"
            className="rounded p-1 text-ink-muted hover:bg-slate-200"
            aria-label="Copy password"
            onClick={() => {
              if (temp) navigator.clipboard?.writeText(temp.password).catch(() => undefined);
              toast.info('Copied to clipboard');
            }}
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
      </Modal>
    </>
  );
}
