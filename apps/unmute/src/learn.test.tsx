import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import type { LearnerCourseState } from './course-loader';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { emptyCourseProgress } from './progress';
import { NodeRunnerView } from './learn';
import { dictionaries } from './i18n';

const node={
  id:'day-1',
  kind:'lesson' as const,
  title:{ru:'Первый день'},
  dayIndex:1,
  order:0,
  prerequisites:[],
  activityIds:['theory.one','choice.one','text.one'],
  optional:false
};

const state:LearnerCourseState={
  set:{
    schemaVersion:1,
    id:'general-foundation',
    revision:1,
    slug:'general-foundation',
    title:{ru:'Основной курс'},
    level:{from:'a1',to:'b1',labels:[]},
    access:{mode:'free'},
    defaultRoadmapId:'main',
    roadmaps:[{id:'main',title:{ru:'Путь'},nodes:[node]}],
    activities:[
      {
        id:'theory.one',revision:1,type:'theory',tags:[],revisionProgress:'preserve',
        lexiconRefs:[],body:{ru:'Короткая теория'},format:'text'
      },
      {
        id:'choice.one',revision:1,type:'choice',tags:[],revisionProgress:'preserve',
        lexiconRefs:[],prompt:{ru:'Выбери ответ'},options:[{ru:'I am here'},{ru:'I is here'}],
        correctIndex:0
      },
      {
        id:'text.one',revision:1,type:'text-input',tags:[],revisionProgress:'preserve',
        lexiconRefs:[],prompt:{ru:'Напиши: Я здесь'},answer:{
          accepted:['I am here'],nearMiss:true,caseSensitive:false
        }
      }
    ],
    resources:[]
  },
  roadmap:{id:'main',title:{ru:'Путь'},nodes:[node]},
  progress:emptyCourseProgress(),
  roadmapProgress:{
    nodes:[{node,complete:false,unlocked:true}],
    currentNode:node,
    currentDayIndex:1,
    completedCount:0,
    requiredCount:1,
    courseComplete:false
  },
  currentNode:node,
  currentDayIndex:1,
  access:'full',
  fromCache:false
};

const runtime:LearnerCourseRuntimeValue={
  state,
  status:'ready',
  error:null,
  refresh:async()=>{}
};

function renderRunner(
  saveSeen=vi.fn(async()=>{}),
  saveGraded=vi.fn(async()=>{}),
  savePractice=vi.fn(async()=>{}),
  onNodeCompleted=vi.fn()
){
  const onExit=vi.fn();
  render(
    <I18nProvider
      dictionaries={dictionaries}
      config={{locales:['ru'],default:'ru'}}
      storageKey="learn-test.locale"
      systemLanguages={['ru']}
    >
      <NodeRunnerView
        runtime={runtime}
        nodeId="day-1"
        onExit={onExit}
        onNodeCompleted={onNodeCompleted}
        saveSeen={saveSeen}
        saveGraded={saveGraded}
        savePractice={savePractice}
      />
    </I18nProvider>
  );
  return {saveSeen,saveGraded,savePractice,onExit,onNodeCompleted};
}

