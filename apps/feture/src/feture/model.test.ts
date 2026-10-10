import { describe, expect, it } from 'vitest';
import { categoryProgress, mergeInterestMaps, normalizeRecord, parseInterestMap } from './model';

const at='2026-10-10T06:00:00.000Z';
describe('FetUre interest map',()=>{
 it('keeps hard boundaries separate from interest strength',()=>{
   const hard=normalizeRecord({status:'hard_limit', intensity:100,visibility:'private'},at);
   const conditional=normalizeRecord({status:'soft_limit',intensity:87,visibility:'private'},at);
   expect(hard.intensity).toBe(null);
   expect(conditional.intensity).toBe(null);
   const progress=categoryProgress(['interest-1-1','interest-1-2','interest-1-3'],{
    'interest-1-1':hard,
    'interest-1-2':conditional
   });
   expect(progress.known).toBe(2);
   expect(progress.interests).toBe(0);
   expect(progress.boundaries).toBe(1);
   expect(progress.conditional).toBe(1);
   expect(progress.percent).toBe(67);
 });
 it('merges unrelated interests across devices',()=>{
  const first={'interest-1-1':normalizeRecord({status:'curious',intensity:70,visibility:'private'},at)};
  const second={'interest-1-2':normalizeRecord({status:'experienced',intensity:80,visibility:'granted'},at)};
  const result=parseInterestMap(mergeInterestMaps(JSON.stringify(first),JSON.stringify(second)));
  expect(Object.keys(result)).toHaveLength(2);
  expect(result['interest-1-2'].visibility).toBe('granted');
 });
 it('newer edits win for the same interest, including boundaries',()=>{
  const older={'interest-1-1':normalizeRecord({status:'curious',intensity:45,visibility:'public'},at)};
  const newer={'interest-1-1':normalizeRecord({status:'hard_limit',intensity:85,visibility:'private'},'2026-10-10T07:00:00.000Z')};
  const result=parseInterestMap(mergeInterestMaps(JSON.stringify(older),JSON.stringify(newer)));
  expect(result['interest-1-1'].status).toBe('hard_limit');
  expect(result['interest-1-1'].intensity).toBeNull();
  expect(result['interest-1-1'].visibility).toBe('private');
 });
 it('rejects malformed document payloads instead of rendering unexpected data',()=>{
  expect(parseInterestMap('{"bad":"data"}')).toEqual({});
  expect(parseInterestMap(null)).toEqual({});
 });
});
