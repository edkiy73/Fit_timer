import { describe, expect, it } from 'vitest';
import { categoryProgress, mergeInterestMaps, normalizeRecord, parseInterestMap, type InterestRecord } from './model';
const at='2026-10-10T06:00:00.000Z';
const empty:Omit<InterestRecord,'at'>={stance:'unknown',experience:'unspecified',boundary:'none',boundaryNote:null,intensity:null,visibility:'private',useForDiscovery:false};
describe('FetUre interest map',()=>{
 it('preserves independent experience and desire while hard boundaries exclude strength',()=>{
  const hard=normalizeRecord({...empty,stance:'fantasy',experience:'ongoing',boundary:'hard',intensity:5,boundaryNote:'cleared'},at);
  const conditional=normalizeRecord({...empty,boundary:'conditional',boundaryNote:'private conditions'},at);
  const experienced=normalizeRecord({...empty,experience:'tried'},at);
  expect(hard.intensity).toBeNull();
  expect(hard.boundaryNote).toBeNull();
  expect(hard.stance).toBe('fantasy');
  expect(hard.experience).toBe('ongoing');
  expect(conditional.boundaryNote).toBe('private conditions');
  const progress=categoryProgress(['interest-1-1','interest-1-2','interest-1-3'],{'interest-1-1':hard,'interest-1-2':conditional,'interest-1-3':experienced});
  expect(progress).toEqual({known:3,total:3,percent:100,interests:0,boundaries:1,conditional:1});
  expect(normalizeRecord({...empty,stance:'curious'},at).intensity).toBeNull();
 });
 it('merges unrelated interests across devices',()=>{
  const first={'interest-1-1':normalizeRecord({...empty,stance:'curious',intensity:4},at)};
  const second={'interest-1-2':normalizeRecord({...empty,experience:'tried',visibility:'granted'},at)};
  const result=parseInterestMap(mergeInterestMaps(JSON.stringify(first),JSON.stringify(second)));
  expect(Object.keys(result)).toHaveLength(2);
  expect(result['interest-1-2']!.visibility).toBe('granted');
 });
 it('newer edits win for the same interest, including boundaries',()=>{
  const older={'interest-1-1':normalizeRecord({...empty,stance:'curious',intensity:4,visibility:'public'},at)};
  const newer={'interest-1-1':normalizeRecord({...empty,stance:'curious',experience:'tried',boundary:'hard',intensity:5},'2026-10-10T07:00:00.000Z')};
  const result=parseInterestMap(mergeInterestMaps(JSON.stringify(older),JSON.stringify(newer)));
  expect(result['interest-1-1']!.boundary).toBe('hard');
  expect(result['interest-1-1']!.experience).toBe('tried');
  expect(result['interest-1-1']!.intensity).toBeNull();
  expect(result['interest-1-1']!.visibility).toBe('private');
 });
 it('rejects malformed and obsolete prototype documents',()=>{
  expect(parseInterestMap('{"bad":"data"}')).toEqual({});
  expect(parseInterestMap(null)).toEqual({});
  for(const extra of [{intensity:100},{boundary:'hard',intensity:5},{boundaryNote:'not conditional'},{status:'experienced'}]){
   expect(parseInterestMap(JSON.stringify({'interest-1-1':{...empty,stance:'curious',at,...extra}}))).toEqual({});
  }
 });
});
