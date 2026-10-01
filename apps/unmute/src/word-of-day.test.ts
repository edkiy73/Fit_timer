import { describe, expect, it } from 'vitest';
import type { CourseSet, RoadmapNode } from './content/schema';
import type { LexiconSnapshot } from './lexicon/schema';
import { wordOfTheDay } from './today-model';

const node:RoadmapNode={id:'day-1',kind:'lesson',title:{ru:'День 1'},dayIndex:1,order:1,prerequisites:[],activityIds:['card.a'],optional:false};
const set={
  activities:[{id:'card.a',revision:1,revisionProgress:'preserve',type:'theory',tags:[],format:'text',title:{ru:'a'},body:{ru:'x'},
    lexiconRefs:[{lexemeId:'lex.work'},{lexemeId:'lex.home'},{lexemeId:'lex.a-lot'},{lexemeId:'lex.go'}]}]
} as unknown as CourseSet;
const entry=(id:string,lemma:string,ipa:string|null,ru:string)=>({id,lemma,...(ipa?{pronunciation:{ipa}}:{}),senses:[{id:'s1',translations:{ru:[ru]}}],forms:[]});
const lexicon={entries:[
  entry('lex.work','work','wɜːk','работать'),
  entry('lex.home','home','həʊm','дом'),
  entry('lex.a-lot','a lot','ə lɒt','много'),
  entry('lex.go','go',null,'идти')
]} as unknown as LexiconSnapshot;

describe('word of the day', () => {
  it('takes single words from the day, same all day, next one tomorrow', () => {
    const today=wordOfTheDay(set,node,lexicon,100,'ru');
    const tomorrow=wordOfTheDay(set,node,lexicon,101,'ru');
    expect(['work','home']).toContain(today?.lemma);
    expect(tomorrow?.lemma).not.toBe(today?.lemma);
    expect(wordOfTheDay(set,node,lexicon,100,'ru')).toEqual(today);
  });
  it('skips phrases and very short words', () => {
    const lemmas=[0,1,2,3].map(day=>wordOfTheDay(set,node,lexicon,day,'ru')?.lemma);
    expect(lemmas).not.toContain('a lot');
    expect(lemmas).not.toContain('go');
  });
  it('shows nothing without the dictionary', () => {
    expect(wordOfTheDay(set,node,null,1,'ru')).toBeNull();
  });
});
