import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '../src/components/Button';

describe('Button', () => {
  it('fires onPress for a normal (dark) button', () => {
    const onPress = jest.fn();
    render(<Button label="go" variant="dark" onPress={onPress} />);

    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a gated button is styled disabled but STILL pressable — fires onGatedPress, not onPress', () => {
    const onPress = jest.fn();
    const onGatedPress = jest.fn();
    render(
      <Button
        label="continue"
        variant="disabled"
        gated
        onPress={onPress}
        onGatedPress={onGatedPress}
      />
    );

    fireEvent.press(screen.getByRole('button'));
    expect(onGatedPress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('a hard-disabled button is inert — no press fires', () => {
    const onPress = jest.fn();
    render(<Button label="nope" disabled onPress={onPress} />);

    fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
