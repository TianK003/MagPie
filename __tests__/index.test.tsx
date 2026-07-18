import { render, screen } from '@testing-library/react-native';

import Index from '../app/index';

describe('placeholder index screen', () => {
  it('renders the "magpie" placeholder text', () => {
    render(<Index />);
    expect(screen.getByText('magpie')).toBeTruthy();
  });
});
