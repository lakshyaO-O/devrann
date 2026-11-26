export interface DailyChallenge {
  date: string;
  problemId: string;
  xpBonus: number;
  startAt?: string;
  endAt?: string;
  timeZone?: string;
}

export interface WeeklyChallenge {
  week: string;
  problemIds: string[];
  xpBonus: number;
  startAt?: string;
  endAt?: string;
  timeZone?: string;
}

const UTC_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_WEEK = /^(\d{4})-W(\d{2})$/;
const MAX_DAILY_XP = 1000;
const MAX_WEEKLY_XP = 5000;
const MAX_WEEKLY_PROBLEMS = 10;

export function getUtcDayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function getUtcDayRange(dayKey: string): { start: Date; end: Date } | null {
  if (!UTC_DATE.test(dayKey)) return null;
  const start = new Date(`${dayKey}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== dayKey) return null;
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function getIsoWeekKey(date: Date = new Date()): string {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - (utcDate.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function getIsoWeekRange(value: unknown): { startAt: string; endAt: string } | null {
  if (typeof value !== 'string') return null;
  const match = ISO_WEEK.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;

  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - ((januaryFourth.getUTCDay() + 6) % 7) + (week - 1) * 7);
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const actualWeek = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const actualKey = `${thursday.getUTCFullYear()}-W${String(actualWeek).padStart(2, '0')}`;
  if (actualKey !== value) return null;

  const end = new Date(monday);
  end.setUTCDate(monday.getUTCDate() + 7);
  return { startAt: monday.toISOString(), endAt: end.toISOString() };
}

function parseInstant(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function isDailyChallenge(value: unknown): value is DailyChallenge {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.date === 'string'
    && UTC_DATE.test(record.date)
    && typeof record.problemId === 'string'
    && record.problemId.length > 0
    && record.problemId.length <= 128
    && Number.isInteger(record.xpBonus)
    && (record.xpBonus as number) >= 0
    && (record.xpBonus as number) <= MAX_DAILY_XP;
}

export function isWeeklyChallenge(value: unknown): value is WeeklyChallenge {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.week === 'string'
    && getIsoWeekRange(record.week) !== null
    && Array.isArray(record.problemIds)
    && record.problemIds.length >= 1
    && record.problemIds.length <= MAX_WEEKLY_PROBLEMS
    && new Set(record.problemIds).size === record.problemIds.length
    && record.problemIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 128)
    && Number.isInteger(record.xpBonus)
    && (record.xpBonus as number) >= 0
    && (record.xpBonus as number) <= MAX_WEEKLY_XP;
}

export function getDailyWindow(challenge: DailyChallenge): { start: Date; end: Date } | null {
  const start = parseInstant(challenge.startAt);
  const end = parseInstant(challenge.endAt);
  if (start && end && start < end) return { start, end };
  return getUtcDayRange(challenge.date);
}

export function getWeeklyWindow(challenge: WeeklyChallenge): { start: Date; end: Date } | null {
  const start = parseInstant(challenge.startAt);
  const end = parseInstant(challenge.endAt);
  if (start && end && start < end) return { start, end };
  const range = getIsoWeekRange(challenge.week);
  return range ? { start: new Date(range.startAt), end: new Date(range.endAt) } : null;
}

export function selectDailyChallenge(
  challenges: unknown,
  now: Date = new Date(),
): DailyChallenge | null {
  if (!Array.isArray(challenges)) return null;
  const today = getUtcDayKey(now);
  const candidates = challenges.filter(isDailyChallenge);
  const scheduled = candidates.find((challenge) => {
    const window = getDailyWindow(challenge);
    return window !== null && now >= window.start && now < window.end;
  });
  if (scheduled) return scheduled;
  return candidates.find((challenge) => challenge.date === today) ?? null;
}

export function isWeeklyActive(challenge: WeeklyChallenge, now: Date = new Date()): boolean {
  const window = getWeeklyWindow(challenge);
  if (window) return now >= window.start && now < window.end;
  return challenge.week === getIsoWeekKey(now);
}

export function countSolvedFromAccepted(
  acceptedProblemIds: ReadonlySet<string>,
  requiredProblemIds: readonly string[],
): string[] {
  return requiredProblemIds.filter((id) => acceptedProblemIds.has(id));
}
