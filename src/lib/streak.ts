/**
 * Pure streak math (mobile.md §1.4, plan §Session state machine). The SERVER is
 * the paying authority for streaks (apply_session_end), but the client needs to
 * render the 7 day-chips, pick the hint line, and know whether the +5% bonus is
 * active — all derived from the profile mirror. Day keys are device-local
 * calendar days. No RN imports.
 */

export type ChipState = 'done' | 'today' | 'missed' | 'future';

export interface DayChip {
  /** Single-letter weekday label, Monday-first: M T W T F S S. */
  label: string;
  state: ChipState;
}

export interface StreakProfile {
  streakCurrent: number;
  streakBest: number;
  /** device-local 'YYYY-MM-DD' of the last counted day, or null if never. */
  lastActiveDate: string | null;
}

const WEEK_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MS_PER_DAY = 86_400_000;

/** Streak >= 3 unlocks the +5% bonus (plan). */
export function bonusActive(streakCurrent: number): boolean {
  return streakCurrent >= 3;
}

/** Device-local 'YYYY-MM-DD' for a Date. */
export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Whole calendar days from `from` to `to` (both 'YYYY-MM-DD'); positive if `to` is later. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / MS_PER_DAY);
}

/** Monday-first weekday index (0=Mon .. 6=Sun) for a 'YYYY-MM-DD' day key. */
export function weekdayIndex(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  return (js + 6) % 7; // shift so Monday=0
}

/**
 * Compute the streak after counting a session on `todayKey`, given the previous
 * profile. Consecutive day -> +1; same day -> unchanged; a gap of >= 2 days or
 * no prior activity -> reset to 1. `streakBest` is monotonic.
 */
export function nextStreak(
  prev: Pick<StreakProfile, 'streakCurrent' | 'streakBest' | 'lastActiveDate'>,
  todayKey: string
): { streakCurrent: number; streakBest: number } {
  let current: number;
  if (prev.lastActiveDate === null) {
    current = 1;
  } else {
    const gap = daysBetween(prev.lastActiveDate, todayKey);
    if (gap === 0) current = prev.streakCurrent; // already counted today
    else if (gap === 1) current = prev.streakCurrent + 1;
    else current = 1; // gap >= 2 (or negative clock skew) resets
  }
  return { streakCurrent: current, streakBest: Math.max(prev.streakBest, current) };
}

/**
 * Derive the 7 Monday-first day-chips for the week containing `today`.
 * - future days (after today): 'future' (grey)
 * - today: 'done' if counted, else 'today' (dashed ?)
 * - past days this week: 'done' if part of the live streak, else 'missed'
 */
export function deriveDayChips(
  profile: StreakProfile,
  todayCounted: boolean,
  today: Date = new Date()
): DayChip[] {
  const todayKey = dayKey(today);
  const todayIdx = weekdayIndex(todayKey);

  // The streak spans `streakCurrent` days ending on the most-recent counted day.
  const lastDoneIdx = todayCounted ? todayIdx : todayIdx - 1;
  const firstDoneIdx = lastDoneIdx - (profile.streakCurrent - 1);

  return WEEK_LABELS.map((label, i) => {
    let state: ChipState;
    if (i > todayIdx) {
      state = 'future';
    } else if (i === todayIdx) {
      state = todayCounted ? 'done' : 'today';
    } else if (profile.streakCurrent > 0 && i >= firstDoneIdx && i <= lastDoneIdx) {
      state = 'done';
    } else {
      state = 'missed';
    }
    return { label, state };
  });
}

/** The single hint line under the streak card. */
export function streakHint(todayCounted: boolean): string {
  return todayCounted
    ? 'today counted — streak bonus +5% active'
    : '1 session today keeps it alive → +5% bonus';
}
