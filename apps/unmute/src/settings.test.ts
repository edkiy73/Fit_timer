import { describe, expect, it } from 'vitest';
import { mergeSettings, parseSettings } from './settings-data';

describe('UnMute settings',()=>{
  it('parses known settings and ignores malformed values',()=>{
    expect(parseSettings(JSON.stringify({
      locale:'ru',
      onboardingDoneAt:'2026-09-29T10:00:00.000Z',
      notifications:{
        enabled:true,
        time:'19:30',
        daily:true,
        review:true,
        streak:false,
        changedAt:'2026-09-29T11:00:00.000Z'
      },
      ignored:true
    }))).toEqual({
      locale:'ru',
      onboardingDoneAt:'2026-09-29T10:00:00.000Z',
      notifications:{
        enabled:true,
        time:'19:30',
        daily:true,
        review:true,
        streak:false,
        changedAt:'2026-09-29T11:00:00.000Z'
      }
    });
    expect(parseSettings('{bad')).toEqual({});
  });

  it('merges notification preferences by their own changedAt timestamp',()=>{
    expect(mergeSettings(
      {
        locale:'ru',
        notifications:{
          enabled:true,
          time:'20:00',
          daily:true,
          review:true,
          streak:true,
          changedAt:'2026-09-29T12:00:00.000Z'
        }
      },
      {
        locale:'en',
        notifications:{
          enabled:false,
          time:'18:00',
          daily:false,
          review:false,
          streak:false,
          changedAt:'2026-09-29T13:00:00.000Z'
        }
      }
    )).toMatchObject({
      locale:'ru',
      notifications:{
        enabled:false,
        time:'18:00',
        changedAt:'2026-09-29T13:00:00.000Z'
      }
    });
  });

  it('keeps a completed onboarding flag when another device only changed locale',()=>{
    expect(mergeSettings(
      {locale:'en'},
      {locale:'ru',onboardingDoneAt:'2026-09-29T10:00:00.000Z'}
    )).toEqual({
      locale:'en',
      onboardingDoneAt:'2026-09-29T10:00:00.000Z'
    });
  });
  it('keeps the most recently chosen course across devices',()=>{
    const older={id:'general-foundation',changedAt:'2026-09-29T10:00:00.000Z'};
    const newer={id:'a1-starter',changedAt:'2026-09-30T10:00:00.000Z'};
    expect(mergeSettings({activeCourse:older},{activeCourse:newer}).activeCourse).toEqual(newer);
    expect(mergeSettings({activeCourse:newer},{activeCourse:older}).activeCourse).toEqual(newer);
    expect(mergeSettings({},{}).activeCourse).toBeUndefined();
    expect(parseSettings(JSON.stringify({activeCourse:{id:'',changedAt:'x'}})).activeCourse).toBeUndefined();
  });
});
