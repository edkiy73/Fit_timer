import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import type { Activity } from './content/schema';
import { dictionaries } from './i18n';
import {
  PatternDrillView,
  drillPassed,
  drillReadMs,
  drillScore
} from './pattern-drill';

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
    {
      id:'pattern.present.item-1',
      prompt:{ru:'Я работаю дома.'},
      answer:{accepted:['I work at home.'],nearMiss:true,caseSensitive:false},
      explanation:{ru:'После I глагол без окончания -s.'}
    },
    {
      id:'pattern.present.item-2',
      prompt:{ru:'Она работает здесь.'},
      answer:{accepted:['She works here.'],nearMiss:true,caseSensitive:false}
    }
  ]
};

function renderDrill(
  savePractice=vi.fn(async()=>{}),
  onDone=vi.fn()
){
  render(
    <I18nProvider
      dictionaries={dictionaries}
      config={{locales:['ru'],default:'ru'}}
      storageKey="pattern-drill-test.locale"
      systemLanguages={['ru']}
    >
      <PatternDrillView
        activity={activity}
        setId="general-foundation"
        savePractice={savePractice}
        onDone={onDone}
      />
    </I18nProvider>
  );
  return {savePractice,onDone};
}

describe('pattern drill',()=>{
  it('keeps the frozen legacy timing and pass threshold',()=>{
    expect(drillReadMs('one two three')).toBe(1560);
    expect(drillReadMs('one')).toBe(1200);
    expect(drillScore(7,10)).toBe(70);
    expect(drillPassed(7,10)).toBe(true);
    expect(drillPassed(6,10)).toBe(false);
  });

  it('keeps mixed drill outside SRS persistence',async()=>{
    const user=userEvent.setup();
    const savePractice=vi.fn(async()=>{});
    const onDone=vi.fn();

    render(
      <I18nProvider
        dictionaries={dictionaries}
        config={{locales:['ru'],default:'ru'}}
        storageKey="pattern-mixed-test.locale"
        systemLanguages={['ru']}
      >
        <PatternDrillView
          activity={activity}
          setId="mixed-review"
          savePractice={savePractice}
          onDone={onDone}
          variant="mixed"
        />
      </I18nProvider>
    );

    for(let i=0;i<2;i++){
      await user.click(screen.getByRole('button',{name:'Готово'}));
      await user.click(screen.getByRole('button',{name:'Совпало'}));
    }

    expect(await screen.findByRole('heading',{name:'Фразы вперемешку'})).toBeTruthy();
    expect(savePractice).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button',{name:'К повтору'}));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('finishes a fast self-rated drill and saves practice SRS once',async()=>{
    const user=userEvent.setup();
    const {savePractice,onDone}=renderDrill();

    for(let i=0;i<2;i++){
      await user.click(screen.getByRole('button',{name:'Готово'}));
      expect(screen.getByText(i===0?'I work at home.':'She works here.')).toBeTruthy();
      // The phrase's explanation shows with the answer; phrases without one show none.
      expect(Boolean(screen.queryByText('После I глагол без окончания -s.'))).toBe(i===0);
      await user.click(screen.getByRole('button',{name:'Совпало'}));
    }

    await waitFor(()=>expect(savePractice).toHaveBeenCalledWith(
      'general-foundation',
      'pattern.present',
      'drill',
      true,
      100
    ));
    expect(await screen.findByText('2 из 2 вовремя')).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Далее'}));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('replays a missed phrase once at the end without growing the count',async()=>{
    const user=userEvent.setup();
    renderDrill();
    expect(screen.getByText('1 из 2')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Не получилось'}));
    await user.click(screen.getByRole('button',{name:'Далее'}));
    expect(screen.getByText('2 из 2')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Готово'}));
    await user.click(screen.getByRole('button',{name:'Совпало'}));
    // The missed phrase comes back once, counted apart from the drill's two phrases.
    expect(screen.getByText('Повтор: 1 из 1')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Не получилось'}));
    expect(screen.getByText('Произнеси вслух пару раз.')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Далее'}));
    expect(await screen.findByText('1 из 2 вовремя')).toBeTruthy();
  });
});