describe('node activity runner',()=>{
  it('moves through theory, choice and text input while saving progress',async()=>{
    const user=userEvent.setup();
    const {saveSeen,saveGraded,onExit,onNodeCompleted}=renderRunner();

    expect(screen.getByText('Короткая теория')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Продолжить'}));
    expect(saveSeen).toHaveBeenCalledWith('general-foundation','theory.one');

    expect(await screen.findByRole('heading',{name:'Выбери ответ'})).toBeTruthy();
    // The day's theory stays reachable without leaving the exercise.
    await user.click(screen.getByRole('button',{name:'Теория'}));
    expect(within(screen.getByRole('dialog')).getByText('Короткая теория')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Закрыть теорию'}));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('radio',{name:'I am here'}));
    await user.click(screen.getByRole('button',{name:'Проверить'}));
    expect(saveGraded).toHaveBeenCalledWith('general-foundation','choice.one',true);
    expect(await screen.findByText('Верно')).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Далее'}));
    const input=await screen.findByRole('textbox',{name:'Твой ответ'});
    await user.type(input,'I am here');
    await user.click(screen.getByRole('button',{name:'Проверить'}));
    expect(saveGraded).toHaveBeenCalledWith('general-foundation','text.one',true);

    await user.click(screen.getByRole('button',{name:'Завершить'}));
    expect(onNodeCompleted).toHaveBeenCalledTimes(1);
    expect(onNodeCompleted).toHaveBeenCalledWith(node);
    // A short summary closes the lesson instead of dropping straight back to the map.
    expect(await screen.findByText('Урок пройден')).toBeTruthy();
    expect(screen.getByText('Верных ответов: 2 из 2')).toBeTruthy();
    expect(onExit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button',{name:'Готово'}));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('does not count a replay of an already completed node as a new completion',async()=>{
    const user=userEvent.setup();
    const completedRuntime:LearnerCourseRuntimeValue={
      ...runtime,
      state:{
        ...state,
        roadmapProgress:{
          ...state.roadmapProgress,
          nodes:[{node,complete:true,unlocked:true}],
          currentNode:null,
          currentDayIndex:null,
          completedCount:1,
          requiredCount:1,
          courseComplete:true
        }
      }
    };
    const onNodeCompleted=vi.fn();

    render(
      <I18nProvider
        dictionaries={dictionaries}
        config={{locales:['ru'],default:'ru'}}
        storageKey="learn-complete-replay.locale"
        systemLanguages={['ru']}
      >
        <NodeRunnerView
          runtime={completedRuntime}
          nodeId="day-1"
          onExit={()=>{}}
          onNodeCompleted={onNodeCompleted}
          saveSeen={async()=>{}}
          saveGraded={async()=>{}}
          savePractice={async()=>{}}
        />
      </I18nProvider>
    );

    await user.click(screen.getByRole('button',{name:'Продолжить'}));
    await user.click(await screen.findByRole('radio',{name:'I am here'}));
    await user.click(screen.getByRole('button',{name:'Проверить'}));
    await user.click(screen.getByRole('button',{name:'Далее'}));
    const input=await screen.findByRole('textbox',{name:'Твой ответ'});
    await user.type(input,'I am here');
    await user.click(screen.getByRole('button',{name:'Проверить'}));
    await user.click(screen.getByRole('button',{name:'Завершить'}));

    expect(onNodeCompleted).not.toHaveBeenCalled();
  });

  it('resumes from the first activity that is not already seen',()=>{
    const progress=emptyCourseProgress();
    progress.seen['theory.one']={at:'2026-09-29T01:00:00.000Z'};
    const resumeRuntime={...runtime,state:{...state,progress}};

    render(
      <I18nProvider
        dictionaries={dictionaries}
        config={{locales:['ru'],default:'ru'}}
        storageKey="learn-resume.locale"
        systemLanguages={['ru']}
      >
        <NodeRunnerView
          runtime={resumeRuntime}
          nodeId="day-1"
          onExit={()=>{}}
          saveSeen={async()=>{}}
          saveGraded={async()=>{}}
          savePractice={async()=>{}}
        />
      </I18nProvider>
    );

    expect(screen.getByRole('heading',{name:'Выбери ответ'})).toBeTruthy();
  });

  it('does not open a paid cached lesson by direct route after access ends',()=>{
    const paidState:LearnerCourseState={
      ...state,
      set:{
        ...state.set,
        access:{
          mode:'entitlement',
          entitlement:'course.general-foundation',
          freePreview:{kind:'first-days',days:0,learnedContentStaysAvailable:true}
        }
      },
      access:'preview',
      currentNode:null,
      currentDayIndex:null
    };
    const paidRuntime:LearnerCourseRuntimeValue={
      ...runtime,
      state:paidState
    };

    render(
      <I18nProvider
        dictionaries={dictionaries}
        config={{locales:['ru'],default:'ru'}}
        storageKey="learn-paid-cache.locale"
        systemLanguages={['ru']}
      >
        <NodeRunnerView
          runtime={paidRuntime}
          nodeId="day-1"
          onExit={()=>{}}
          saveSeen={async()=>{}}
          saveGraded={async()=>{}}
          savePractice={async()=>{}}
        />
      </I18nProvider>
    );

    expect(screen.getByText('Этот шаг сейчас недоступен')).toBeTruthy();
    expect(screen.queryByText('Короткая теория')).toBeNull();
  });
});
