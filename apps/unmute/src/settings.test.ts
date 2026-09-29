import { describe, expect, it } from 'vitest';
import { mergeSettings, parseSettings } from './settings-data';

describe('UnMute settings',()=>{
  it('parses known settings and ignores malformed values',()=>{
    expect(parseSettings(JSON.stringify({
      locale:'ru',
      onboardingDoneAt:'2026-09-29T10:00:00.000Z',
      ignored:true
    }))).toEqual({
      locale:'ru',
      onboardingDoneAt:'2026-09-29T10:00:00.000Z'
    });
    expect(parseSettings('{bad')).toEqual({});
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
});
