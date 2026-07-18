import { MOCK_CAMPAIGNS, MOCK_PROFILE } from '../src/stores/mock-data';
import { useStore } from '../src/stores';

function reset() {
  useStore.setState({
    authStatus: 'loading',
    profile: undefined,
    campaigns: [],
    optedIn: new Set<string>(),
    balanceCents: 0,
    weekEarnCents: 0,
    history: [],
    payoutPending: false,
    leaderboard: [],
    badges: [],
    dayChips: [],
  });
  useStore.getState().resetSession();
}

beforeEach(reset);

describe('brands slice', () => {
  it('toggles opt-in optimistically', async () => {
    useStore.getState().setCampaigns(MOCK_CAMPAIGNS);
    await useStore.getState().toggleOptIn('anthropic');
    expect(useStore.getState().optedIn.has('anthropic')).toBe(true);
    await useStore.getState().toggleOptIn('anthropic');
    expect(useStore.getState().optedIn.has('anthropic')).toBe(false);
  });

  it('rolls back the optimistic toggle when persist rejects', async () => {
    const failing = () => Promise.reject(new Error('network'));
    await expect(useStore.getState().toggleOptIn('openai', failing)).rejects.toThrow('network');
    // Rolled back to not-opted-in.
    expect(useStore.getState().optedIn.has('openai')).toBe(false);
  });

  it('keeps the optimistic toggle when persist resolves', async () => {
    await useStore.getState().toggleOptIn('openai', () => Promise.resolve());
    expect(useStore.getState().optedIn.has('openai')).toBe(true);
  });
});

describe('session slice', () => {
  it('patches and wipes the session mirror', () => {
    useStore.getState().setSession({ phase: 'recording', sessEarnCents: 15, mentionCount: 3 });
    expect(useStore.getState().session.sessEarnCents).toBe(15);
    useStore.getState().resetSession();
    expect(useStore.getState().session.phase).toBe('idle');
    expect(useStore.getState().session.sessEarnCents).toBe(0);
  });
});

describe('wallet slice', () => {
  it('optimistic cashout resets balance and prepends a debit row', () => {
    useStore.getState().setWallet({ balanceCents: 500, history: [] });
    useStore.getState().optimisticCashout({
      id: 'p1',
      amountCents: -500,
      label: 'cash out',
      createdAt: '2026-07-18T00:00:00Z',
    });
    expect(useStore.getState().balanceCents).toBe(0);
    expect(useStore.getState().payoutPending).toBe(true);
    expect(useStore.getState().history[0].amountCents).toBe(-500);
  });
});

describe('social slice', () => {
  it('derives day-chips from the profile via streak.ts', () => {
    useStore
      .getState()
      .refreshDayChips(MOCK_PROFILE, true, new Date(2026, 6, 15)); // Wed, streak 3 counted
    const chips = useStore.getState().dayChips;
    expect(chips).toHaveLength(7);
    expect(chips[2].state).toBe('done'); // Wednesday counted
  });
});

describe('auth slice', () => {
  it('sets status/profile and resets on sign-out', () => {
    useStore.getState().setAuthStatus('ready');
    useStore.getState().setProfile(MOCK_PROFILE);
    expect(useStore.getState().authStatus).toBe('ready');
    useStore.getState().signOutReset();
    expect(useStore.getState().authStatus).toBe('signedOut');
    expect(useStore.getState().profile).toBeUndefined();
  });
});
