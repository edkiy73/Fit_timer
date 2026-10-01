import { describe, expect, it } from 'vitest';
import { countDays } from './plural';
import { ru } from './i18n/ru';
import { en } from './i18n/en';

const tFor = (dict: Record<string, string>) => (key: string, values: Record<string, string | number> = {}) =>
  (dict[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''));

describe('countDays', () => {
  it('uses Russian plural forms', () => {
    const t = tFor(ru);
    expect([1, 3, 5, 12, 21, 22].map(n => countDays(t, 'ru', n))).toEqual(['1 день', '3 дня', '5 дней', '12 дней', '21 день', '22 дня']);
  });
  it('uses English plural forms', () => {
    const t = tFor(en);
    expect([1, 2, 40].map(n => countDays(t, 'en', n))).toEqual(['1 day', '2 days', '40 days']);
  });
});
