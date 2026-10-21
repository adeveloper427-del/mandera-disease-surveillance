import { Check, ChevronsUp, Inbox, MessageSquare, Search, Gavel, Archive, X } from 'lucide-react';
import type { Report } from '@/types';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Visual verification workflow:
 * New report -> Pending -> Under Review -> Decision (Verified/Rejected) -> Resident notified -> History
 */
export function WorkflowStepper({ report }: { report: Report }) {
  const reviewed = report.history.find((e) => e.type === 'status_changed' && e.message.includes('Under Review'));
  const decision = report.outcome;
  const notified = decision ? report.history.find((e) => e.type === 'sms_sent' && /Verification|Rejection/.test(e.message)) : null;
  const closed = report.status === 'closed';

  const steps = [
    { key: 'new', label: 'Report received', icon: Inbox, done: true, at: report.receivedAt },
    { key: 'pending', label: 'Pending', icon: Inbox, done: true, at: report.receivedAt, current: report.status === 'pending' },
    {
      key: 'review',
      label: 'Under review',
      icon: Search,
      done: !!reviewed || !!decision,
      at: reviewed?.at,
      current: report.status === 'under_review',
    },
    {
      key: 'decision',
      label: decision === 'rejected' ? 'Rejected' : decision === 'verified' ? 'Verified' : 'Officer decision',
      icon: decision === 'rejected' ? X : decision === 'verified' ? Check : Gavel,
      done: !!decision,
      at: report.decidedAt ?? undefined,
      tone: decision === 'rejected' ? 'rose' : 'emerald',
    },
    { key: 'sms', label: 'Resident notified', icon: MessageSquare, done: !!notified, at: notified?.at },
    { key: 'history', label: closed ? 'Closed' : 'Kept in history', icon: Archive, done: closed, at: closed ? report.updatedAt : undefined },
  ];

  return (
    <div>
      {report.status === 'escalated' && (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 text-xs font-medium text-violet-800 ring-1 ring-inset ring-violet-200">
          <ChevronsUp className="h-4 w-4" aria-hidden /> Escalated to the county team. The decision is pending their response.
        </p>
      )}
      <ol className="grid grid-cols-2 gap-y-5 sm:grid-cols-3 lg:grid-cols-6" aria-label="Verification workflow">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.key} className="relative flex flex-col items-center text-center">
              {i < steps.length - 1 && (
                <span
                  className={cn('absolute left-1/2 top-4 hidden h-0.5 w-full lg:block', steps[i + 1].done ? 'bg-brand-500' : 'bg-slate-200')}
                  aria-hidden
                />
              )}
              <span
                className={cn(
                  'relative z-10 flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-white',
                  s.done
                    ? s.tone === 'rose'
                      ? 'bg-rose-600 text-white'
                      : s.key === 'decision'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-brand-600 text-white'
                    : s.current
                      ? 'bg-amber-100 text-amber-800 ring-amber-50'
                      : 'bg-slate-100 text-slate-400',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className={cn('mt-2 text-xs font-semibold', s.done || s.current ? 'text-ink' : 'text-ink-muted')}>
                {s.label}
                <span className="sr-only">{s.done ? ' (complete)' : s.current ? ' (current step)' : ' (not reached)'}</span>
              </span>
              <span className="mt-0.5 text-[11px] text-ink-muted">{s.at ? formatDateTime(s.at) : s.current ? 'Current step' : '—'}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
