import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import type { LearnerCourseState } from './course-loader';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { emptyCourseProgress } from './progress';
import { firstIncompleteRequirementIndex, NodeRunnerView } from './learn';
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

/** A runtime whose refresh() marks the day complete, like the real one after saving. */
function LiveRunner(props:Omit<Parameters<typeof NodeRunnerView>[0],'runtime'>&{completeOnRefresh?:boolean}){
  const {completeOnRefresh=true,...rest}=props;
  const [value,setValue]=useState<LearnerCourseRuntimeValue>(()=>({
    ...runtime,
    refresh:async()=>{
      if(!completeOnRefresh)return;
      setValue(current=>({...current,state:{...current.state!,roadmapProgress:{...current.state!.roadmapProgress,nodes:[{node,complete:true,unlocked:true}]}}}));
    }
  }));
  return <NodeRunnerView runtime={value} {...rest} />;
}

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
      <LiveRunner
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

function storedRunMode():string|null{
  const raw=localStorage.getItem('unmute.lesson-run:general-foundation:day-1');
  return raw ? String(JSON.parse(raw).mode||'') : null;
}

// A choice is answered with two taps: the first picks the option, the second confirms it.
async function chooseAnswer(user:ReturnType<typeof userEvent.setup>,name:string){
  await user.click(await screen.findByRole('radio',{name}));
  await user.click(screen.getByRole('radio',{name:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}));
}

