import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: 'at least 8 characters', test: (p) => p.length >= 8 },
  { label: 'an uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'a lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'a number', test: (p) => /\d/.test(p) },
];

export function passwordIssues(p: string) {
  return RULES.filter((r) => !r.test(p)).map((r) => r.label);
}

export function PasswordStrength({ password }: { password: string }) {
  const passed = RULES.filter((r) => r.test(password)).length;
  const colors = ['bg-slate-200', 'bg-rose-500', 'bg-amber-500', 'bg-sky-500', 'bg-emerald-600'];
  return (
    <div aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {RULES.map((_, i) => (
          <div key={i} className={cn('h-1.5 flex-1 rounded-full', i < passed ? colors[passed] : 'bg-slate-200')} />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
        {RULES.map((r) => {
          const ok = r.test(password);
          return (
            <li key={r.label} className={cn('flex items-center gap-1', ok ? 'text-emerald-700' : 'text-ink-muted')}>
              {ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
              <span>
                {r.label}
                <span className="sr-only">{ok ? ' (met)' : ' (not met)'}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
