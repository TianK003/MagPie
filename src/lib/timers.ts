/**
 * Injectable timer + clock seam. Everything time-based in `src/lib/` takes a
 * `Timers` + `now()` so tests drive it with jest fake timers and nothing calls
 * a global directly. Defaults delegate to the CURRENT globals (so a machine
 * constructed after `jest.useFakeTimers()` still uses the faked timers).
 */

export interface Timers {
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

/** Opaque handle — number in the browser/RN, object under Node. */
export type TimerHandle = ReturnType<typeof setTimeout>;

export const realTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle),
};

export const realNow = (): number => Date.now();
