import { describe, expect, it } from 'vitest';
import type { CourseSet } from './content/schema';
import type { LexiconSnapshot } from './lexicon/schema';
import {
  importLegacyProgress,
  legacyDueDayShiftForKey
} from './legacy-progress-import';
import { learningCalendarFromDocument, roadmapProgressFromDocument } from './progress-actions';
import { summarizeAnswerStats } from './engine/learner-stats';
import { wordProgressKey } from './progress';

const course={
  schemaVersion:1,
  id:'general-foundation',
  revision:1,
  slug:'general-foundation',
  title:{ru:'Test'},
  level:{from:'a1',to:'b1',labels:[]},
  access:{mode:'free'},
  defaultRoadmapId:'main',
  roadmaps:[{
    id:'main',title:{ru:'Main'},nodes:[
      {
        id:'day-1',kind:'lesson',title:{ru:'День 1'},dayIndex:1,order:0,
        prerequisites:[],activityIds:['ex.abc.001','pattern.abc','dialogue.d1','ai.ai1'],
        optional:false
      },
      {
        id:'day-2',kind:'review',title:{ru:'День 2'},dayIndex:2,order:1,
        prerequisites:['day-1'],activityIds:['review.day-2'],optional:false
      }
    ]
  }],
  activities:[
    {id:'ex.abc.001',revision:1,type:'text-input',tags:['abc'],revisionProgress:'preserve',lexiconRefs:[],prompt:{ru:'x'},answer:{accepted:['x'],nearMiss:true,caseSensitive:false}},
    {id:'pattern.abc',revision:1,type:'pattern-drill',tags:['abc'],revisionProgress:'preserve',lexiconRefs:[],pattern:{ru:'x'},modes:['drill','listening','speaking'],items:[{id:'p1',prompt:{ru:'x'},answer:{accepted:['x'],nearMiss:true,caseSensitive:false}}]},
    {id:'dialogue.d1',revision:1,type:'dialogue',tags:[],revisionProgress:'preserve',lexiconRefs:[],scene:{ru:'x'},lines:[{id:'l1',partner:{ru:'x'},answer:{accepted:['x'],nearMiss:true,caseSensitive:false},displayAnswer:'x'}]},
    {id:'ai.ai1',revision:1,type:'ai-conversation',tags:[],revisionProgress:'preserve',lexiconRefs:[],topic:{ru:'x'},promptTemplate:'x',focus:[]},
    {id:'review.day-2',revision:1,type:'review',tags:[],revisionProgress:'preserve',lexiconRefs:[],source:{activityIds:[],tags:[],dueOnly:true}}
  ],
  resources:[]
} as CourseSet;

const lexicon={
  schemaVersion:1,
  revision:1,
  entries:[
    {
      id:'lex.work',revision:1,language:'en',lemma:'work',
      forms:[{text:'work',kind:'lemma'}],
      senses:[
        {id:'verb',partOfSpeech:'verb',translations:{ru:['работать']},tags:[]},
        {id:'noun',partOfSpeech:'noun',translations:{ru:['работа']},tags:[]}
      ],examples:[],deprecated:false
    },
    {
      id:'lex.home',revision:1,language:'en',lemma:'home',
      forms:[{text:'home',kind:'lemma'}],
      senses:[{id:'noun',partOfSpeech:'noun',translations:{ru:['дом']},tags:[]}],
      examples:[],deprecated:false
    }
  ]
} as LexiconSnapshot;

