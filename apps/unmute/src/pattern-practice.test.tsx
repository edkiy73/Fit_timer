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

  it('retries a failed mode whose SRS box is still zero',()=>{
    const progress=emptyCourseProgress();
    progress.practice.drill[activity.id]={box:0,due:1,at:'2026-09-29T00:00:00.000Z'};
    expect(firstPatternMode(activity,progress)).toBe('drill');
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
          speak={async()=>{}}
          showModeNav={false}
          initialMode="speaking"
          onModeChange={onModeChange}
        />
      </I18nProvider>
    );

    expect(screen.queryByRole('navigation',{name:'Режим практики'})).toBeNull();
    expect(screen.getByText('Говорение')).toBeTruthy();
    await waitFor(()=>expect(onModeChange).toHaveBeenCalledWith('speaking'));

    view.rerender(
      <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="practice-nav-test.locale" systemLanguages={['ru']}>
        <PatternPracticeView
          activity={activity}
          courseActivities={[activity]}
          progress={emptyCourseProgress()}
          setId="general-foundation"
          onDone={()=>{}}
          savePractice={async()=>{}}
          speak={async()=>{}}
          showModeNav={false}
          initialMode="listening"
          onModeChange={onModeChange}
        />
      </I18nProvider>
    );
    await waitFor(()=>expect(screen.getByText('Слушание')).toBeTruthy());
    await waitFor(()=>expect(onModeChange).toHaveBeenCalledWith('listening'));
  });

});
