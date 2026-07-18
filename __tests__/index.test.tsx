import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import EntryScreen from '../app/index';
import TabsLayout from '../app/(tabs)/_layout';
import TabsBrands from '../app/(tabs)/brands';
import Home from '../app/(tabs)/index';
import Rank from '../app/(tabs)/rank';
import Wallet from '../app/(tabs)/wallet';

// The tabs layout declares all four screens, so the context must supply them
// all (as production does) — otherwise expo-router warns about extraneous ones.
const entryMap = {
  index: EntryScreen,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': Home,
  '(tabs)/brands': TabsBrands,
  '(tabs)/rank': Rank,
  '(tabs)/wallet': Wallet,
};

describe('entry screen (app/index)', () => {
  it('renders the wordmark and the "enter the nest" CTA', async () => {
    renderRouter(entryMap, { initialUrl: '/' });
    await act(async () => {});

    // Wordmark renders with accessibilityRole="header".
    expect(screen.getByRole('header')).toBeTruthy();
    expect(screen.getByText('enter the nest →')).toBeTruthy();
  });

  it('enters the tabs on CTA press', async () => {
    renderRouter(entryMap, { initialUrl: '/' });
    await act(async () => {});

    fireEvent.press(screen.getByText('enter the nest →'));
    await act(async () => {});

    expect(screen.getByText('home')).toBeTruthy();
  });
});
