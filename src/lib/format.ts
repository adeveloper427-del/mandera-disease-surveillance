const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const longDateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
const shortDayFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' });
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });

export const formatDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : '—');
export const formatLongDate = (iso: string | null | undefined) => (iso ? longDateFmt.format(new Date(iso)) : '—');
export const formatTime = (iso: string | null | undefined) => (iso ? timeFmt.format(new Date(iso)) : '—');
export const formatDateTime = (iso: string | null | undefined) =>
  iso ? `${formatDate(iso)}, ${formatTime(iso)}` : '—';
export const formatShortDay = (d: Date) => shortDayFmt.format(d);
export const formatMonth = (d: Date) => monthFmt.format(d);

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  if (diff < 45) return 'just now';
  const mins = Math.round(diff / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(iso);
}

/** yyyy-mm-dd in local time, for <input type="date"> and grouping. */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Monday-based start of week. */
export function startOfWeek(d = new Date()): Date {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

/** +254799012345 -> 0799 012 345 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('254') ? `0${digits.slice(3)}` : digits;
  if (local.length !== 10) return phone;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/** Hide the middle digits of a phone number in lists (personal data protection). */
export function maskPhone(phone: string): string {
  const f = formatPhone(phone);
  const parts = f.split(' ');
  if (parts.length !== 3) return f.replace(/\d(?=\d{3})/g, '•');
  return `${parts[0]} ••• ${parts[2]}`;
}

/** Accept 07XXXXXXXX / 01XXXXXXXX / +2547XXXXXXXX and return E.164, or null. */
export function toE164(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  if (/^\+254[17]\d{8}$/.test(digits)) return digits;
  if (/^254[17]\d{8}$/.test(digits)) return `+${digits}`;
  if (/^0[17]\d{8}$/.test(digits)) return `+254${digits.slice(1)}`;
  return null;
}

export function percent(part: number, whole: number): string {
  if (!whole) return '0%';
  return `${Math.round((part / whole) * 100)}%`;
}
