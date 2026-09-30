import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyCourseProgress } from './progress';
import { activeDays, monthCalendar } from './activity-calendar';
import { applyProductTheme, readThemePreference, setThemePreference, THEME_KEY } from './theme';

const day=(y:number,m:number,d:number)=>Date.UTC(y,m-1,d)/86_400_000;

describe('activity calendar',()=>{
  it('lays out the month in Monday-first weeks and fills days with practice',()=>{
    const progress=emptyCourseProgress();
    progress.learningDays['2026-09-28']={at:'2026-09-28T08:00:00Z'};
    progress.learningDays['2026-09-30']={at:'2026-09-30T08:00:00Z'};
    progress.learningDays['2026-09-01']={at:'2026-09-01T08:00:00Z',deleted:true};
    const today=day(2026,9,30); // Wednesday
    const weeks=monthCalendar(2026,8,activeDays(progress.learningDays),today);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]![0]!.day).toBe(day(2026,8,31)); // the Monday before 1 September
    expect(weeks[0]![1]).toMatchObject({date:1,inMonth:true,active:false});
    const active=weeks.flat().filter(cell=>cell.inMonth&&cell.active).map(cell=>cell.date);
    expect(active).toEqual([28,30]);
    expect(weeks.flat().find(cell=>cell.date===30&&cell.inMonth)!.future).toBe(false);
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
