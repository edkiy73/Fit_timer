import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import type { LearnerCourseState } from './course-loader';
import type { Activity, RoadmapNode } from './content/schema';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { emptyCourseProgress } from './progress';
import { TodayView } from './today';
import { dictionaries } from './i18n';

const node={
  id:'day-2',
  kind:'lesson' as const,
  title:{ru:'Настоящее время',en:'Present tense'},
  dayIndex:2,
  order:1,
  prerequisites:['day-1'],
  activityIds:['card.one','card.two'],
  optional:false
};

const state: LearnerCourseState={
  set:{
    schemaVersion:1,
    id:'general-foundation',
    revision:1,
    slug:'general-foundation',
    title:{ru:'Основной курс',en:'General course'},
    level:{from:'a1',to:'b1',labels:[]},
    access:{mode:'free'},
    defaultRoadmapId:'main',
    roadmaps:[{
      id:'main',
      title:{ru:'Путь'},
      nodes:[node]
    }],
    activities:[
      {
        id:'card.one',revision:1,type:'choice' as const,tags:[],revisionProgress:'preserve' as const,
        lexiconRefs:[],prompt:{ru:'Один'},options:[{ru:'A'},{ru:'B'}],correctIndex:0
      },
      {
        id:'card.two',revision:1,type:'choice' as const,tags:[],revisionProgress:'preserve' as const,
        lexiconRefs:[],prompt:{ru:'Два'},options:[{ru:'A'},{ru:'B'}],correctIndex:0
      }
    ],
    resources:[]
  },
  roadmap:{
    id:'main',
    title:{ru:'Путь'},
    nodes:[node]
  },
  progress:emptyCourseProgress(),
  roadmapProgress:{
    nodes:[{node,complete:false,unlocked:true}],
    currentNode:node,
    currentDayIndex:2,
    completedCount:1,
    requiredCount:4,
    courseComplete:false
  },
  currentNode:node,
  currentDayIndex:2,
  access:'full',
  fromCache:false
};

function runtime(overrides:Partial<LearnerCourseRuntimeValue>={}):LearnerCourseRuntimeValue{
  return {
    state,
    status:'ready',
    error:null,
    refresh:async()=>{},
    ...overrides
  };
}

function renderToday(
  value:LearnerCourseRuntimeValue,
  onStart=vi.fn(),
  onReview=vi.fn(),
  onMap=vi.fn(),
  onAccess=vi.fn(),
  activeDayProgress:Parameters<typeof TodayView>[0]['activeDayProgress']={},
  recentCompletionNodeId:Parameters<typeof TodayView>[0]['recentCompletionNodeId']=null
){
  render(
    <I18nProvider
      dictionaries={dictionaries}
      config={{locales:['ru'],default:'ru'}}
      storageKey="today-test.locale"
      systemLanguages={['ru']}
    >
      <TodayView
        runtime={value}
        onStart={onStart}
        onReview={onReview}
        onMap={onMap}
        onAccess={onAccess}
        activeDayProgress={activeDayProgress}
        recentCompletionNodeId={recentCompletionNodeId}
      />
    </I18nProvider>
  );
  return {onStart,onReview,onMap,onAccess};
}

