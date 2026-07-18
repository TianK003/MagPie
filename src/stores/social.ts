import type { StateCreator } from 'zustand';

import { deriveDayChips, type DayChip } from '../lib/streak';
import type { Badge, LeaderboardRow, Profile } from '../types/domain';
import type { Store } from './index';

export interface SocialSlice {
  /** Weekly leaderboard view rows. Server truth; also updates via Broadcast. */
  leaderboard: LeaderboardRow[];
  badges: Badge[];
  inviteCode?: string;
  /** 7 Monday-first day-chips, derived via streak.ts. */
  dayChips: DayChip[];
  setLeaderboard: (rows: LeaderboardRow[]) => void;
  setBadges: (badges: Badge[]) => void;
  setInviteCode: (code: string) => void;
  /** Recompute the day-chips from the profile + whether today has a counted session. */
  refreshDayChips: (profile: Profile, todayCounted: boolean, today?: Date) => void;
}

export const createSocialSlice: StateCreator<Store, [], [], SocialSlice> = (set) => ({
  leaderboard: [],
  badges: [],
  inviteCode: undefined,
  dayChips: [],
  setLeaderboard: (leaderboard) => set({ leaderboard }),
  setBadges: (badges) => set({ badges }),
  setInviteCode: (inviteCode) => set({ inviteCode }),
  refreshDayChips: (profile, todayCounted, today) =>
    set({
      dayChips: deriveDayChips(
        {
          streakCurrent: profile.streakCurrent,
          streakBest: profile.streakBest,
          lastActiveDate: profile.lastActiveDate,
        },
        todayCounted,
        today
      ),
    }),
});
