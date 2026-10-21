import { useId } from 'react';
import { cn } from '@/lib/utils';

/** App icon: SMS bubble with a heartbeat line and an alert dot. Same artwork as public/favicon.svg. */
export function LogoMark({ className }: { className?: string }) {
  const gradient = `logo-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8', className)} aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f9e8f" />
          <stop offset="1" stopColor="#174a45" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gradient})`} />
      <path
        d="M9 8.5h13a3.5 3.5 0 0 1 3.5 3.5v6.5A3.5 3.5 0 0 1 22 22h-7.5L10 25.5V22H9a3.5 3.5 0 0 1-3.5-3.5V12A3.5 3.5 0 0 1 9 8.5z"
        fill="#fff"
      />
      <path d="M8.6 15.6h3l1.6-3.6 2.6 6.6 1.9-4.4 1.1 1.4h3.6" fill="none" stroke="#1f6f66" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25" cy="8.2" r="3.4" fill="#f26b4f" stroke="#fff" strokeWidth="1.6" />
    </svg>
  );
}

export function Logo({ light, compact }: { light?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      {!compact && (
        <div className="leading-tight">
          <p className={cn('text-sm font-semibold', light ? 'text-white' : 'text-ink')}>MSDSS</p>
          <p className={cn('text-[11px]', light ? 'text-brand-100' : 'text-ink-muted')}>Mandera South Disease Surveillance</p>
        </div>
      )}
    </div>
  );
}
