import { render, screen } from '@testing-library/react-native';

import Index from '../app/index';

describe('dev gallery (app/index)', () => {
  it('renders the primitive gallery: wordmark, type scale and button variants', () => {
    render(<Index />);

    // Type-scale sample rows.
    expect(screen.getByText('42 hero')).toBeTruthy();
    expect(screen.getByText('15 body — space grotesk')).toBeTruthy();

    // The three Button variants + the demo triggers.
    expect(screen.getByText('dark')).toBeTruthy();
    expect(screen.getByText('outline')).toBeTruthy();
    expect(screen.getByText('gated')).toBeTruthy();
    expect(screen.getByText('show toast')).toBeTruthy();
    expect(screen.getByText('open sheet')).toBeTruthy();
  });
});
