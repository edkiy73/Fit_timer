import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyCourseProgress } from './progress';
import { activityCalendar } from './me-screen';
import { applyProductTheme, readThemePreference, setThemePreference, THEME_KEY } from './theme';

const day=(y:number,m:number,d:number)=>Date.UTC(y,m-1,d)/86_400_000;

describe('«Я» activity calendar',()=>{
  it('lays out 12 Monday-first weeks ending with the current one',()=>{
    const progress=emptyCourseProgress();
    progress.learningDays['2026-09-28']={at:'2026-09-28T08:00:00Z'};
    progress.learningDays['2026-09-30']={at:'2026-09-30T08:00:00Z'};
    progress.learningDays['2026-06-01']={at:'2026-06-01T08:00:00Z'};
    const today=day(2026,9,30); // Wednesday
    const calendar=activityCalendar(progress,today);
    expect(calendar.cells).toHaveLength(84);
    expect(calendar.cells[0]!.day).toBe(day(2026,7,13)); // a Monday, 11 weeks earlier
    expect(calendar.active).toBe(2);
    expect(calendar.cells.filter(cell=>cell.future)).toHaveLength(4); // Thu–Sun of this week
  });
});

describe('theme preference',()=>{
  afterEach(()=>{ localStorage.removeItem(THEME_KEY); });

  it('defaults to the system and applies an explicit choice to <html>',()=>{
    vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
    expect(readThemePreference()).toBe('system');
    const stop=applyProductTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
    setThemePreference('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    setThemePreference('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    setThemePreference('system');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    stop();
    vi.unstubAllGlobals();
  });
});
