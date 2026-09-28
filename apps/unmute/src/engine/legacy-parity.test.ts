import fs from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { norm, expand, canon } from './answer-normalize';
import { checkAnswer } from './answer-check';
import { isFormPair, levenshtein, nearMiss } from './answer-near-miss';
import { CARD_INTERVALS, gradeCardSrs } from './card-srs';
import { PRACTICE_INTERVALS, gradePracticeSrs } from './practice-srs';
import { PRACTICE_DAILY_CAPS, selectPracticeQueue } from './practice-queue';

const LEGACY_SHA='011572be908d64a1e092e63a821e407d85753205';
const LEGACY_URL='https://raw.githubusercontent.com/edkiy73/English/'+LEGACY_SHA+'/index.html';

type LegacyState={
  srs:Record<string,{box:number;due:number}>;
  pat:Record<string,{box:number;due:number}>;
  voc:Record<string,{box:number;due:number}>;
  lis:Record<string,{box:number;due:number}>;
  err:Record<string,{t:number;w:number}>;
  words:Record<string,unknown>;
  dia:Record<string,unknown>;
  ai:Record<string,unknown>;
  rest:Record<string,unknown>;
  speed:Record<string,unknown>;
  day:string|null;
  act?:string;
  streak:number;
  total:number;
  right:number;
  theme:null;
};

type LegacyParity={
  norm:(value:string)=>string;
  expand:(value:string)=>string;
  canon:(value:string)=>string;
  check:(input:string,accepted:string[])=>boolean;
  lev:(a:string,b:string)=>number;
  isFormPair:(a:string,b:string)=>boolean;
  nearMiss:(input:string,accepted:string[])=>boolean;
  dictLook:(word:string)=>unknown;
  grade:(lesson:string,index:number,correct:boolean)=>void;
  gradePat:(store:'pat'|'voc'|'lis',id:string,correct:boolean)=>void;
  patDue:()=>string[];
  vocDue:()=>string[];
  lisDue:()=>string[];
  dayNum:(day:string)=>number;
  today:()=>string;
  getS:()=>LegacyState;
  setS:(state:LegacyState)=>void;
  intervals:number[];
  pInt:number[];
  vInt:number[];
  lInt:number[];
  caps:{pat:number;voc:number;lis:number};
  patternIds:string[];
  lessons:Array<{cards:Array<{a?:unknown}>}>;
};

async function readLegacySource():Promise<string>{
  const source=process.env.UNMUTE_LEGACY_SOURCE||LEGACY_URL;
  if(/^https?:\/\//i.test(source)){
    const response=await fetch(source);
    if(!response.ok)throw new Error('legacy_source_http_'+response.status);
    return response.text();
  }
  return fs.readFile(source,'utf8');
}

function emptyLegacyState():LegacyState{
  return {
    srs:{},pat:{},voc:{},lis:{},err:{},words:{},dia:{},ai:{},rest:{},speed:{},
    day:null,streak:0,total:0,right:0,theme:null
  };
}

async function bootLegacy():Promise<LegacyParity>{
  const html=await readLegacySource();
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1]||'');
  const main=scripts.find(source=>source.includes('const INTERVALS=[0,1,3,7,16,35]'));
  if(!main)throw new Error('legacy_main_script_not_found');
  const marker='/* ================= старт ================= */';
  const markerIndex=main.indexOf(marker);
  if(markerIndex<0)throw new Error('legacy_start_marker_not_found');

  const dom=new JSDOM(html,{url:'https://legacy.test/',runScripts:'outside-only'});
  const safe=main.slice(0,markerIndex);
  const expose=String.raw`
window.__legacyParity={
  norm,expand,canon,check,lev,isFormPair,nearMiss,dictLook,grade,gradePat,
  patDue,vocDue,lisDue,dayNum,today,
  getS:()=>S,setS:value=>{S=value;},
  intervals:Array.from(INTERVALS),
  pInt:Array.from(PINT),vInt:Array.from(VINT),lInt:Array.from(LINT),
  caps:{pat:PAT_CAP,voc:VOC_CAP,lis:LIS_CAP},
  patternIds:Object.keys(PATTERNS),
  lessons:LESSONS
};`;
  dom.window.eval(safe+'\n'+expose);
  const legacy=(dom.window as unknown as {__legacyParity?:LegacyParity}).__legacyParity;
  if(!legacy)throw new Error('legacy_parity_exports_missing');
  return legacy;
}

let legacy:LegacyParity;

beforeAll(async()=>{
  legacy=await bootLegacy();
},30_000);