describe('legacy eng-trainer-v2 progress import',()=>{
  it('maps cards, all practice modes, stats, manual days and metrics',()=>{
    const result=importLegacyProgress({
      srs:{'abc#0':{box:3,due:100}},
      pat:{abc:{box:2,due:101}},
      lis:{abc:{box:1,due:102}},
      voc:{abc:{box:4,due:103}},
      err:{'abc#0':{t:5,w:2}},
      rest:{1:'2026-09-27'},
      dia:{d1:{done:1,score:80,due:999}},
      ai:{ai1:{date:'2026-09-28'}},
      speed:{abc:73},
      act:'2026-09-28',
      streak:3,
      total:5,
      right:3
    },course,lexicon,{dueDayShift:1});

    expect(result.course.cards['ex.abc.001']).toMatchObject({box:3,due:101});
    expect(result.course.practice.drill['pattern.abc']).toMatchObject({box:2,due:102});
    expect(result.course.practice.listening['pattern.abc']).toMatchObject({box:1,due:103});
    expect(result.course.practice.speaking['pattern.abc']).toMatchObject({box:4,due:104});
    expect(result.course.manualNodes['day-2']).toBeTruthy();
    expect(result.course.seen['dialogue.d1']).toBeTruthy();
    expect(result.course.seen['ai.ai1']).toBeTruthy();
    expect(result.course.metrics['dialogue-score:dialogue.d1']?.value).toBe(80);
    expect(result.course.metrics['speed:pattern.abc']?.value).toBe(73);

    expect(summarizeAnswerStats(result.stats)).toEqual({attempts:5,correct:3,wrong:2,accuracy:60});
    expect(result.report.importedAttempts).toBe(5);
    expect(result.report.legacyTotal).toBe(5);
    expect(result.report.dueDayShift).toBe(1);

    const state=roadmapProgressFromDocument(result.course);
    expect(state.seenActivityIds.has('ex.abc.001')).toBe(true);
    expect(state.practice.speaking['pattern.abc']?.box).toBe(4);
  });

  it('reconstructs the old displayed streak as merge-safe learning days',()=>{
    const result=importLegacyProgress({
      act:'2026-09-28',
      streak:3
    },course,lexicon);

    expect(Object.keys(result.course.learningDays).sort()).toEqual([
      '2026-09-26','2026-09-27','2026-09-28'
    ]);
    expect(learningCalendarFromDocument(result.course).streak).toBe(3);
    expect(result.report.syntheticLearningDays).toBe(3);
  });

  it('moves a personal word only when lexeme+sense resolution is unambiguous',()=>{
    const result=importLegacyProgress({
      words:{
        home:{ru:'дом',box:2,due:50},
        work:{ru:'работать; работа',box:3,due:60}
      }
    },course,lexicon,{dueDayShift:1});

    expect(result.words.items[wordProgressKey('lex.home','noun')]).toMatchObject({box:2,due:51});
    expect(result.words.items[wordProgressKey('lex.work','verb')]).toBeUndefined();
    expect(result.words.items[wordProgressKey('lex.work','noun')]).toBeUndefined();
    expect(result.report.words).toBe(1);
    expect(result.report.unresolved).toContainEqual({
      kind:'word',legacyKey:'work',reason:'lexeme_or_sense_ambiguous'
    });
  });

  it('reports stale legacy keys instead of guessing replacement activities',()=>{
    const result=importLegacyProgress({
      srs:{'missing#0':{box:2,due:10}},
      pat:{missing:{box:2,due:10}},
      dia:{missing:{done:1}}
    },course,lexicon);

    expect(result.report.unresolved.map(item=>item.reason)).toEqual([
      'activity_not_found','activity_not_found','activity_not_found'
    ]);
    expect(Object.keys(result.course.cards)).toHaveLength(0);
  });

  it('can correct legacy local-midnight due numbering explicitly',()=>{
    const shift=legacyDueDayShiftForKey('2026-09-28',()=>Date.UTC(2026,8,27,16,0,0));
    expect(shift).toBe(1);
  });

  it('accepts the legacy exported wrapper as well as raw state',()=>{
    const result=importLegacyProgress({
      app:'english-trainer',
      version:1,
      state:{srs:{'abc#0':{box:1,due:10}}}
    },course,lexicon);
    expect(result.report.cards).toBe(1);
  });
});
