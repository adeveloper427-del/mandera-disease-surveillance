import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronLeft, Signal, Wifi, BatteryMedium } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Bubble {
  id: string;
  /** "sent" = typed by the resident; "received" = reply from the system. */
  side: 'sent' | 'received';
  text: string;
  time?: string;
  meta?: ReactNode;
  tone?: 'default' | 'error' | 'success';
}

/** Generic SMS phone mockup. Purely presentational. */
export function PhoneFrame({
  contact,
  subtitle,
  bubbles,
  composer,
  typing,
  className,
  compact,
}: {
  contact: string;
  subtitle?: string;
  bubbles: Bubble[];
  composer?: ReactNode;
  typing?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [bubbles.length, typing]);

  return (
    <div
      className={cn(
        'relative mx-auto w-full rounded-[2.5rem] bg-slate-900 p-2.5 shadow-2xl ring-1 ring-slate-800',
        compact ? 'max-w-[300px]' : 'max-w-[360px]',
        className,
      )}
    >
      <div className="flex flex-col overflow-hidden rounded-[2rem] bg-[#f4f6f8]" style={{ height: compact ? 520 : 640 }}>
        {/* status bar */}
        <div className="flex items-center justify-between bg-white px-6 pb-1 pt-3 text-[11px] font-semibold text-ink" aria-hidden>
          <span>9:41</span>
          <span className="absolute left-1/2 top-3.5 h-5 w-20 -translate-x-1/2 rounded-full bg-slate-900" />
          <span className="flex items-center gap-1">
            <Signal className="h-3 w-3" />
            <Wifi className="h-3 w-3" />
            <BatteryMedium className="h-3.5 w-3.5" />
          </span>
        </div>
        {/* header */}
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 pb-2.5 pt-1.5">
          <ChevronLeft className="h-5 w-5 text-brand-600" aria-hidden />
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white" aria-hidden>
            MS
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-ink">{contact}</p>
            {subtitle && <p className="truncate text-[11px] text-ink-muted">{subtitle}</p>}
          </div>
        </div>
        {/* messages */}
        <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto px-3 py-4" aria-live="polite" aria-label="SMS conversation">
          {bubbles.length === 0 && !typing && (
            <p className="mx-auto mt-10 max-w-[220px] text-center text-xs text-ink-muted">No messages yet. Type a report below and press Send.</p>
          )}
          {bubbles.map((b) => (
            <div key={b.id} className={cn('flex flex-col', b.side === 'sent' ? 'items-end' : 'items-start')}>
              <div
                className={cn(
                  'max-w-[82%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[13px] leading-snug shadow-sm',
                  b.side === 'sent'
                    ? 'rounded-br-md bg-brand-600 text-white'
                    : b.tone === 'error'
                      ? 'rounded-bl-md bg-rose-50 text-rose-900 ring-1 ring-rose-200'
                      : b.tone === 'success'
                        ? 'rounded-bl-md bg-white text-ink ring-1 ring-emerald-200'
                        : 'rounded-bl-md bg-white text-ink',
                )}
              >
                <span className="sr-only">{b.side === 'sent' ? 'Resident sent: ' : 'System replied: '}</span>
                {b.text}
              </div>
              {(b.time || b.meta) && (
                <span className="mt-0.5 px-1 text-[10px] text-ink-muted">
                  {b.time}
                  {b.meta && <> · {b.meta}</>}
                </span>
              )}
            </div>
          ))}
          {typing && (
            <div className="flex items-start" aria-label="System is replying">
              <div className="flex gap-1 rounded-2xl rounded-bl-md bg-white px-3.5 py-3 shadow-sm">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
            </div>
          )}
        </div>
        {composer && <div className="border-t border-slate-200 bg-white p-2.5">{composer}</div>}
      </div>
    </div>
  );
}
