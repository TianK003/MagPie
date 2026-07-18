import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { BackHandler } from 'react-native';

import OnboardingConsent from '../app/(onboarding)/consent';
import OnboardingLayout from '../app/(onboarding)/_layout';
import TabsBrands from '../app/(tabs)/brands';
import Home from '../app/(tabs)/index';
import TabsLayout from '../app/(tabs)/_layout';
import Rank from '../app/(tabs)/rank';
import Wallet from '../app/(tabs)/wallet';
import Session from '../app/session';
import Summary from '../app/summary';

describe('session + summary modal flow', () => {
  // Full tab set so the tabs layout has no extraneous screen declarations.
  const flowMap = {
    '(tabs)/_layout': TabsLayout,
    '(tabs)/index': Home,
    '(tabs)/brands': TabsBrands,
    '(tabs)/rank': Rank,
    '(tabs)/wallet': Wallet,
    session: Session,
    summary: Summary,
  };

  it('summary renders the Sheet content over the tabs', async () => {
    renderRouter(flowMap, { initialUrl: '/summary' });
    await act(async () => {});

    expect(screen.getByText('session complete')).toBeTruthy();
    expect(screen.getByText('Back to the nest')).toBeTruthy();
  });

  it('ending a session replaces it with the summary', async () => {
    const result = renderRouter(flowMap, { initialUrl: '/session' });
    await act(async () => {});

    fireEvent.press(screen.getByText('■ End session'));
    await act(async () => {});

    expect(result.getPathname()).toBe('/summary');
    expect(screen.getByText('Back to the nest')).toBeTruthy();
  });

  it('returns to the nest from the summary', async () => {
    const result = renderRouter(flowMap, { initialUrl: '/summary' });
    await act(async () => {});

    fireEvent.press(screen.getByText('Back to the nest'));
    await act(async () => {});

    // Lands on Home (the tabs entry).
    expect(screen.getByText('home')).toBeTruthy();
    expect(result.getPathname()).toBe('/');
  });
});

describe('onboarding is forward-only', () => {
  it('registers a hardware-back handler that swallows the event (returns true)', async () => {
    const spy = jest.spyOn(BackHandler, 'addEventListener');

    renderRouter(
      { '(onboarding)/_layout': OnboardingLayout, '(onboarding)/consent': OnboardingConsent },
      { initialUrl: '/(onboarding)/consent' }
    );
    await act(async () => {});

    const registration = spy.mock.calls.find(([event]) => event === 'hardwareBackPress');
    expect(registration).toBeTruthy();

    const handler = registration![1] as () => boolean;
    expect(handler()).toBe(true);

    spy.mockRestore();
  });
});
