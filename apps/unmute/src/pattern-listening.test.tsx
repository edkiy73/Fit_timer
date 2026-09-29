import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import type { Activity } from './content/schema';
import { dictionaries } from './i18n';
import {
  PatternListeningView,
  buildListeningOptions,
  listeningPassed,
  pickListeningItems
} from './pattern-listening';

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
    {id:'p1',prompt:{ru:'Я работаю дома.'},answer:{accepted:['I work at home.'],nearMiss:true,caseSensitive:false}},
    {id:'p2',prompt:{ru:'Она работает здесь.'},answer:{accepted:['She works here.'],nearMiss:true,caseSensitive:false}}
  ]
};

const distractors=[
  {ru:'Я работаю дома.'},
  {ru:'Она работает здесь.'},
  {ru:'Мы живём рядом.'},
  {ru:'Они часто звонят.'}
];

const fixedRandom=()=>0.999;

function renderListening(
  savePractice=vi.fn(async()=>{}),
  onDone=vi.fn(),
  speak=vi.fn(async()=>true)
){
  render(
    <I18nProvider
      dictionaries={dictionaries}
      config={{locales:['ru'],default:'ru'}}
      storageKey="pattern-listening-test.locale"
      systemLanguages={['ru']}
    >
      <PatternListeningView
        activity={activity}
        setId="general-foundation"
        distractors={distractors}
        savePractice={savePractice}
        onDone={onDone}
        speak={speak}
        random={fixedRandom}
      />
    </I18nProvider>
  );
  return {savePractice,onDone,speak};
}

describe('pattern listening',()=>{
  it('keeps six-item cap, three-option shape and 70% threshold',()=>{
    expect(pickListeningItems(activity,fixedRandom)).toHaveLength(2);
    expect(buildListeningOptions(activity.items[0]!.prompt,distractors,'ru',fixedRandom)).toHaveLength(3);
    expect(listeningPassed(7,10)).toBe(true);
    expect(listeningPassed(6,10)).toBe(false);
  });

  it('plays target speech, checks meaning and saves listening SRS',async()=>{
    const user=userEvent.setup();
    const {savePractice,onDone,speak}=renderListening();

    await waitFor(()=>expect(speak).toHaveBeenCalledWith('I work at home.','en-US'));
    await user.click(screen.getByRole('button',{name:'Я работаю дома.'}));
    expect(await screen.findByText('I work at home.')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Далее'}));

    await waitFor(()=>expect(speak).toHaveBeenCalledWith('She works here.','en-US'));
    await user.click(screen.getByRole('button',{name:'Она работает здесь.'}));
    await user.click(screen.getByRole('button',{name:'Завершить'}));

    await waitFor(()=>expect(savePractice).toHaveBeenCalledWith(
      'general-foundation',
      'pattern.present',
      'listening',
      true,
      100
    ));
    expect(await screen.findByText('2 из 2 правильно')).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Далее'}));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
