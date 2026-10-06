import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Activity } from './content/schema';
import { emptyCourseProgress } from './progress';
import { firstPatternMode, PatternPracticeView } from './pattern-practice';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import { dictionaries } from './i18n';

const activity:Extract<Activity,{type:'pattern-drill'}>={
  id:'pattern.present',
  revision:1,
  type:'pattern-drill',
  tags:[],
  revisionProgress:'preserve',
  lexiconRefs:[],
  pattern:{ru:'Present Simple'},
  modes:['drill','listening','speaking'],
  items:[
    {id:'p1',prompt:{ru:'Я работаю дома.'},answer:{accepted:['I work at home.'],nearMiss:true,caseSensitive:false}}
  ]
};

describe('pattern practice orchestration',()=>{
  it('resumes at the first practice mode that has not successfully started',()=>{
    const progress=emptyCourseProgress();
    expect(firstPatternMode(activity,progress)).toBe('drill');

    progress.practice.drill[activity.id]={box:1,due:2,at:'2026-09-29T00:00:00.000Z'};
    expect(firstPatternMode(activity,progress)).toBe('listening');

    progress.practice.listening[activity.id]={box:1,due:2,at:'2026-09-29T00:00:00.000Z'};
    expect(firstPatternMode(activity,progress)).toBe('speaking');

    progress.practice.speaking[activity.id]={box:1,due:2,at:'2026-09-29T00:00:00.000Z'};
    expect(firstPatternMode(activity,progress)).toBe('complete');
  });

  it('separates a completed weak mode from an unfinished legacy box-zero mode',()=>{
    const progress=emptyCourseProgress();
    progress.practice.drill[activity.id]={box:0,due:1,at:'2026-09-29T00:00:00.000Z'};
    expect(firstPatternMode(activity,progress)).toBe('drill');

    progress.practice.drill[activity.id]={box:0,due:1,completed:true,at:'2026-09-29T00:00:00.000Z'};
    expect(firstPatternMode(activity,progress)).toBe('listening');
  });

  it('shows phrase-level progress before starting and hides phrase count from the intro',async()=>{
    const onProgress=vi.fn();
    const manyItems=Array.from({length:8},(_,index)=>({
      id:'p'+(index+1),
      prompt:{ru:'Фраза '+(index+1)},
      answer:{accepted:['Phrase '+(index+1)],nearMiss:true,caseSensitive:false}
    }));
    const manyActivity={...activity,items:manyItems};

    render(
      <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="practice-progress-test.locale" systemLanguages={['ru']}>
        <PatternPracticeView
          activity={manyActivity}
          courseActivities={[manyActivity]}
          progress={emptyCourseProgress()}
          setId="general-foundation"
          onDone={()=>{}}
          savePractice={async()=>{}}
          speak={async()=>true}
          initialMode="speaking"
          onProgress={onProgress}
        />
      </I18nProvider>
    );

    await waitFor(()=>expect(onProgress).toHaveBeenCalledWith(0,8));
    expect(screen.queryByText(/Фраз:\s*8/)).toBeNull();
    expect(screen.getByText('Тренируем произношение: телефон слушает и проверяет, узнаются ли слова.')).toBeTruthy();
    expect(screen.queryByText(/6 из 8/)).toBeNull();
  });

  it('starts from the first mode when replaying an unfinished day from the beginning',async()=>{
    const progress=emptyCourseProgress();
    progress.practice.drill[activity.id]={
      box:1,
      due:2,
      completed:true,
      at:'2026-09-29T00:00:00.000Z'
    };

    render(
      <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="practice-start-over.locale" systemLanguages={['ru']}>
        <PatternPracticeView
          activity={activity}
          courseActivities={[activity]}
          progress={progress}
          setId="general-foundation"
          onDone={()=>{}}
          savePractice={async()=>{}}
          speak={async()=>true}
          startFromBeginning
        />
      </I18nProvider>
    );

    expect(await screen.findByText('Тренируем скорость: фразы должны вылетать без раздумий.')).toBeTruthy();
    expect(screen.queryByText('Тренируем слух: понимать фразу с первого раза, без текста.')).toBeNull();
  });

  it('lets the lesson own the shared mode navigator',async()=>{
    const onModeChange=vi.fn();
    const view=render(
      <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="practice-nav-test.locale" systemLanguages={['ru']}>
        <PatternPracticeView
          activity={activity}
          courseActivities={[activity]}
          progress={emptyCourseProgress()}
          setId="general-foundation"
          onDone={()=>{}}
          savePractice={async()=>{}}
          speak={async()=>true}
          showModeNav={false}
          initialMode="speaking"
          onModeChange={onModeChange}
        />
      </I18nProvider>
    );

    expect(screen.queryByRole('navigation',{name:'Режим практики'})).toBeNull();
    expect(screen.getByText('Говорение')).toBeTruthy();
    await waitFor(()=>expect(onModeChange).toHaveBeenCalledWith('speaking'));

    onModeChange.mockClear();
    view.rerender(
      <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="practice-nav-test.locale" systemLanguages={['ru']}>
        <PatternPracticeView
          activity={activity}
          courseActivities={[activity]}
          progress={emptyCourseProgress()}
          setId="general-foundation"
          onDone={()=>{}}
          savePractice={async()=>{}}
          speak={async()=>true}
          showModeNav={false}
          initialMode="listening"
          onModeChange={onModeChange}
        />
      </I18nProvider>
    );
    await waitFor(()=>expect(screen.getByText('Слушание')).toBeTruthy());
    await waitFor(()=>expect(onModeChange).toHaveBeenCalledWith('listening'));
    expect(onModeChange).not.toHaveBeenCalledWith('speaking');
  });

});
