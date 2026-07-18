import {
  bonusActive,
  dayKey,
  daysBetween,
  deriveDayChips,
  nextStreak,
  streakHint,
  weekdayIndex,
} from '../src/lib/streak';

describe('streak day math', () => {
  it('computes device-local day keys and diffs', () => {
    expect(dayKey(new Date(2026, 6, 18))).toBe('2026-07-18');
    expect(daysBetween('2026-07-15', '2026-07-18')).toBe(3);
    expect(daysBetween('2026-07-18', '2026-07-18')).toBe(0);
  });

  it('indexes weekdays Monday-first', () => {
    expect(weekdayIndex('2026-07-13')).toBe(0); // Monday
    expect(weekdayIndex('2026-07-19')).toBe(6); // Sunday
  });
});

describe('nextStreak', () => {
  it('increments on a consecutive day', () => {
    const r = nextStreak({ streakCurrent: 4, streakBest: 5, lastActiveDate: '2026-07-17' }, '2026-07-18');
    expect(r).toEqual({ streakCurrent: 5, streakBest: 5 });
  });

  it('resets on a gap of 2+ days', () => {
    const r = nextStreak({ streakCurrent: 9, streakBest: 9, lastActiveDate: '2026-07-15' }, '2026-07-18');
    expect(r.streakCurrent).toBe(1);
    expect(r.streakBest).toBe(9);
  });

  it('is unchanged on the same day', () => {
    const r = nextStreak({ streakCurrent: 3, streakBest: 3, lastActiveDate: '2026-07-18' }, '2026-07-18');
    expect(r.streakCurrent).toBe(3);
  });

  it('starts at 1 with no prior activity', () => {
    expect(nextStreak({ streakCurrent: 0, streakBest: 0, lastActiveDate: null }, '2026-07-18')).toEqual({
      streakCurrent: 1,
      streakBest: 1,
    });
  });
});

describe('bonusActive', () => {
  it('unlocks at streak >= 3', () => {
    expect(bonusActive(2)).toBe(false);
    expect(bonusActive(3)).toBe(true);
  });
});

describe('deriveDayChips', () => {
  it('marks past streak days done, missed days grey, today dashed, future grey', () => {
    // Thursday 2026-07-16 (weekday index 3), not counted yet, streak of 1 ending Wed.
    const chips = deriveDayChips(
      { streakCurrent: 1, streakBest: 5, lastActiveDate: '2026-07-15' },
      false,
      new Date(2026, 6, 16)
    );
    // Mon/Tue missed (before the streak), Wed done, Thu today (dashed), Fri-Sun future.
    expect(chips.map((c) => c.state)).toEqual([
      'missed',
      'missed',
      'done',
      'today',
      'future',
      'future',
      'future',
    ]);
    expect(chips.map((c) => c.label)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  });

  it('marks today done once counted', () => {
    // Wednesday 2026-07-15 (index 2), counted today, streak of 3 ending today.
    const chips = deriveDayChips(
      { streakCurrent: 3, streakBest: 5, lastActiveDate: '2026-07-15' },
      true,
      new Date(2026, 6, 15)
    );
    // Mon/Tue/Wed done, Thu-Sun future.
    expect(chips.map((c) => c.state)).toEqual([
      'done',
      'done',
      'done',
      'future',
      'future',
      'future',
      'future',
    ]);
  });
});

describe('streakHint', () => {
  it('selects the hint line by todayCounted', () => {
    expect(streakHint(false)).toBe('1 session today keeps it alive → +5% bonus');
    expect(streakHint(true)).toBe('today counted — streak bonus +5% active');
  });
});
