import { base64ToBytes, bytesToBase64 } from '../src/lib/base64';
import { ScriptedSttStream } from '../src/lib/stt/scripted';
import type { SttState } from '../src/lib/stt';
import { uuid4 } from '../src/lib/uuid';

describe('base64', () => {
  it('round-trips arbitrary bytes', () => {
    for (const bytes of [
      new Uint8Array([]),
      new Uint8Array([0]),
      new Uint8Array([0, 255, 128, 1, 2, 3]),
      new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]),
    ]) {
      expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
    }
  });
});

describe('uuid4', () => {
  it('produces a valid v4 uuid and is deterministic for a seeded rng', () => {
    const rng = () => 0.5;
    const id = uuid4(rng);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuid4(rng)).toBe(id);
  });
});

describe('ScriptedSttStream', () => {
  it('emits connecting/open then plays partials and finals on fake timers', () => {
    jest.useFakeTimers();
    const states: SttState[] = [];
    const partials: string[] = [];
    const finals: [string, number][] = [];
    const stream = new ScriptedSttStream({
      script: [
        { at: 1000, partial: 'so i' },
        { at: 2000, final: 'so i tried anthropic' },
      ],
    });
    stream.onStateChange((s) => states.push(s));
    stream.onPartial((t) => partials.push(t));
    stream.onFinal((t, ts) => finals.push([t, ts]));

    void stream.start();
    expect(states).toEqual(['connecting']); // 'open' is deferred to a 0ms timer

    jest.advanceTimersByTime(1000);
    expect(states).toEqual(['connecting', 'open']);
    expect(partials).toEqual(['so i']);
    jest.advanceTimersByTime(1000);
    expect(finals).toEqual([['so i tried anthropic', 2000]]);

    void stream.close();
    expect(states).toContain('closed');
    jest.useRealTimers();
  });
});
