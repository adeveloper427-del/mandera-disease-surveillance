import type { Alert, Disease, Report } from '@/types';

export type StoredAlertState = Pick<Alert, 'status' | 'note' | 'updatedBy' | 'updatedAt'>;

/**
 * Simulated hotspot / suspected-outbreak detection.
 *
 * For each active disease, count non-rejected reports per village inside the
 * disease's alert window:
 *   count >= threshold                     -> "outbreak" (potential outbreak alert)
 *   count >= max(3, ceil(threshold / 2))   -> "hotspot"  (potential hotspot)
 *
 * These are signals for a health officer to investigate, never confirmed outbreaks.
 */
export function detectAlerts(
  reports: Report[],
  diseases: Disease[],
  stored: Record<string, StoredAlertState>,
  now = Date.now(),
): Alert[] {
  const alerts: Alert[] = [];
  for (const disease of diseases) {
    if (!disease.active) continue;
    const since = now - disease.alertWindowHours * 3_600_000;
    const groups = new Map<string, Report[]>();
    for (const r of reports) {
      if (r.diseaseId !== disease.id || r.status === 'rejected') continue;
      if (new Date(r.receivedAt).getTime() < since) continue;
      const list = groups.get(r.villageId) ?? [];
      list.push(r);
      groups.set(r.villageId, list);
    }
    const hotspotMin = Math.max(3, Math.ceil(disease.alertThreshold / 2));
    for (const [villageId, list] of groups) {
      if (list.length < hotspotMin) continue;
      const sorted = [...list].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
      const id = `${disease.id}:${villageId}`;
      const lastAt = sorted[sorted.length - 1].receivedAt;
      const prev = stored[id];
      // A closed alert re-opens if new reports arrive after it was closed.
      const closed = prev && (prev.status === 'dismissed' || prev.status === 'resolved');
      const reopened = closed && prev.updatedAt !== null && lastAt > prev.updatedAt;
      alerts.push({
        id,
        diseaseId: disease.id,
        villageId,
        level: list.length >= disease.alertThreshold ? 'outbreak' : 'hotspot',
        count: list.length,
        threshold: disease.alertThreshold,
        windowHours: disease.alertWindowHours,
        firstAt: sorted[0].receivedAt,
        lastAt,
        reportIds: sorted.map((r) => r.id),
        status: prev && !reopened ? prev.status : 'new',
        note: prev?.note ?? null,
        updatedBy: prev?.updatedBy ?? null,
        updatedAt: prev?.updatedAt ?? null,
      });
    }
  }
  return alerts.sort((a, b) => {
    if (a.level !== b.level) return a.level === 'outbreak' ? -1 : 1;
    return b.count / b.threshold - a.count / a.threshold;
  });
}

export const isOpenAlert = (a: Alert) => a.status !== 'dismissed' && a.status !== 'resolved';