describe('frozen legacy engine parity',()=>{
  it('uses the exact frozen legacy source revision',()=>{
    expect(LEGACY_SHA).toBe('011572be908d64a1e092e63a821e407d85753205');
    expect(legacy.patternIds.length).toBeGreaterThanOrEqual(30);
  });

  it('matches normalization across curated and real course answers',()=>{
    const curated=[
      "I'm here.",
      "I’m here!",
      "Yeah, I wanna go.",
      "I DON'T know",
      'twenty minutes',
      'colour travelling',
      'lemme think',
      'I have got a car',
      "youre already here",
      "It's five o clock"
    ];

    const realAnswers:string[]=[];
    for(const lesson of legacy.lessons){
      for(const card of lesson.cards){
        if(Array.isArray(card.a)){
          for(const answer of card.a)if(typeof answer==='string')realAnswers.push(answer);
        }
      }
    }

    for(const value of [...curated,...realAnswers.slice(0,250)]){
      expect(norm(value),value).toBe(legacy.norm(value));
      expect(expand(norm(value)),value).toBe(legacy.expand(legacy.norm(value)));
      expect(canon(value),value).toBe(legacy.canon(value));
    }
  });

  it('matches legacy answer acceptance including time movement and optional words',()=>{
    const cases:Array<[string,string[]]>= [
      ["I’m here.",['im here']],
      ['Yeah, I wanna go.',['yes i want to go']],
      ['Please call me',['call me']],
      ['Call me please',['call me']],
      ['Yesterday I called him',['I called him yesterday']],
      ['I called him next week',['Next week I called him']],
      ['I called him right now',['Right now I called him']],
      ['I called him',['I called him yesterday']],
      ['I called him last week',['I called him next week']],
      ['I called him',['I called him today']],
      ['I work',['I work now']],
      ['I have got a car',['I have a car']],
      ['I did call him yesterday',['I called him yesterday']]
    ];

    for(const [input,accepted] of cases){
      expect(checkAnswer(input,accepted),input).toBe(legacy.check(input,accepted));
    }

    let compared=0;
    for(const lesson of legacy.lessons){
      for(const card of lesson.cards){
        if(!Array.isArray(card.a))continue;
        const accepted=card.a.filter((value):value is string=>typeof value==='string');
        if(!accepted.length)continue;
        const answer=accepted[0]!;
        for(const variant of [answer,answer.toUpperCase(),answer+'!']){
          expect(checkAnswer(variant,accepted),variant).toBe(legacy.check(variant,accepted));
          compared++;
        }
        if(compared>=300)break;
      }
      if(compared>=300)break;
    }
    expect(compared).toBeGreaterThanOrEqual(300);
  });

  it('matches Levenshtein, form-pair and near-miss decisions',()=>{
    const distancePairs:Array<[string,string]>= [
      ['work','wrok'],['kitten','sitting'],['necessary','necesary'],
      ['abcdefgh','abxxefgh'],['book','back'],['same','same']
    ];
    for(const [a,b] of distancePairs)expect(levenshtein(a,b),a+' / '+b).toBe(legacy.lev(a,b));

    const formPairs:Array<[string,string]>= [
      ['work','works'],['work','worked'],['study','studies'],['make','making'],
      ['happy','happier'],['good','goof']
    ];
    for(const [a,b] of formPairs)expect(isFormPair(a,b),a+' / '+b).toBe(legacy.isFormPair(a,b));

    const nearCases:Array<[string,string[]]>= [
      ['I wrok today',['I work today']],
      ['This is beautful',['This is beautiful']],
      ['I works today',['I work today']],
      ['I wrok tomorow',['I work tomorrow']],
      ['I work in Bali',['I work on Bali']],
      ['I work ate home',['I work at home']],
      ['I work abt home',['I work at home']],
      ["Yeah, I wanna go.",['yes i want to go']]
    ];
    const known=(word:string)=>Boolean(legacy.dictLook(word));
    for(const [input,accepted] of nearCases){
      expect(nearMiss(input,accepted,known),input).toBe(legacy.nearMiss(input,accepted));
    }
  });

  it('matches card SRS grading including stats side effects',()=>{
    expect(Array.from(CARD_INTERVALS)).toEqual(legacy.intervals);
    const today=legacy.dayNum(legacy.today());

    for(const startBox of [0,1,2,4,5]){
      for(const correct of [true,false]){
        const state=emptyLegacyState();
        state.srs['x#0']={box:startBox,due:0};
        legacy.setS(state);
        legacy.grade('x',0,correct);
        const old=legacy.getS();
        const next=gradeCardSrs({box:startBox,due:0},correct,today);
        expect(old.srs['x#0']).toEqual(next);
        expect(old.total).toBe(1);
        expect(old.right).toBe(correct?1:0);
        expect(old.err['x#0']).toEqual({t:1,w:correct?0:1});
      }
    }
  });

  it('matches drill/listening/speaking SRS grading',()=>{
    expect(Array.from(PRACTICE_INTERVALS.drill)).toEqual(legacy.pInt);
    expect(Array.from(PRACTICE_INTERVALS.speaking)).toEqual(legacy.vInt);
    expect(Array.from(PRACTICE_INTERVALS.listening)).toEqual(legacy.lInt);
    const today=legacy.dayNum(legacy.today());

    const mappings:Array<['pat'|'voc'|'lis','drill'|'speaking'|'listening']>=[
      ['pat','drill'],['voc','speaking'],['lis','listening']
    ];
    for(const [store,kind] of mappings){
      for(const startBox of [0,1,3,4]){
        for(const correct of [true,false]){
          const state=emptyLegacyState();
          state[store].x={box:startBox,due:0};
          legacy.setS(state);
          legacy.gradePat(store,'x',correct);
          const old=legacy.getS()[store].x;
          expect(old).toEqual(gradePracticeSrs(kind,{box:startBox,due:0},correct,today));
        }
      }
    }
  });

  it('matches the actionable legacy due queues and daily caps',()=>{
    expect(PRACTICE_DAILY_CAPS).toEqual({
      drill:legacy.caps.pat,
      speaking:legacy.caps.voc,
      listening:legacy.caps.lis
    });

    const ids=legacy.patternIds.slice(0,8);
    expect(ids.length).toBe(8);
    const today=legacy.dayNum(legacy.today());
    const state=emptyLegacyState();

    ids.forEach((id,index)=>{
      const due=today-(index%5);
      state.pat[id]={box:1,due};
      state.voc[id]={box:1,due};
      state.lis[id]={box:1,due};
    });
    legacy.setS(state);

    expect(selectPracticeQueue('drill',ids,state.pat,today).due.map(item=>item.id))
      .toEqual(legacy.patDue());
    expect(selectPracticeQueue('speaking',ids,state.voc,today).due.map(item=>item.id))
      .toEqual(legacy.vocDue());
    expect(selectPracticeQueue('listening',ids,state.lis,today).due.map(item=>item.id))
      .toEqual(legacy.lisDue());
  });
});
