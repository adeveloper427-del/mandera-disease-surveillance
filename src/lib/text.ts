/** Dependency-free text helpers, shared by the browser and the Supabase Edge Function. */

let counter = 0;
/** Short unique id for client/mock records. The real backend issues its own ids. */
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}
