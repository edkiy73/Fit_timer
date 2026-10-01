import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import type { LearnerCourseState } from './course-loader';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { dayNumberFromKey } from './engine/course-progress';
import { emptyCourseProgress, emptyStatsProgress, emptyWordsProgress } from './progress';
import { dictionaries } from './i18n';
import {
  ProgressView,
  buildProgressSummary,
  currentLearningStreak,
  type ProgressDetailsRuntime
} from './progress-screen';

const node={
  id:'day-1',
  kind:'lesson' as const,
  title:{ru:'День 1'},
  dayIndex:1,
  order:0,
  prerequisites:[],
  activityIds:['card.one'],
  optional:false
};

function learnerState():LearnerCourseState{
  return {
    set:{
      schemaVersion:1,
      id:'general-foundation',
      revision:1,
      slug:'general-foundation',
      title:{ru:'Курс'},
      level:{labels:[]},
      access:{mode:'free'},
      defaultRoadmapId:'main',
      roadmaps:[{id:'main',title:{ru:'Путь'},nodes:[node]}],
      activities:[],
      resources:[]
    },
    roadmap:{id:'main',title:{ru:'Путь'},nodes:[node]},
    progress:emptyCourseProgress(),
    roadmapProgress:{
      nodes:[{node,complete:false,unlocked:true}],
      currentNode:node,
      currentDayIndex:1,
      completedCount:0,
      requiredCount:40,
      courseComplete:false
    },
    currentNode:node,
    currentDayIndex:1,
    access:'full',
    fromCache:false
  };
}

function runtime(state:LearnerCourseState):LearnerCourseRuntimeValue{
  return {state,status:'ready',error:null,refresh:async()=>{}};
}

function details(
  stats=emptyStatsProgress(),
  words=emptyWordsProgress()
):ProgressDetailsRuntime{
  return {stats,words,status:'ready',error:null,refresh:async()=>{}};
}

function renderProgress(
  state:LearnerCourseState,
  stats=emptyStatsProgress(),
  words=emptyWordsProgress()
){
  render(
    <I18nProvider
      dictionaries={dictionaries}
      config={{locales:['ru'],default:'ru'}}
      storageKey="progress-screen-test.locale"
      systemLanguages={['ru']}
    >
      <ProgressView
        runtime={runtime(state)}
        details={details(stats,words)}
        todayDay={dayNumberFromKey('2026-09-29')}
        onExit={()=>{}}
      />
    </I18nProvider>
  );
}

describe('progress screen summary',()=>{
  it('uses only persisted course, SRS, stats and latest metric data',()=>{
    const state=learnerState();
    const p=state.progress;
    p.learningDays['2026-09-27']={at:'2026-09-27T10:00:00Z'};
    p.learningDays['2026-09-28']={at:'2026-09-28T10:00:00Z'};
    p.learningDays['2026-09-29']={at:'2026-09-29T10:00:00Z'};
    p.seen['card.one']={at:'2026-09-29T10:00:00Z'};
    p.cards['card.one']={box:2,due:dayNumberFromKey('2026-09-29'),at:'2026-09-29T10:00:00Z'};
    p.cards['card.two']={box:1,due:dayNumberFromKey('2026-10-02'),at:'2026-09-29T10:00:00Z'};
    p.practice.drill['pattern.one']={box:1,due:0,at:'2026-09-29T10:00:00Z'};
    p.practice.listening['pattern.one']={box:1,due:dayNumberFromKey('2026-10-02'),at:'2026-09-29T10:00:00Z'};
    p.metrics['speed:pattern.one']={value:80,at:'2026-09-29T10:00:00Z'};
    p.metrics['speed:pattern.two']={value:60,at:'2026-09-29T10:00:00Z'};
    p.metrics['dialogue-score:dialogue.one']={value:90,at:'2026-09-29T10:00:00Z'};
    state.roadmapProgress={...state.roadmapProgress,completedCount:7};

    const stats=emptyStatsProgress();
    stats.buckets['device|card.one']={
      deviceId:'device',
      activityId:'card.one',
      attempts:10,
      correct:7,
      wrong:3,
      at:'2026-09-29T10:00:00Z'
    };
    const words=emptyWordsProgress();
    words.items['lex.home|noun']={
      lexemeId:'lex.home',
      senseId:'noun',
      box:1,
      due:dayNumberFromKey('2026-09-29'),
      at:'2026-09-29T10:00:00Z'
    };

    const summary=buildProgressSummary(
      state,
      stats,
      words,
      dayNumberFromKey('2026-09-29')
    );

    expect(summary).toMatchObject({
      completedDays:7,
      requiredDays:40,
      learningDays:3,
      streak:3,
      activeCards:2,
      drill:1,
      listening:1,
      speaking:0,
      words:1,
      activeReviews:5,
      dueNow:3,
      answers:{attempts:10,correct:7,wrong:3,accuracy:70},
      speedAverage:70,
      speedSamples:2,
      dialogueAverage:90,
      dialogueSamples:1,
      hasActivity:true
    });
  });

  it('does not keep an old streak alive after a missed day',()=>{
    const state=learnerState();
    state.progress.learningDays['2026-09-24']={at:'2026-09-24T10:00:00Z'};
    state.progress.learningDays['2026-09-25']={at:'2026-09-25T10:00:00Z'};

    expect(currentLearningStreak(
      state.progress,
      dayNumberFromKey('2026-09-29')
    )).toBe(0);
  });

  it('shows a real empty state instead of zero accuracy and zero performance',()=>{
    renderProgress(learnerState());

    expect(screen.getByRole('heading',{name:'Прогресс'})).toBeTruthy();
    expect(screen.getByText('Здесь появится твой прогресс')).toBeTruthy();
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('renders stored accuracy and latest performance averages when they exist',()=>{
    const state=learnerState();
    state.progress.learningDays['2026-09-29']={at:'2026-09-29T10:00:00Z'};
    state.progress.metrics['speed:pattern.one']={value:75,at:'2026-09-29T10:00:00Z'};
    const stats=emptyStatsProgress();
    stats.buckets['device|one']={
      deviceId:'device',
      activityId:'one',
      attempts:4,
      correct:3,
      wrong:1,
      at:'2026-09-29T10:00:00Z'
    };

    renderProgress(state,stats);

    expect(screen.getAllByText('75%')).toHaveLength(2);
    expect(screen.getByText('Попыток').parentElement?.textContent).toContain('4');
    expect(screen.getByText('Верно').parentElement?.textContent).toContain('3');
    expect(screen.getByText('Ошибок').parentElement?.textContent).toContain('1');
    expect(screen.getByText('Фразы на скорость: сколько успеваешь вовремя')).toBeTruthy();
  });
});
