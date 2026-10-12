import { describe, expect, it } from 'vitest';
import { categoryProgress, normalizeRecord, parseInterestMap, catalogSchema, type InterestRecord } from './model';
import bundledCatalogue from '../../data/concept-catalog.json';
const at='2026-10-10T06:00:00.000Z';
const empty:Omit<InterestRecord,'at'>={stance:'unknown',experience:'unspecified',boundary:'none',boundaryNote:null,intensity:null,visibility:'private',useForDiscovery:false};
describe('Public catalogue fallback contract',()=>{
 it('does not replace usable bundled topics with an empty successful API response',()=>{
  const fallback=catalogSchema.parse(bundledCatalogue);
  expect(fallback.categories.some(category=>category.interests.length>0)).toBe(true);
  expect(catalogSchema.safeParse({...bundledCatalogue,categories:[]}).success).toBe(false);
  expect(catalogSchema.safeParse({...bundledCatalogue,categories:fallback.categories.map(category=>({...category,interests:[]}))}).success).toBe(false);
 });
});
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
  expect(progress).toEqual({known:3,total:3,percent:100,interests:0,measured:0,experienced:2,boundaries:1,conditional:1});
  const curiosity=normalizeRecord({...empty,stance:'curious',intensity:4},at);
  const separate=categoryProgress(['interest-1-1','interest-1-2'],{'interest-1-1':curiosity,'interest-1-2':hard});
  expect(separate).toEqual({known:2,total:2,percent:100,interests:1,measured:1,experienced:1,boundaries:1,conditional:0});
  expect(normalizeRecord({...empty,stance:'curious'},at).intensity).toBeNull();
 });
 it('rejects malformed and obsolete prototype documents',()=>{
  expect(parseInterestMap('{"bad":"data"}')).toEqual({});
  expect(parseInterestMap(null)).toEqual({});
  for(const extra of [{intensity:100},{boundary:'hard',intensity:5},{boundaryNote:'not conditional'},{status:'experienced'}]){
   expect(parseInterestMap(JSON.stringify({'interest-1-1':{...empty,stance:'curious',at,...extra}}))).toEqual({});
  }
 });
});
