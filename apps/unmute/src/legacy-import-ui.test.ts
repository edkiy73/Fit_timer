import { describe, expect, it } from 'vitest';
import { parseLegacyProgressFile } from './legacy-import-ui';

describe('legacy progress file parser',()=>{
  it('accepts the English Trainer export wrapper and uses its saved date for due correction',()=>{
    const parsed=parseLegacyProgressFile(JSON.stringify({
      app:'english-trainer',
      version:1,
      saved:'2026-09-29',
      state:{srs:{'abc#0':{box:2,due:10}}}
    }));
    expect(parsed.raw).toBeTruthy();
    expect(Number.isInteger(parsed.dueDayShift)).toBe(true);
  });

  it('accepts a raw legacy state for older manual backups',()=>{
    const parsed=parseLegacyProgressFile(JSON.stringify({
      pat:{abc:{box:1,due:10}}
    }));
    expect(parsed.dueDayShift).toBe(0);
  });

  it('rejects an unrelated JSON export',()=>{
    expect(()=>parseLegacyProgressFile(JSON.stringify({
      app:'some-other-app',
      state:{srs:{'abc#0':{box:1,due:1}}}
    }))).toThrow('wrong_app');
  });

  it('rejects valid JSON that has no legacy progress stores',()=>{
    expect(()=>parseLegacyProgressFile(JSON.stringify({hello:'world'}))).toThrow('no_progress');
  });
});
