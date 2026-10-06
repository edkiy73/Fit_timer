import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import type { LearnerCourseState } from './course-loader';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { emptyCourseProgress, type CourseProgressDocument } from './progress';
import { firstIncompleteRequirementIndex, firstMissingRequirementTarget, NodeRunnerView } from './learn';
import { dictionaries } from './i18n';
import { SYSTEM_BACK_EVENT } from './native-back';

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
  it('chooses the earliest unresolved required target in lesson order',()=>{
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
    const pattern={
      id:'pattern.one',revision:1,type:'pattern-drill' as const,tags:[],revisionProgress:'preserve' as const,
      lexiconRefs:[],pattern:{ru:'Фразы'},modes:['drill' as const,'listening' as const],
      items:[{id:'p1',prompt:{ru:'Я здесь'},answer:{accepted:['I am here'],nearMiss:true,caseSensitive:false}}]
    };
    const steps=[
      state.set.activities.find(activity=>activity.id==='choice.one')!,
      pattern,
      state.set.activities.find(activity=>activity.id==='text.one')!
    ];
    const progress=emptyCourseProgress();
    progress.seen['choice.one']={at:'2026-10-06T00:00:00Z'};
    progress.practice.drill['pattern.one']={box:1,due:1,completed:true,at:'2026-10-06T00:01:00Z'};

    expect(firstMissingRequirementTarget(practiceNode,steps,progress)).toEqual({
      index:1,
      mode:'listening'
    });

    progress.practice.listening['pattern.one']={box:1,due:1,completed:true,at:'2026-10-06T00:02:00Z'};
    expect(firstMissingRequirementTarget(practiceNode,steps,progress)).toEqual({index:2});
  });

  it('opens the exact practice mode requested from Route instead of falling back to tasks',async()=>{
    const routeNode={
      ...node,
      id:'day-route-practice',
      activityIds:['theory.one','choice.one','pattern.route']
    };
    const routePattern={
      id:'pattern.route',
      revision:1,
      type:'pattern-drill' as const,
      tags:[],
      revisionProgress:'preserve' as const,
      lexiconRefs:[],
      pattern:{ru:'Фразы'},
      modes:['drill' as const,'listening' as const,'speaking' as const],
      items:[{id:'p1',prompt:{ru:'Я здесь'},answer:{accepted:['I am here'],nearMiss:true,caseSensitive:false}}]
    };
    const progress=emptyCourseProgress();
    progress.seen['theory.one']={at:'2026-10-05T10:00:00Z'};
    const routeState:LearnerCourseState={
      ...state,
      set:{
        ...state.set,
        roadmaps:[{id:'main',title:{ru:'Путь'},nodes:[routeNode]}],
        activities:[
          state.set.activities.find(activity=>activity.id==='theory.one')!,
          state.set.activities.find(activity=>activity.id==='choice.one')!,
          routePattern
        ]
      },
      roadmap:{id:'main',title:{ru:'Путь'},nodes:[routeNode]},
      progress,
      roadmapProgress:{
        ...state.roadmapProgress,
        nodes:[{node:routeNode,complete:false,unlocked:true}],
        currentNode:routeNode
      },
      currentNode:routeNode
    };

    render(
      <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="learn-route-mode.locale" systemLanguages={['ru']}>
        <NodeRunnerView
          runtime={{...runtime,state:routeState}}
          nodeId={routeNode.id}
          startMode="listening"
          onExit={()=>{}}
          saveSeen={async()=>{}}
          saveGraded={async()=>{}}
          savePractice={async()=>{}}
        />
      </I18nProvider>
    );

    expect(await screen.findByText('Фразы')).toBeTruthy();
    expect(screen.getByRole('button',{name:'Начать'})).toBeTruthy();
    expect(screen.queryByRole('heading',{name:'Выбери ответ'})).toBeNull();
  });

  it('continues to the next required practice mode instead of showing an incomplete-day summary',async()=>{
    const user=userEvent.setup();
    const pattern={
      id:'pattern.flow',
      revision:1,
      type:'pattern-drill' as const,
      tags:[],
      revisionProgress:'preserve' as const,
      lexiconRefs:[],
      pattern:{ru:'Фразы'},
      modes:['drill' as const,'listening' as const],
      items:[{
        id:'flow.p1',
        prompt:{ru:'Я здесь'},
        answer:{accepted:['I am here'],nearMiss:true,caseSensitive:false}
      }]
    };
    const flowNode={
      id:'day-flow',
      kind:'lesson' as const,
      title:{ru:'День потока'},
      dayIndex:2,
      order:1,
      prerequisites:[],
      activityIds:[pattern.id],
      completion:{
        mode:'all' as const,
        requirements:[{
          kind:'practice-started' as const,
          activityId:pattern.id,
          modes:['drill' as const,'listening' as const]
        }]
      },
      optional:false
    };

    function FlowHarness(){
      const [progress,setProgress]=useState<CourseProgressDocument>(()=>emptyCourseProgress());
      const complete=Boolean(
        progress.practice.drill[pattern.id]?.completed&&
        progress.practice.listening[pattern.id]?.completed
      );
      const flowState:LearnerCourseState={
        ...state,
        set:{
          ...state.set,
          roadmaps:[{id:'main',title:{ru:'Путь'},nodes:[flowNode]}],
          activities:[pattern]
        },
        roadmap:{id:'main',title:{ru:'Путь'},nodes:[flowNode]},
        progress,
        roadmapProgress:{
          nodes:[{node:flowNode,complete,unlocked:true}],
          currentNode:complete?null:flowNode,
          currentDayIndex:complete?null:2,
          completedCount:complete?1:0,
          requiredCount:1,
          courseComplete:complete
        },
        currentNode:complete?null:flowNode,
        currentDayIndex:complete?null:2
      };
      const savePractice=async(
        _setId:string,
        activityId:string,
        mode:'drill'|'listening'|'speaking',
        correct:boolean
      )=>{
        setProgress(current=>({
          ...current,
          practice:{
            ...current.practice,
            [mode]:{
              ...current.practice[mode],
              [activityId]:{
                box:correct?1:0,
                due:0,
                completed:true,
                at:'2026-10-06T00:00:00Z'
              }
            }
          }
        }));
      };
      return (
        <NodeRunnerView
          runtime={{state:flowState,status:'ready',error:null,refresh:async()=>{}}}
          nodeId={flowNode.id}
          startMode="drill"
          onExit={()=>{}}
          saveSeen={async()=>{}}
          saveGraded={async()=>{}}
          savePractice={savePractice}
        />
      );
    }

    render(
      <I18nProvider
        dictionaries={dictionaries}
        config={{locales:['ru'],default:'ru'}}
        storageKey="learn-required-flow.locale"
        systemLanguages={['ru']}
      >
        <FlowHarness />
      </I18nProvider>
    );

    await user.click(await screen.findByRole('button',{name:'Начать'}));
    await user.click(screen.getByRole('button',{name:'Готово'}));
    await user.click(screen.getByRole('button',{name:'Совпало'}));
    expect(await screen.findByText('1 из 1 вовремя')).toBeTruthy();
    await waitFor(()=>expect(localStorage.getItem('unmute.lesson-run:general-foundation:day-flow')).toBeTruthy());
    const flowRunId=String(JSON.parse(localStorage.getItem('unmute.lesson-run:general-foundation:day-flow')!).runId);

    const drillNext=screen.getByRole('button',{name:'Далее'});
    await waitFor(()=>expect(drillNext.hasAttribute('disabled')).toBe(false));
    await user.click(drillNext);
    expect(await screen.findByText('Паттерн пройден')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Далее'}));

    expect(await screen.findByText('Тренируем слух: понимать фразу с первого раза, без текста.')).toBeTruthy();
    await waitFor(()=>{
      const saved=JSON.parse(localStorage.getItem('unmute.lesson-run:general-foundation:day-flow')!);
      expect(saved.runId).toBe(flowRunId);
      expect(saved.mode).toBe('first');
      expect(saved.practiceMode).toBe('listening');
    });
    expect(screen.queryByText('День пока не засчитан')).toBeNull();
  });

  it('shows theory first, then the tasks; builds a new phrase from words; counts the day',async()=>{
    const user=userEvent.setup();
    const {saveSeen,saveGraded,onExit,onNodeCompleted}=renderRunner();

    // Theory is a page before the tasks, not a step of the lesson.
    expect(screen.getByText('Короткая теория')).toBeTruthy();
    expect(document.querySelector('.runner-top-intro')).toBeTruthy();
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

  it('accepts a keyboard typo without creating SRS debt',async()=>{
    const user=userEvent.setup();
    const {saveSeen,saveGraded}=renderRunner();

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
    // Only the preceding exact choice was graded; the typo itself creates no SRS write.
    expect(saveGraded).toHaveBeenCalledTimes(1);
    expect(saveSeen).toHaveBeenCalledWith('general-foundation','text.one');
  });

  it('keeps a wrong answer in correction until it is actually resolved',async()=>{
    const user=userEvent.setup();
    const progress=emptyCourseProgress();
    progress.seen['theory.one']={at:'2026-09-29T01:00:00.000Z'};
    const saveSeen=vi.fn(async(_setId:string,_activityId:string)=>{});
    const saveGraded=vi.fn(async(_setId:string,_activityId:string,_correct:boolean)=>{});
    render(
      <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="learn-retry.locale" systemLanguages={['ru']}>
        <NodeRunnerView
          runtime={{...runtime,state:{...state,progress}}}
          nodeId="day-1"
          onExit={()=>{}}
          saveSeen={saveSeen}
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
    expect(await screen.findByText('Работа над ошибками · осталось 1')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.queryByText('2/2')).toBeNull();
    expect(screen.getByRole('heading',{name:'Выбери ответ'})).toBeTruthy();

    // A second mistake must not fall out of the queue after one retry.
    await chooseAnswer(user,'I is here');
    expect(saveSeen.mock.calls.filter(call=>call[1]==='choice.one')).toEqual([]);
    await user.click(await screen.findByRole('button',{name:'Далее'}));
    expect(await screen.findByText('Работа над ошибками · осталось 1')).toBeTruthy();

    await chooseAnswer(user,'I am here');
    // Correction resolves the lesson step but does not grade SRS/stats a second time.
    expect(saveGraded.mock.calls.filter(call=>call[1]==='choice.one')).toEqual([
      ['general-foundation','choice.one',false,undefined,expect.any(String)]
    ]);
    expect(saveSeen).toHaveBeenCalledWith('general-foundation','choice.one');
  });

  it('uses Android Back only to open and close the lesson exit confirmation',async()=>{
    const {onExit}=renderRunner();

    expect(window.dispatchEvent(new Event(SYSTEM_BACK_EVENT,{cancelable:true}))).toBe(false);
    expect(await screen.findByRole('heading',{name:'Выйти из урока?'})).toBeTruthy();
    expect(onExit).not.toHaveBeenCalled();

    expect(window.dispatchEvent(new Event(SYSTEM_BACK_EVENT,{cancelable:true}))).toBe(false);
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
    expect(onExit).not.toHaveBeenCalled();
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


  it('finishes regular-task corrections before entering required practice',async()=>{
    const user=userEvent.setup();
    const patternActivity={
      id:'pattern.section-order',revision:1,type:'pattern-drill' as const,tags:[],revisionProgress:'preserve' as const,
      lexiconRefs:[],pattern:{ru:'Фразы'},modes:['drill' as const],
      items:[{id:'p1',prompt:{ru:'Я здесь'},answer:{accepted:['I am here'],nearMiss:true,caseSensitive:false}}]
    };
    const sectionNode={
      id:'day-section-order',
      kind:'lesson' as const,
      title:{ru:'Порядок разделов'},
      dayIndex:2,
      order:1,
      prerequisites:[],
      activityIds:['choice.one','text.one',patternActivity.id],
      completion:{
        mode:'all' as const,
        requirements:[
          {kind:'activity-seen' as const,activityIds:['choice.one','text.one']},
          {kind:'practice-started' as const,activityId:patternActivity.id,modes:['drill' as const]}
        ]
      },
      optional:false
    };
    const sectionState:LearnerCourseState={
      ...state,
      set:{
        ...state.set,
        roadmaps:[{id:'main',title:{ru:'Путь'},nodes:[sectionNode]}],
        activities:[
          state.set.activities.find(activity=>activity.id==='choice.one')!,
          state.set.activities.find(activity=>activity.id==='text.one')!,
          patternActivity
        ]
      },
      roadmap:{id:'main',title:{ru:'Путь'},nodes:[sectionNode]},
      progress:emptyCourseProgress(),
      roadmapProgress:{
        nodes:[{node:sectionNode,complete:false,unlocked:true}],
        currentNode:sectionNode,currentDayIndex:2,completedCount:0,requiredCount:1,courseComplete:false
      },
      currentNode:sectionNode,
      currentDayIndex:2
    };

    render(
      <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="learn-section-order.locale" systemLanguages={['ru']}>
        <NodeRunnerView
          runtime={{...runtime,state:sectionState}}
          nodeId={sectionNode.id}
          onExit={()=>{}}
          saveSeen={async()=>{}}
          saveGraded={async()=>{}}
          savePractice={async()=>{}}
        />
      </I18nProvider>
    );

    expect(await screen.findByText('1/2')).toBeTruthy();
    await chooseAnswer(user,'I is here');
    await user.click(await screen.findByRole('button',{name:'Далее'}));

    expect(screen.getByText('2/2')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Написать с клавиатуры'}));
    await user.type(await screen.findByRole('textbox',{name:'Твой ответ'}),'I am here');
    await user.click(screen.getByRole('button',{name:'Готово'}));
    await user.click(await screen.findByRole('button',{name:'Далее'}));

    expect(await screen.findByText('Работа над ошибками · осталось 1')).toBeTruthy();
    expect(screen.getByRole('heading',{name:'Выбери ответ'})).toBeTruthy();
    expect(screen.queryByText('Тренируем скорость: фразы должны вылетать без раздумий.')).toBeNull();
  });

  it('keeps the exact task section and run id after switching to practice and killing the view',async()=>{
    const user=userEvent.setup();
    const patternActivity={
      id:'pattern.section-resume',revision:1,type:'pattern-drill' as const,tags:[],revisionProgress:'preserve' as const,
      lexiconRefs:[],pattern:{ru:'Фразы'},modes:['drill' as const],
      items:[{id:'p1',prompt:{ru:'Я здесь'},answer:{accepted:['I am here'],nearMiss:true,caseSensitive:false}}]
    };
    const sectionNode={
      id:'day-section-resume',
      kind:'lesson' as const,
      title:{ru:'Resume разделов'},
      dayIndex:2,
      order:1,
      prerequisites:[],
      activityIds:['choice.one','text.one',patternActivity.id],
      completion:{
        mode:'all' as const,
        requirements:[
          {kind:'activity-seen' as const,activityIds:['choice.one','text.one']},
          {kind:'practice-started' as const,activityId:patternActivity.id,modes:['drill' as const]}
        ]
      },
      optional:false
    };
    const sectionState:LearnerCourseState={
      ...state,
      set:{
        ...state.set,
        roadmaps:[{id:'main',title:{ru:'Путь'},nodes:[sectionNode]}],
        activities:[
          state.set.activities.find(activity=>activity.id==='choice.one')!,
          state.set.activities.find(activity=>activity.id==='text.one')!,
          patternActivity
        ]
      },
      roadmap:{id:'main',title:{ru:'Путь'},nodes:[sectionNode]},
      progress:emptyCourseProgress(),
      roadmapProgress:{
        nodes:[{node:sectionNode,complete:false,unlocked:true}],
        currentNode:sectionNode,currentDayIndex:2,completedCount:0,requiredCount:1,courseComplete:false
      },
      currentNode:sectionNode,
      currentDayIndex:2
    };
    const sectionRuntime:LearnerCourseRuntimeValue={...runtime,state:sectionState};
    const renderSection=()=>render(
      <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="learn-section-resume.locale" systemLanguages={['ru']}>
        <NodeRunnerView
          runtime={sectionRuntime}
          nodeId={sectionNode.id}
          onExit={()=>{}}
          saveSeen={async()=>{}}
          saveGraded={async()=>{}}
          savePractice={async()=>{}}
        />
      </I18nProvider>
    );

    const view=renderSection();
    await chooseAnswer(user,'I is here');
    await user.click(await screen.findByRole('button',{name:'Далее'}));
    expect(await screen.findByRole('heading',{name:'Напиши: Я здесь'})).toBeTruthy();

    await waitFor(()=>{
      const raw=localStorage.getItem('unmute.lesson-run:general-foundation:day-section-resume');
      expect(raw).toBeTruthy();
    });
    const beforeSwitch=JSON.parse(localStorage.getItem('unmute.lesson-run:general-foundation:day-section-resume')!);
    const runId=String(beforeSwitch.runId);

    await user.click(screen.getByRole('button',{name:'На скорость'}));
    expect(await screen.findByText('Тренируем скорость: фразы должны вылетать без раздумий.')).toBeTruthy();
    await waitFor(()=>{
      const saved=JSON.parse(localStorage.getItem('unmute.lesson-run:general-foundation:day-section-resume')!);
      expect(saved.runId).toBe(runId);
      expect(saved.mode).toBe(beforeSwitch.mode);
      expect(saved.taskSection?.pos).toBe(1);
      expect(saved.taskSection?.firstPassResults?.['0']).toBe(false);
    });

    view.unmount();
    renderSection();
    expect(await screen.findByText('Тренируем скорость: фразы должны вылетать без раздумий.')).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Задания'}));
    expect(await screen.findByRole('heading',{name:'Напиши: Я здесь'})).toBeTruthy();
    expect(screen.getByText('2/2')).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Написать с клавиатуры'}));
    await user.type(await screen.findByRole('textbox',{name:'Твой ответ'}),'I am here');
    await user.click(screen.getByRole('button',{name:'Готово'}));
    await user.click(await screen.findByRole('button',{name:'Далее'}));

    expect(await screen.findByText('Работа над ошибками · осталось 1')).toBeTruthy();
    expect(screen.getByRole('heading',{name:'Выбери ответ'})).toBeTruthy();
  });

  it('keeps the lesson header in sync with phrase progress inside speed practice',async()=>{
    const user=userEvent.setup();
    const patternActivity={
      id:'pattern.progress',revision:1,type:'pattern-drill' as const,tags:[],revisionProgress:'preserve' as const,
      lexiconRefs:[],pattern:{ru:'I / he + глагол'},modes:['drill' as const,'listening' as const],
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

    const renderPattern=()=>render(
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

    const view=renderPattern();
    await waitFor(()=>expect(screen.getByText('0/2')).toBeTruthy());
    await user.click(screen.getByRole('button',{name:'Начать'}));
    await waitFor(()=>expect(screen.getByText('1/2')).toBeTruthy());
    await user.click(screen.getByRole('button',{name:'Готово'}));
    await user.click(screen.getByRole('button',{name:'Совпало'}));
    await waitFor(()=>expect(screen.getByText('2/2')).toBeTruthy());

    // A different practice mode has its own counter. Returning to speed must show
    // the exact phrase position immediately, not 0/N until one more answer.
    await user.click(screen.getByRole('button',{name:'Слушание'}));
    await waitFor(()=>expect(screen.getByText('0/2')).toBeTruthy());
    await user.click(screen.getByRole('button',{name:'На скорость'}));
    await waitFor(()=>expect(screen.getByText('2/2')).toBeTruthy());

    // The exit copy promises that progress is saved, so an app-level re-entry must
    // restore the same phrase, not only the coarse Today progress.
    await user.click(screen.getByRole('button',{name:'Закрыть урок'}));
    await user.click(screen.getByRole('button',{name:'Выйти'}));
    view.unmount();
    renderPattern();
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
