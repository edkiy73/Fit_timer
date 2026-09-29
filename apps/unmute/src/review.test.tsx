import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import type { LearnerCourseState } from './course-loader';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { emptyCourseProgress } from './progress';
import { ReviewView } from './review';
import { dictionaries } from './i18n';

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
  const progress=emptyCourseProgress();
  progress.cards['card.one']={box:2,due:10,at:'2026-09-29T00:00:00Z'};
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
      activities:[{
        id:'card.one',revision:1,type:'text-input',tags:[],revisionProgress:'preserve',
        lexiconRefs:[],prompt:{ru:'Напиши: Я дома'},
        answer:{accepted:['I am home'],nearMiss:true,caseSensitive:false}
      }],
      resources:[]
    },
    roadmap:{id:'main',title:{ru:'Путь'},nodes:[node]},
    progress,
    roadmapProgress:{
      nodes:[{node,complete:true,unlocked:true}],
      currentNode:null,
      currentDayIndex:null,
      completedCount:1,
      requiredCount:1,
      courseComplete:true
    },
    currentNode:null,
    currentDayIndex:null,
    access:'full',
    fromCache:false
  };
}

function renderReview(
  saveGraded=vi.fn(async()=>{}),
  savePractice=vi.fn(async()=>{})
){
  const runtime:LearnerCourseRuntimeValue={
    state:learnerState(),
    status:'ready',
    error:null,
    refresh:async()=>{}
  };
  const onExit=vi.fn();
  render(
    <I18nProvider
      dictionaries={dictionaries}
      config={{locales:['ru'],default:'ru'}}
      storageKey="review-test.locale"
      systemLanguages={['ru']}
    >
      <ReviewView
        runtime={runtime}
        onExit={onExit}
        todayDay={10}
        saveGraded={saveGraded}
        savePractice={savePractice}
        speak={async()=>true}
        startRecognition={()=>null}
      />
    </I18nProvider>
  );
  return {saveGraded,onExit};
}

describe('course review screen',()=>{
  it('requeues a wrong card until it is answered correctly',async()=>{
    const user=userEvent.setup();
    const {saveGraded,onExit}=renderReview();

    let input=await screen.findByRole('textbox',{name:'Твой ответ'});
    await user.type(input,'wrong');
    await user.click(screen.getByRole('button',{name:'Проверить'}));
    expect(saveGraded).toHaveBeenLastCalledWith('general-foundation','card.one',false);

    await user.click(screen.getByRole('button',{name:'Повторить в конце'}));
    input=await screen.findByRole('textbox',{name:'Твой ответ'});
    await user.type(input,'I am home');
    await user.click(screen.getByRole('button',{name:'Проверить'}));
    expect(saveGraded).toHaveBeenLastCalledWith('general-foundation','card.one',true);

    await user.click(screen.getByRole('button',{name:'Далее'}));
    expect(await screen.findByRole('heading',{name:'Повтор завершён'})).toBeTruthy();
    expect(screen.getByText('Готово: 1')).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Вернуться в «Сегодня»'}));
    expect(onExit).toHaveBeenCalledTimes(1);
  });


  it('reviews a due personal word with the legacy reveal/self-grade flow',async()=>{
    const user=userEvent.setup();
    const state=learnerState();
    state.progress.cards['card.one']={box:2,due:99,at:'2026-09-29T00:00:00Z'};
    const runtime:LearnerCourseRuntimeValue={
      state,
      status:'ready',
      error:null,
      refresh:async()=>{}
    };
    const words={
      schemaVersion:1 as const,
      items:{
        'lex.home|noun':{
          lexemeId:'lex.home',
          senseId:'noun',
          box:1,
          due:10,
          at:'2026-09-29T00:00:00Z'
        }
      }
    };
    const wordRuntime={
      words,
      lexicon:{
        schemaVersion:1 as const,
        revision:1,
        entries:[{
          id:'lex.home',
          revision:1,
          language:'en' as const,
          lemma:'home',
          forms:[{text:'home',kind:'lemma' as const}],
          senses:[{
            id:'noun',
            translations:{ru:['дом']},
            tags:[]
          }],
          examples:[],
          deprecated:false
        }]
      },
      status:'ready' as const,
      error:null,
      fromCache:false,
      refresh:async()=>{}
    };
    const saveWord=vi.fn(async()=>{});
    const onExit=vi.fn();

    render(
      <I18nProvider
        dictionaries={dictionaries}
        config={{locales:['ru'],default:'ru'}}
        storageKey="review-word-test.locale"
        systemLanguages={['ru']}
      >
        <ReviewView
          runtime={runtime}
          wordRuntime={wordRuntime}
          onExit={onExit}
          todayDay={10}
          saveGraded={async()=>{}}
          savePractice={async()=>{}}
          saveWord={saveWord}
          speak={async()=>true}
          startRecognition={()=>null}
        />
      </I18nProvider>
    );

    expect(await screen.findByRole('heading',{name:'дом'})).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Показать слово'}));
    expect(await screen.findByText('home')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Вспомнил'}));

    expect(saveWord).toHaveBeenCalledWith('lex.home','noun',true);
    expect(await screen.findByRole('heading',{name:'Повтор завершён'})).toBeTruthy();
    expect(screen.getByText('Готово: 1')).toBeTruthy();
  });
});
