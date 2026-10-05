import type { AppState } from './types';

export function dateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

export function dayDiff(a: string, b: string): number {
  const one = new Date(`${a}T12:00:00`).getTime();
  const two = new Date(`${b}T12:00:00`).getTime();
  return Math.floor((two - one) / 86400000);
}

export function counts(state: AppState) {
  let known = 0, vague = 0, unknown = 0;
  for (const word of state.words) {
    const rating = state.progress[word.id]?.rating;
    if (rating === 'known') known++;
    else if (rating === 'vague') vague++;
    else if (rating === 'unknown') unknown++;
  }
  return { total: state.words.length, known, vague, unknown, unseen: state.words.length - known - vague - unknown, weak: vague + unknown };
}

export function planInfo(state: AppState) {
  if (!state.plan) return null;
  const c = counts(state);
  const elapsed = Math.max(0, dayDiff(state.plan.startDate, dateKey()));
  const day = Math.min(state.plan.days, elapsed + 1);
  const learningDays = Math.max(1, state.plan.days - state.plan.reviewDays);
  const isReviewPhase = day > learningDays;
  const screenedSince = Math.max(0, (c.total - c.unseen) - state.plan.initialScreened);
  const todayScreened = state.words.filter(w => state.progress[w.id]?.screenedAt === dateKey()).length;
  const screenedBeforeToday = Math.max(0, screenedSince - todayScreened);
  const expectedCumulative = Math.ceil(state.plan.initialUnseen * Math.min(day, learningDays) / learningDays);
  const targetToday = isReviewPhase ? 0 : Math.max(0, expectedCumulative - screenedBeforeToday);
  const endDate = addDays(state.plan.startDate, state.plan.days - 1);
  return { ...c, day, learningDays, isReviewPhase, screenedSince, todayScreened, targetToday, endDate };
}