describe('Today learner shell',()=>{
  it('shows current-day progress without mixing in the course-day counter',()=>{
    renderToday(runtime());

    expect(screen.getByRole('heading',{name:'Сегодня'})).toBeTruthy();
    expect(screen.getByText('День 2')).toBeTruthy();
    expect(screen.getByRole('heading',{name:'Настоящее время'})).toBeTruthy();
    expect(screen.getByText('0 из 2 заданий · ~1 мин')).toBeTruthy();
    expect(screen.getByText('Основа фразы')).toBeTruthy();
    expect(screen.queryByText('1/4')).toBeNull();
    expect(screen.getByText('1 из 4 дней')).toBeTruthy();
    expect(screen.getByRole('button',{name:'Начать'})).toBeTruthy();
  });

  it('shows real 19 + 8 + 8 + 8 day progress and includes unfinished phrase state',()=>{
    const cards:Activity[]=Array.from({length:19},(_,index)=>({
      id:'big.'+(index+1),revision:1,type:'choice' as const,tags:[],revisionProgress:'preserve' as const,
      lexiconRefs:[],prompt:{ru:'Вопрос'},options:[{ru:'A'},{ru:'B'}],correctIndex:0
    }));
    const pattern:Extract<Activity,{type:'pattern-drill'}>={
      id:'big.pattern',revision:1,type:'pattern-drill',tags:[],revisionProgress:'preserve',
      lexiconRefs:[],pattern:{ru:'Привычки'},modes:['drill','listening','speaking'],
      items:Array.from({length:8},(_,index)=>({
        id:'big.p'+(index+1),prompt:{ru:'Фраза'},answer:{accepted:['Phrase'],nearMiss:true,caseSensitive:false}
      }))
    };
    const bigNode:RoadmapNode={
      id:'day-3',kind:'lesson' as const,title:{ru:'День 3'},dayIndex:3,order:2,prerequisites:[],
      activityIds:[...cards.map(card=>card.id),pattern.id],
      completion:{mode:'all',requirements:[
        {kind:'activity-seen',activityIds:cards.map(card=>card.id)},
        {kind:'practice-started',activityId:pattern.id,modes:['drill','listening','speaking']}
      ]},
      optional:false
    };
    const progress=emptyCourseProgress();
    for(const card of cards)progress.seen[card.id]={at:'2026-10-06T00:00:00Z'};
    const bigState:LearnerCourseState={
      ...state,
      set:{
        ...state.set,
        roadmaps:[{id:'main',title:{ru:'Путь'},nodes:[bigNode]}],
        activities:[...cards,pattern]
      },
      roadmap:{id:'main',title:{ru:'Путь'},nodes:[bigNode]},
      progress,
      roadmapProgress:{
        nodes:[{node:bigNode,complete:false,unlocked:true}],
        currentNode:bigNode,currentDayIndex:3,completedCount:2,requiredCount:40,courseComplete:false
      },
      currentNode:bigNode,
      currentDayIndex:3
    };

    renderToday(
      runtime({state:bigState}),
      vi.fn(),vi.fn(),vi.fn(),vi.fn(),
      {practice:[{activityId:pattern.id,mode:'drill',resolvedSteps:3,attemptedSteps:4,pendingCorrections:1}]}
    );

    expect(screen.getByText('22 из 43 заданий · ~12 мин')).toBeTruthy();
    expect(screen.getByRole('button',{name:'Продолжить'})).toBeTruthy();
  });

  it('keeps a completed 43/43 day on Today until the next day starts',async()=>{
    const user=userEvent.setup();
    const cards:Activity[]=Array.from({length:19},(_,index)=>({
      id:'done.'+(index+1),revision:1,type:'choice' as const,tags:[],revisionProgress:'preserve' as const,
      lexiconRefs:[],prompt:{ru:'Вопрос'},options:[{ru:'A'},{ru:'B'}],correctIndex:0
    }));
    const pattern:Extract<Activity,{type:'pattern-drill'}>={
      id:'done.pattern',revision:1,type:'pattern-drill',tags:[],revisionProgress:'preserve',
      lexiconRefs:[],pattern:{ru:'Привычки'},modes:['drill','listening','speaking'],
      items:Array.from({length:8},(_,index)=>({
        id:'done.p'+(index+1),prompt:{ru:'Фраза'},answer:{accepted:['Phrase'],nearMiss:true,caseSensitive:false}
      }))
    };
    const completedNode:RoadmapNode={
      id:'day-3',kind:'lesson',title:{ru:'День 3'},dayIndex:3,order:2,prerequisites:[],
      activityIds:[...cards.map(card=>card.id),pattern.id],
      completion:{mode:'all',requirements:[
        {kind:'activity-seen',activityIds:cards.map(card=>card.id)},
        {kind:'practice-started',activityId:pattern.id,modes:['drill','listening','speaking']}
      ]},
      optional:false
    };
    const nextActivity:Activity={
      id:'next.one',revision:1,type:'choice',tags:[],revisionProgress:'preserve',
      lexiconRefs:[],prompt:{ru:'Следующее'},options:[{ru:'A'},{ru:'B'}],correctIndex:0
    };
    const nextNode:RoadmapNode={
      id:'day-4',kind:'lesson',title:{ru:'День 4'},dayIndex:4,order:3,prerequisites:['day-3'],
      activityIds:[nextActivity.id],optional:false
    };
    const progress=emptyCourseProgress();
    for(const card of cards)progress.seen[card.id]={at:'2026-10-06T00:00:00Z'};
    for(const mode of ['drill','listening','speaking'] as const){
      progress.practice[mode][pattern.id]={
        box:0,due:1,completed:true,at:'2026-10-06T00:10:00Z'
      };
    }
    const completedState:LearnerCourseState={
      ...state,
      set:{
        ...state.set,
        roadmaps:[{id:'main',title:{ru:'Путь'},nodes:[completedNode,nextNode]}],
        activities:[...cards,pattern,nextActivity]
      },
      roadmap:{id:'main',title:{ru:'Путь'},nodes:[completedNode,nextNode]},
      progress,
      roadmapProgress:{
        nodes:[
          {node:completedNode,complete:true,unlocked:true},
          {node:nextNode,complete:false,unlocked:true}
        ],
        currentNode:nextNode,currentDayIndex:4,completedCount:3,requiredCount:40,courseComplete:false
      },
      currentNode:nextNode,
      currentDayIndex:4
    };
    const onStart=vi.fn();

    renderToday(
      runtime({state:completedState}),
      onStart,vi.fn(),vi.fn(),vi.fn(),{},
      completedNode.id
    );

    expect(screen.getByRole('heading',{name:'День 3 завершён'})).toBeTruthy();
    expect(screen.getByText('43 из 43')).toBeTruthy();
    expect(screen.getByText('Слабые места появятся в «Повторе».')).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Начать День 4'}));
    expect(onStart).toHaveBeenCalledWith('day-4');

    await user.click(screen.getByRole('button',{name:'Пройти ещё раз'}));
    expect(onStart).toHaveBeenCalledWith('day-3');
  });

  it('stops showing the completed-day hero once the next day has progress',()=>{
    const progress=emptyCourseProgress();
    progress.seen['card.one']={at:'2026-10-06T00:00:00Z'};
    const previousNode:RoadmapNode={
      id:'day-1',kind:'lesson',title:{ru:'День 1'},dayIndex:1,order:0,prerequisites:[],
      activityIds:[],optional:false
    };
    const startedState:LearnerCourseState={
      ...state,
      progress,
      set:{
        ...state.set,
        roadmaps:[{id:'main',title:{ru:'Путь'},nodes:[previousNode,node]}]
      },
      roadmap:{id:'main',title:{ru:'Путь'},nodes:[previousNode,node]},
      roadmapProgress:{
        ...state.roadmapProgress,
        nodes:[
          {node:previousNode,complete:true,unlocked:true},
          {node,complete:false,unlocked:true}
        ]
      }
    };

    renderToday(runtime({state:startedState}),vi.fn(),vi.fn(),vi.fn(),vi.fn(),{},previousNode.id);

    expect(screen.queryByRole('heading',{name:'День 1 завершён'})).toBeNull();
    expect(screen.getByText('День 2')).toBeTruthy();
    expect(screen.getByRole('button',{name:'Продолжить'})).toBeTruthy();
  });

  it('shows Continue even when every attempted task is still wrong',()=>{
    renderToday(
      runtime(),
      vi.fn(),vi.fn(),vi.fn(),vi.fn(),
      {tasks:{attemptedSteps:2,pendingCorrections:2}}
    );

    expect(screen.getByText('0 из 2 заданий · ~1 мин')).toBeTruthy();
    expect(screen.getByRole('button',{name:'Продолжить'})).toBeTruthy();
  });

  it('does not offer replaying current-day tasks from the Today hero',()=>{
    const progress=emptyCourseProgress();
    progress.seen['card.one']={at:'2026-10-05T10:00:00Z'};
    renderToday(runtime({state:{...state,progress}}));

    expect(screen.getByRole('button',{name:'Продолжить'})).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Повторить задания'})).toBeNull();
  });

  it('opens the current node from Today',async()=>{
    const user=userEvent.setup();
    const {onStart}=renderToday(runtime(),vi.fn());

    await user.click(screen.getByRole('button',{name:'Начать'}));
    expect(onStart).toHaveBeenCalledWith('day-2');
  });

  it('shows due review as a separate required-today block',async()=>{
    const user=userEvent.setup();
    const progress=emptyCourseProgress();
    progress.cards['card.one']={box:2,due:0,at:'2026-09-29T00:00:00Z'};
    const reviewState={
      ...state,
      set:{
        ...state.set,
        activities:[{
          id:'card.one',
          revision:1,
          type:'text-input' as const,
          tags:[],
          revisionProgress:'preserve' as const,
          lexiconRefs:[],
          prompt:{ru:'Проверка'},
          answer:{accepted:['check'],nearMiss:true,caseSensitive:false}
        }]
      },
      progress
    };
    const onReview=vi.fn();
    renderToday(runtime({state:reviewState}),vi.fn(),onReview);

    expect(screen.getByRole('heading',{name:'Нужно сегодня'})).toBeTruthy();
    const reviewCard=screen.getByRole('button',{name:'Начать повтор: 1'});
    expect(reviewCard.textContent).toContain('1');
    expect(screen.queryByText('к повтору')).toBeNull();
    await user.click(screen.getByRole('button',{name:/Начать повтор/}));
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it('adds due personal words to the Today review count',()=>{
    const progress=emptyCourseProgress();
    const wordRuntime={
      words:{
        schemaVersion:1 as const,
        items:{
          'lex.home|noun':{
            lexemeId:'lex.home',
            senseId:'noun',
            box:1,
            due:0,
            at:'2026-09-29T00:00:00Z'
          }
        }
      },
      lexicon:{
        schemaVersion:1 as const,
        revision:1,
        entries:[{
          id:'lex.home',
          revision:1,
          language:'en' as const,
          lemma:'home',
          forms:[{text:'home',kind:'lemma' as const}],
          senses:[{id:'noun',translations:{ru:['дом']},tags:[]}],
          examples:[],
          deprecated:false
        }]
      },
      status:'ready' as const,
      error:null,
      fromCache:false,
      refresh:async()=>{}
    };
    render(
      <I18nProvider
        dictionaries={dictionaries}
        config={{locales:['ru'],default:'ru'}}
        storageKey="today-word-test.locale"
        systemLanguages={['ru']}
      >
        <TodayView
          runtime={runtime({state:{...state,progress}})}
          wordRuntime={wordRuntime}
          onStart={()=>{}}
          onReview={()=>{}}
          onMap={()=>{}}
          onAccess={()=>{}}
        />
      </I18nProvider>
    );

    const reviewCard=screen.getByRole('button',{name:'Начать повтор: 1'});
    expect(reviewCard.textContent).toContain('1');
    expect(screen.queryByText('к повтору')).toBeNull();
  });

  it('shows an offline badge for a cached course snapshot',()=>{
    renderToday(runtime({state:{...state,fromCache:true}}));
    expect(screen.getByText('Без интернета')).toBeTruthy();
  });

  it('does not show an empty review card when nothing is due',()=>{
    renderToday(runtime());
    expect(screen.queryByRole('heading',{name:'Нужно сегодня'})).toBeNull();
    expect(screen.queryByText('Пока пусто — фразы вернутся сами')).toBeNull();
    expect(screen.getByRole('heading',{name:'Дополнительно'})).toBeTruthy();
  });

  it('shows completion instead of a current node when the course is done',()=>{
    renderToday(runtime({
      state:{
        ...state,
        currentNode:null,
        currentDayIndex:null,
        roadmapProgress:{
          ...state.roadmapProgress,
          currentNode:null,
          currentDayIndex:null,
          completedCount:4,
          courseComplete:true
        }
      }
    }));

    expect(screen.getByRole('heading',{name:'Курс пройден'})).toBeTruthy();
    expect(screen.queryByText('4/4')).toBeNull();
    expect(screen.getByText('4 из 4 дней')).toBeTruthy();
    expect(screen.queryByText('День 2')).toBeNull();
  });

  it('explains when the free preview has reached the next paid day',async()=>{
    const user=userEvent.setup();
    const onAccess=vi.fn();
    const lockedNode={
      id:'day-8',
      kind:'lesson' as const,
      title:{ru:'День 8'},
      dayIndex:8,
      order:7,
      prerequisites:['day-7'],
      activityIds:[],
      optional:false
    };
    renderToday(runtime({
      state:{
        ...state,
        set:{
          ...state.set,
          access:{
            mode:'entitlement',
            entitlement:'course.general-foundation',
            freePreview:{kind:'first-days',days:7,learnedContentStaysAvailable:true}
          }
        },
        access:'preview',
        currentNode:null,
        currentDayIndex:null,
        roadmapProgress:{
          ...state.roadmapProgress,
          nodes:[{node:lockedNode,complete:false,unlocked:true}],
          currentNode:lockedNode,
          currentDayIndex:8,
          completedCount:7,
          requiredCount:40,
          courseComplete:false
        }
      }
    }),vi.fn(),vi.fn(),vi.fn(),onAccess);

    expect(screen.getByText('Бесплатная часть пройдена')).toBeTruthy();
    expect(screen.getByText(/полным доступом/)).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Открыть доступ'}));
    expect(onAccess).toHaveBeenCalledTimes(1);
  });

  it('lets the learner retry after a load error',async()=>{
    const refresh=vi.fn(async()=>{});
    renderToday(runtime({state:null,status:'error',error:new Error('offline'),refresh}));

    const user=userEvent.setup();
    await user.click(screen.getByRole('button',{name:'Повторить'}));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
