import { describe, expect, it } from 'vitest';
import { backAction, secondExitPress } from './native-back';

describe('Android system Back', () => {
  it('closes an open sheet first', () => {
    expect(backAction('/', {unmuteSheet:'sheet-1'}, true)).toBe('history');
  });
  it('minimizes only from «Сегодня»', () => {
    expect(backAction('/', null, true)).toBe('minimize');
  });
  it('goes from another tab to «Сегодня», not out of the app', () => {
    expect(backAction('/course', null, true)).toBe('today');
    expect(backAction('/account', null, false)).toBe('today');
  });
  it('steps back from a lesson or an inner screen', () => {
    expect(backAction('/learn/day-1', null, true)).toBe('history');
    expect(backAction('/reference', null, true)).toBe('history');
    expect(backAction('/progress', null, false)).toBe('today');
  });
  it('leaves «Сегодня» only on a second Back within two seconds', () => {
    expect(secondExitPress(10_000, null)).toBe(false);
    expect(secondExitPress(11_500, 10_000)).toBe(true);
    expect(secondExitPress(13_000, 10_000)).toBe(false);
  });
});
