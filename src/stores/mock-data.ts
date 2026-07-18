/**
 * Mock fixtures for screens T7-T10 to render before server wiring (T6/T13).
 * The 3 sponsor campaigns MATCH the prod seed (plan §Seed, REVIEW-DELTAS): all
 * 5¢, cap 20/day, cooldown 60s, no weekend multiplier. Everything else is a
 * small believable placeholder that the real slices overwrite once wired.
 */

import type {
  Badge,
  Campaign,
  LeaderboardRow,
  LedgerEntry,
  Profile,
} from '../types/domain';

/** ElevenLabs / OpenAI / Anthropic — company names only, per the prod seed. */
export const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    category: 'AI voice',
    rateCents: 5,
    capPerDay: 20,
    multiplier: 1,
    minLevel: 1,
    keywords: ['elevenlabs', 'eleven labs'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    category: 'AI research',
    rateCents: 5,
    capPerDay: 20,
    multiplier: 1,
    minLevel: 1,
    keywords: ['openai', 'open ai'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    category: 'AI research',
    rateCents: 5,
    capPerDay: 20,
    multiplier: 1,
    minLevel: 1,
    keywords: ['anthropic'],
  },
];

export const MOCK_PROFILE: Profile = {
  id: 'mock-user',
  displayName: 'you',
  streakCurrent: 3,
  streakBest: 7,
  level: 2,
  inviteCode: 'MAGPIE7',
  lastActiveDate: null,
  payoutMethod: null,
};

export const MOCK_LEADERBOARD: LeaderboardRow[] = [
  { userId: 'u1', displayName: 'nadia', weekEarnCents: 340, rank: 1, isSelf: false },
  { userId: 'u2', displayName: 'theo', weekEarnCents: 285, rank: 2, isSelf: false },
  { userId: 'mock-user', displayName: 'you', weekEarnCents: 215, rank: 3, isSelf: true },
  { userId: 'u3', displayName: 'priya', weekEarnCents: 160, rank: 4, isSelf: false },
];

export const MOCK_BADGES: Badge[] = [
  { id: 'first_fiver', name: 'first fiver', earned: true },
  { id: 'chatterbox', name: 'chatterbox', earned: false },
  { id: 'brand_loyalist', name: 'brand loyalist', earned: false },
];

export const MOCK_LEDGER: LedgerEntry[] = [
  { id: 'l1', amountCents: 5, label: 'ElevenLabs mention', createdAt: '2026-07-17T14:02:00Z' },
  { id: 'l2', amountCents: 5, label: 'Anthropic mention', createdAt: '2026-07-17T14:05:00Z' },
  { id: 'l3', amountCents: 5, label: 'OpenAI mention', createdAt: '2026-07-16T19:40:00Z' },
];

export const MOCK_BALANCE_CENTS = 215;
export const MOCK_WEEK_EARN_CENTS = 215;
