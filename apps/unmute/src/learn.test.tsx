import { render, screen } from '@testing-library/react';
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

function renderRunner(saveSeen=vi.fn(async()=>{}),saveGraded=vi.fn(async()=>{})){
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
        saveSeen={saveSeen}
        saveGraded={saveGraded}
      />
    </I18nProvider>
  );
  return {saveSeen,saveGraded,onExit};
}

describe('node activity runner',()=>{
  it('moves through theory, choice and text input while saving progress',async()=>{
    const user=userEvent.setup();
    const {saveSeen,saveGraded,onExit}=renderRunner();

    expect(screen.getByText('Короткая теория')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Продолжить'}));
    expect(saveSeen).toHaveBeenCalledWith('general-foundation','theory.one');

    expect(await screen.findByRole('heading',{name:'Выбери ответ'})).toBeTruthy();
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
    expect(onExit).toHaveBeenCalledTimes(1);
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
        />
      </I18nProvider>
    );

    expect(screen.getByRole('heading',{name:'Выбери ответ'})).toBeTruthy();
  });
});
