import { useStore } from '../src/stores';

describe('ui slice — toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useStore.setState({ toast: undefined });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('shows a toast and auto-dismisses it after 2400ms', () => {
    useStore.getState().showToast('hi');
    expect(useStore.getState().toast?.message).toBe('hi');

    jest.advanceTimersByTime(2399);
    expect(useStore.getState().toast).toBeDefined();

    jest.advanceTimersByTime(1);
    expect(useStore.getState().toast).toBeUndefined();
  });

  it('is single-instance: a new toast replaces the old and gets a fresh id', () => {
    useStore.getState().showToast('first');
    const firstId = useStore.getState().toast!.id;

    useStore.getState().showToast('second');
    const current = useStore.getState().toast!;

    expect(current.message).toBe('second');
    expect(current.id).not.toBe(firstId);
  });

  it('resets the auto-dismiss timer when a new toast replaces the old', () => {
    useStore.getState().showToast('first');
    // Advance most of the way through the first toast's lifetime...
    jest.advanceTimersByTime(2000);

    // ...then replace it. The dismiss timer must restart from 0.
    useStore.getState().showToast('second');

    jest.advanceTimersByTime(2399);
    expect(useStore.getState().toast?.message).toBe('second');

    jest.advanceTimersByTime(1);
    expect(useStore.getState().toast).toBeUndefined();
  });
});
