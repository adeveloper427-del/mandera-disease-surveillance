import type { Disease, Priority } from '@/types';

export const PRIORITY_ORDER: Priority[] = ['low', 'medium', 'high', 'critical'];

export function priorityRank(p: Priority) {
  return PRIORITY_ORDER.indexOf(p);
}

/**
 * Simulated priority rules. The backend will own the real rules; keeping
 * them in one pure function makes that hand-over a single port.
 *
 * 1. Start from the disease's base priority.
 * 2. +1 level when the person is in a vulnerable age group (under 5 or 65+).
 * 3. +1 level when the report pushes the village over the disease alert threshold.
 */
export function computePriority(input: {
  disease: Disease;
  age: number;
  recentSameVillageCount: number;
}): { priority: Priority; reasons: string[] } {
  const { disease, age, recentSameVillageCount } = input;
  let level = priorityRank(disease.basePriority);
  const reasons = [`${disease.name} base priority: ${disease.basePriority}`];

  if (age < 5 || age >= 65) {
    level += 1;
    reasons.push(age < 5 ? 'Child under 5 years' : 'Adult aged 65 or over');
  }
  if (recentSameVillageCount >= disease.alertThreshold) {
    level += 1;
    reasons.push(
      `${recentSameVillageCount} reports from this village within ${disease.alertWindowHours} h (threshold ${disease.alertThreshold})`,
    );
  }
  const priority = PRIORITY_ORDER[Math.min(level, PRIORITY_ORDER.length - 1)];
  return { priority, reasons };
}
