import {describe,it,expect} from 'vitest';
import {shareCardRows} from './share-card-model';
import type {Catalog,InterestMap} from './model';

const categories=[{interests:[{id:'interest-1-1',title:'Инициатива'},{id:'interest-1-2',title:'Доверие'}]}] as unknown as Catalog['categories'];
const state=(boundary:'none'|'hard'='none')=>({
 stance:'curious' as const,experience:'ongoing' as const,boundary,boundaryNote:null,intensity:null,
 visibility:'private' as const,useForDiscovery:false,at:'2026-10-11T00:00:00.000Z'
});
describe('explicit share-card projection',()=>{
 it('exports only manually selected whitelisted public words, never raw private metadata',()=>{
  const map={'interest-1-1':{...state(),boundaryNote:null},
   'interest-1-2':{...state(),boundary:'hard' as const}} as InterestMap;
  const projected=shareCardRows(['interest-1-1'],categories,map);
  expect(projected).toEqual([{title:'Инициатива',stance:'Интересно'}]);
  for(const privateValue of ['ongoing','private','interest-1-1','useForDiscovery','boundaryNote','2026'])expect(JSON.stringify(projected)).not.toContain(privateValue);
  expect(()=>shareCardRows(['interest-1-2'],categories,map)).toThrow('invalid_selection');
  expect(()=>shareCardRows(['interest-1-1','interest-1-1'],categories,map)).toThrow('invalid_selection');
  expect(()=>shareCardRows([],categories,map)).toThrow('invalid_selection');
  expect(()=>shareCardRows(['interest-8-8'],categories,map)).toThrow('invalid_selection');
 });
});