describe('node activity runner',()=>{
  beforeEach(()=>localStorage.clear());

  it('resumes at a seen pattern when a required practice mode is still missing',()=>{
    const practiceNode={
      ...node,
      activityIds:['choice.one','pattern.one','text.one'],
      completion:{
        mode:'all' as const,
        requirements:[
          {kind:'activity-seen' as const,activityIds:['choice.one','text.one']},
          {kind:'practice-started' as const,activityId:'pattern.one',modes:['drill' as const,'listening' as const]}
        ]
      }
    };
    const activities=[
      state.set.activities.find(activity=>activity.id==='choice.one')!,
      {
        id:'pattern.one',revision:1,type:'pattern-drill' as const,tags:[],revisionProgress:'preserve' as const,
        lexiconRefs:[],pattern:{ru:'Фразы'},modes:['drill' as const,'listening' as const],
        items:[{id:'p1',prompt:{ru:'Я здесь'},answer:{accepted:['I am here'],nearMiss:true,caseSensitive:false}}]
      },
      state.set.activities.find(activity=>activity.id==='text.one')!
    ];
    const progress=emptyCourseProgress();
    progress.seen['choice.one']={at:'2026-10-02T10:00:00Z'};
    progress.seen['pattern.one']={at:'2026-10-02T10:01:00Z'};
    progress.seen['text.one']={at:'2026-10-02T10:02:00Z'};
    progress.practice.drill['pattern.one']={box:1,due:100,at:'2026-10-02T10:01:00Z'};

    expect(firstIncompleteRequirementIndex(practiceNode,activities,progress)).toBe(1);
  });
  it('shows theory first, then the tasks; builds a new phrase from words; counts the day',async()=>{
    const user=userEvent.setup();
    const {saveSeen,saveGraded,onExit,onNodeCompleted}=renderRunner();

    // Theory is a page before the tasks, not a step of the lesson.
    expect(screen.getByText('Короткая теория')).toBeTruthy();
    await waitFor(()=>expect(storedRunMode()).toBe('first'));
    expect(screen.queryByRole('progressbar')).toBeNull();
    await user.click(screen.getByRole('button',{name:'К заданиям'}));
    expect(saveSeen).toHaveBeenCalledWith('general-foundation','theory.one');

    expect(await screen.findByRole('heading',{name:'Выбери ответ'})).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
    // The day's theory stays reachable without leaving the exercise.
    await user.click(screen.getByRole('button',{name:'Теория'}));
    expect(within(screen.getByRole('dialog')).getByText('Короткая теория')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Закрыть теорию'}));
    expect(screen.queryByRole('dialog')).toBeNull();
    await chooseAnswer(user,'I am here');
    expect(saveGraded).toHaveBeenCalledWith('general-foundation','choice.one',true,undefined,expect.any(String));
    expect(await screen.findByText('Верно')).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Далее'}));
    // A phrase never answered before is built from word chips.
    expect(await screen.findByText('Собери фразу из слов')).toBeTruthy();
    const pool=screen.getByLabelText('Слова');
    for(const word of ['I','am','here'])await user.click(within(pool).getByRole('button',{name:word}));
    await user.click(screen.getByRole('button',{name:'Готово'}));
    expect(saveGraded).toHaveBeenCalledWith('general-foundation','text.one',true,'build',expect.any(String));

    await user.click(screen.getByRole('button',{name:'Завершить'}));
    expect(await screen.findByText('День пройден')).toBeTruthy();
    expect(onNodeCompleted).toHaveBeenCalledTimes(1);
    expect(onNodeCompleted).toHaveBeenCalledWith(node);
    expect(screen.getByText('С первого раза верно: 2 из 2')).toBeTruthy();
    expect(onExit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button',{name:'Готово'}));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('does not count an answer until a failed save is retried',async()=>{
    const user=userEvent.setup();
    const saveGraded=vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    renderRunner(vi.fn(async()=>{}),saveGraded);

    await user.click(screen.getByRole('button',{name:'К заданиям'}));
    await chooseAnswer(user,'I am here');

    expect(await screen.findByText('Не сохранилось.')).toBeTruthy();
    expect(screen.getByText('Ответ пока не засчитан.')).toBeTruthy();
    expect(screen.queryByText('Верно')).toBeNull();

    await user.click(screen.getByRole('button',{name:'Повторить сохранение'}));
    expect(await screen.findByText('Верно')).toBeTruthy();
    expect(saveGraded).toHaveBeenCalledTimes(2);
    expect(saveGraded.mock.calls[1]?.[4]).toBe(saveGraded.mock.calls[0]?.[4]);
  });

  it('counts a keyboard typo as near miss instead of an SRS error',async()=>{
    const user=userEvent.setup();
    const {saveGraded}=renderRunner();

    await user.click(screen.getByRole('button',{name:'К заданиям'}));
    await chooseAnswer(user,'I am here');
    await user.click(await screen.findByRole('button',{name:'Далее'}));

    await user.click(screen.getByRole('button',{name:'Написать с клавиатуры'}));
    await user.type(await screen.findByRole('textbox',{name:'Твой ответ'}),'I am herw');
    await user.click(screen.getByRole('button',{name:'Готово'}));

    expect(await screen.findByText('Почти правильно')).toBeTruthy();
    expect(screen.getByText('Похоже на опечатку — ответ засчитан.')).toBeTruthy();
    expect(screen.getByText('Подходящий ответ: I am here')).toBeTruthy();
    expect(screen.queryByText('Это задание вернётся в конце урока.')).toBeNull();
    expect(saveGraded).toHaveBeenLastCalledWith(
      'general-foundation','text.one',true,'write',expect.any(String)
    );
  });

  it('brings a wrong answer back at the end and does not call an unfinished day done',async()=>{
    const user=userEvent.setup();
    const progress=emptyCourseProgress();
    progress.seen['theory.one']={at:'2026-09-29T01:00:00.000Z'};
    const saveGraded=vi.fn(async(_setId:string,_activityId:string,_correct:boolean)=>{});
    render(
      <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="learn-retry.locale" systemLanguages={['ru']}>
        <NodeRunnerView
          runtime={{...runtime,state:{...state,progress}}}
          nodeId="day-1"
          onExit={()=>{}}
          saveSeen={async()=>{}}
          saveGraded={saveGraded}
          savePractice={async()=>{}}
        />
      </I18nProvider>
    );
    await chooseAnswer(user,'I is here');
    expect(await screen.findByText('Это задание вернётся в конце урока.')).toBeTruthy();
    // The mistake does not add a task to the count.
    expect(screen.getByText('1/2')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Далее'}));
    expect(screen.getByText('2/2')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Написать с клавиатуры'}));
    await user.type(await screen.findByRole('textbox',{name:'Твой ответ'}),'I am here');
    await user.click(screen.getByRole('button',{name:'Готово'}));
    await user.click(screen.getByRole('button',{name:'Далее'}));
    // The mistake returns: same question, now in «работа над ошибками».
    expect(await screen.findByText('Работа над ошибками: 1 из 1')).toBeTruthy();
    expect(screen.getByText('2/2')).toBeTruthy();
    expect(screen.getByRole('heading',{name:'Выбери ответ'})).toBeTruthy();
    await chooseAnswer(user,'I am here');
    // «Работа над ошибками» is practice: the review schedule keeps the first (wrong) answer only.
    expect(saveGraded.mock.calls.filter(call=>call[1]==='choice.one')).toEqual([
      ['general-foundation','choice.one',false,undefined,expect.any(String)]
    ]);
    await user.click(screen.getByRole('button',{name:'Завершить'}));
    // The runtime here never marks the day complete: the summary says so honestly.
    expect(await screen.findByText('День пока не засчитан')).toBeTruthy();
    expect(screen.getByText('С первого раза верно: 1 из 2')).toBeTruthy();
  });

  it('restores an unfinished run with a wrong answer after closing the lesson',async()=>{
    const user=userEvent.setup();
    const progress=emptyCourseProgress();
    progress.seen['theory.one']={at:'2026-09-29T01:00:00.000Z'};
    const onExit=vi.fn();
    const view=render(
      <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="learn-persist.locale" systemLanguages={['ru']}>
        <NodeRunnerView
          runtime={{...runtime,state:{...state,progress}}}
          nodeId="day-1"
          onExit={onExit}
          saveSeen={async()=>{}}
          saveGraded={async()=>{}}
          savePractice={async()=>{}}
        />
      </I18nProvider>
    );

    await chooseAnswer(user,'I is here');
    expect(await screen.findByText('Это задание вернётся в конце урока.')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Закрыть урок'}));
    expect(screen.getByRole('heading',{name:'Выйти из урока?'})).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Выйти'}));
    expect(onExit).toHaveBeenCalledTimes(1);

    view.unmount();
    render(
      <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="learn-persist.locale" systemLanguages={['ru']}>
        <NodeRunnerView
          runtime={{...runtime,state:{...state,progress}}}
          nodeId="day-1"
          onExit={()=>{}}
          saveSeen={async()=>{}}
          saveGraded={async()=>{}}
          savePractice={async()=>{}}
        />
      </I18nProvider>
    );

    expect(await screen.findByText('Ответ неверный')).toBeTruthy();
    await waitFor(()=>expect(storedRunMode()).toBe('resume'));
    expect(screen.getByText('Это задание вернётся в конце урока.')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
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
    const saveGraded=vi.fn(async(_setId:string,_activityId:string,_correct:boolean)=>{});

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
          saveGraded={saveGraded}
          savePractice={async()=>{}}
        />
      </I18nProvider>
    );

    await user.click(screen.getByRole('button',{name:'К заданиям'}));
    await waitFor(()=>expect(storedRunMode()).toBe('replay'));
    await chooseAnswer(user,'I am here');
    await user.click(screen.getByRole('button',{name:'Далее'}));
    await user.click(await screen.findByRole('button',{name:'Написать с клавиатуры'}));
    const input=await screen.findByRole('textbox',{name:'Твой ответ'});
    await user.type(input,'I am here');
    await user.click(screen.getByRole('button',{name:'Готово'}));
    await user.click(screen.getByRole('button',{name:'Завершить'}));

    expect(onNodeCompleted).not.toHaveBeenCalled();
    // A replay is practice: review intervals and answer stats are left alone.
    expect(saveGraded).not.toHaveBeenCalled();
    expect(await screen.findByText('Верно: 2 из 2')).toBeTruthy();
    expect(screen.getByText('Это была тренировка: интервалы «Повтора» не изменились.')).toBeTruthy();
  });


  it('keeps the lesson header in sync with phrase progress inside speed practice',async()=>{
    const user=userEvent.setup();
    const patternActivity={
      id:'pattern.progress',revision:1,type:'pattern-drill' as const,tags:[],revisionProgress:'preserve' as const,
      lexiconRefs:[],pattern:{ru:'I / he + глагол'},modes:['drill' as const],
      items:[
        {id:'p1',prompt:{ru:'Я живу здесь.'},answer:{accepted:['I live here.'],nearMiss:true,caseSensitive:false}},
        {id:'p2',prompt:{ru:'Он живёт здесь.'},answer:{accepted:['He lives here.'],nearMiss:true,caseSensitive:false}}
      ]
    };
    const patternNode={
      id:'day-pattern',
      kind:'lesson' as const,
      title:{ru:'День паттерна'},
      dayIndex:2,
      order:1,
      prerequisites:[],
      activityIds:[patternActivity.id],
      optional:false
    };
    const patternState:LearnerCourseState={
      ...state,
      set:{
        ...state.set,
        roadmaps:[{id:'main',title:{ru:'Путь'},nodes:[patternNode]}],
        activities:[patternActivity]
      },
      roadmap:{id:'main',title:{ru:'Путь'},nodes:[patternNode]},
      roadmapProgress:{
        nodes:[{node:patternNode,complete:false,unlocked:true}],
        currentNode:patternNode,
        currentDayIndex:2,
        completedCount:0,
        requiredCount:1,
        courseComplete:false
      },
      currentNode:patternNode,
      currentDayIndex:2
    };
    const patternRuntime:LearnerCourseRuntimeValue={...runtime,state:patternState};

    render(
      <I18nProvider
        dictionaries={dictionaries}
        config={{locales:['ru'],default:'ru'}}
        storageKey="learn-pattern-progress.locale"
        systemLanguages={['ru']}
      >
        <NodeRunnerView
          runtime={patternRuntime}
          nodeId="day-pattern"
          onExit={()=>{}}
          saveSeen={async()=>{}}
          saveGraded={async()=>{}}
          savePractice={async()=>{}}
        />
      </I18nProvider>
    );

    await waitFor(()=>expect(screen.getByText('0/2')).toBeTruthy());
    await user.click(screen.getByRole('button',{name:'Начать'}));
    await waitFor(()=>expect(screen.getByText('1/2')).toBeTruthy());
    await user.click(screen.getByRole('button',{name:'Показать ответ'}));
    await user.click(screen.getByRole('button',{name:'Совпало'}));

    await waitFor(()=>expect(screen.getByText('2/2')).toBeTruthy());
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

    expect(screen.getByText('Этот урок сейчас недоступен')).toBeTruthy();
    expect(screen.queryByText('Короткая теория')).toBeNull();
  });
});
