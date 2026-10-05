import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import type { LearnerCourseState } from './course-loader';
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

function renderToday(value:LearnerCourseRuntimeValue,onStart=vi.fn(),onReview=vi.fn(),onMap=vi.fn(),onAccess=vi.fn()){
  render(
    <I18nProvider
      dictionaries={dictionaries}
      config={{locales:['ru'],default:'ru'}}
      storageKey="today-test.locale"
      systemLanguages={['ru']}
    >
      <TodayView runtime={value} onStart={onStart} onReview={onReview} onMap={onMap} onAccess={onAccess} />
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
