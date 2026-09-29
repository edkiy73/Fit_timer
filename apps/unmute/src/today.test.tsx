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
    activities:[],
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

function renderToday(value:LearnerCourseRuntimeValue,onStart=vi.fn()){
  render(
    <I18nProvider
      dictionaries={dictionaries}
      config={{locales:['ru'],default:'ru'}}
      storageKey="today-test.locale"
      systemLanguages={['ru']}
    >
      <TodayView runtime={value} onStart={onStart} />
    </I18nProvider>
  );
  return onStart;
}

describe('Today learner shell',()=>{
  it('shows current day, node and course progress',()=>{
    renderToday(runtime());

    expect(screen.getByRole('heading',{name:'Сегодня'})).toBeTruthy();
    expect(screen.getByText('День 2')).toBeTruthy();
    expect(screen.getByRole('heading',{name:'Настоящее время'})).toBeTruthy();
    expect(screen.getByText('Заданий: 2')).toBeTruthy();
    expect(screen.getByText('1/4')).toBeTruthy();
    expect(screen.getByRole('button',{name:'Начать'})).toBeTruthy();
  });

  it('opens the current node from Today',async()=>{
    const user=userEvent.setup();
    const onStart=renderToday(runtime(),vi.fn());

    await user.click(screen.getByRole('button',{name:'Начать'}));
    expect(onStart).toHaveBeenCalledWith('day-2');
  });

  it('shows an offline badge for a cached course snapshot',()=>{
    renderToday(runtime({state:{...state,fromCache:true}}));
    expect(screen.getByText('Офлайн-копия')).toBeTruthy();
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
    expect(screen.getByText('4/4')).toBeTruthy();
    expect(screen.queryByText('День 2')).toBeNull();
  });

  it('lets the learner retry after a load error',async()=>{
    const refresh=vi.fn(async()=>{});
    renderToday(runtime({state:null,status:'error',error:new Error('offline'),refresh}));

    const user=userEvent.setup();
    await user.click(screen.getByRole('button',{name:'Повторить'}));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
