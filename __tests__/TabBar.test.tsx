import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import TabsLayout from '../app/(tabs)/_layout';
import TabsBrands from '../app/(tabs)/brands';
import Home from '../app/(tabs)/index';
import Rank from '../app/(tabs)/rank';
import Wallet from '../app/(tabs)/wallet';
import Session from '../app/session';

// Real components mounted via renderRouter's in-memory context (its own root
// layout wraps them). We avoid `renderRouter('app')` because the real root
// layout imports the Tailwind `global.css`, which jest cannot parse — the
// in-memory map exercises the same TabBar + navigation behaviour without it.
const tabsMap = {
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': Home,
  '(tabs)/brands': TabsBrands,
  '(tabs)/rank': Rank,
  '(tabs)/wallet': Wallet,
  session: Session,
};

async function renderTabs() {
  const result = renderRouter(tabsMap, { initialUrl: '/(tabs)' });
  await act(async () => {});
  return result;
}

describe('TabBar', () => {
  it('renders all four tab cells', async () => {
    await renderTabs();

    for (const label of ['Home', 'Brands', 'Rank', 'Wallet']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('marks Home active on the tabs entry and applies active styling', async () => {
    await renderTabs();

    expect(screen.getByLabelText('Home').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Rank').props.accessibilityState.selected).toBe(false);

    // Active label = 700 ink; inactive = 500 muted.
    expect(screen.getByText('Home').props.className).toContain('font-grotesk-bold');
    expect(screen.getByText('Home').props.className).toContain('text-ink');
    expect(screen.getByText('Rank').props.className).toContain('font-grotesk-medium');
    expect(screen.getByText('Rank').props.className).toContain('text-muted-2');
  });

  it('moves the active cell (state + styling) when another tab is pressed', async () => {
    await renderTabs();

    fireEvent.press(screen.getByLabelText('Rank'));
    await act(async () => {});

    expect(screen.getByLabelText('Rank').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Home').props.accessibilityState.selected).toBe(false);
    expect(screen.getByText('Rank').props.className).toContain('font-grotesk-bold');
    expect(screen.getByText('Home').props.className).toContain('text-muted-2');
    // The Rank screen is now shown.
    expect(screen.getByText('rank')).toBeTruthy();
  });

  it('pressing the REC FAB navigates to the session route', async () => {
    const result = await renderTabs();

    fireEvent.press(screen.getByLabelText('Start recording session'));
    await act(async () => {});

    expect(result.getPathname()).toBe('/session');
  });

  it('has a center gap cell and ≥44px tap targets', async () => {
    await renderTabs();

    expect(screen.getByTestId('tab-center-gap')).toBeTruthy();

    for (const label of ['Home', 'Brands', 'Rank', 'Wallet']) {
      const cell = screen.getByLabelText(label);
      const style = Array.isArray(cell.props.style)
        ? Object.assign({}, ...cell.props.style)
        : cell.props.style;
      expect(style.minHeight).toBe(44);
    }
  });
});
