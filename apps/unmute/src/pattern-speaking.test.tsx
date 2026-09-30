import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import type { Activity } from './content/schema';
import type { StartRecognition, WebRecognitionHandlers } from './speech-web';
import { dictionaries } from './i18n';
import { looseSpeechMatch } from './speech-match';
import {
  PatternSpeakingView,
  speakingPassed
} from './pattern-speaking';

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

const fixedRandom=()=>0.999;

function fakeRecognition(){
  let handlers:WebRecognitionHandlers|null=null;
  const startRecognition:StartRecognition=(next)=>{
    handlers=next;
    return {stop:()=>{},abort:()=>{}};
  };
  return {
    startRecognition,
    result:(alternatives:string[])=>handlers?.onResult(alternatives),
    error:(code:'unsupported'|'permission'|'no-speech'|'network'|'recognition')=>handlers?.onError?.(code)
  };
}

function renderSpeaking(
  startRecognition:StartRecognition,
  savePractice=vi.fn(async()=>{}),
  onDone=vi.fn(),
  speak=vi.fn(async()=>true)
){
  render(
    <I18nProvider
      dictionaries={dictionaries}
      config={{locales:['ru'],default:'ru'}}
      storageKey="pattern-speaking-test.locale"
      systemLanguages={['ru']}
    >
      <PatternSpeakingView
        activity={activity}
        setId="general-foundation"
        savePractice={savePractice}
        onDone={onDone}
        speak={speak}
        startRecognition={startRecognition}
        random={fixedRandom}
      />
    </I18nProvider>
  );
  return {savePractice,onDone,speak};
}

describe('pattern speaking',()=>{
  it('matches the frozen loose voice rule',()=>{
    expect(looseSpeechMatch('I work home','I work at home')).toBe(true);
    expect(looseSpeechMatch('work home','I work at home')).toBe(false);
    expect(looseSpeechMatch('she works here','She works here.')).toBe(true);
    expect(speakingPassed(7,10)).toBe(true);
    expect(speakingPassed(6,10)).toBe(false);
  });

  it('uses recognition alternatives, manual fallback and saves speaking SRS',async()=>{
    const user=userEvent.setup();
    const recognition=fakeRecognition();
    const {savePractice,onDone}=renderSpeaking(recognition.startRecognition);

    await user.click(screen.getByRole('button',{name:'Нажми и скажи'}));
    recognition.result(['I work at home']);
    expect(await screen.findByText('Получилось')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Далее'}));

    await user.click(screen.getByRole('button',{name:'Нажми и скажи'}));
    recognition.result(['She walks here']);
    expect(await screen.findByText('Не совпало')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Всё же засчитать'}));
    expect(await screen.findByText('Получилось')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Завершить'}));

    await waitFor(()=>expect(savePractice).toHaveBeenCalledWith(
      'general-foundation',
      'pattern.present',
      'speaking',
      true,
      100
    ));
    expect(await screen.findByText('2 из 2 распознано')).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Далее'}));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('keeps show-answer fallback when Web Speech is unavailable',async()=>{
    const user=userEvent.setup();
    const unavailable:StartRecognition=handlers=>{
      handlers.onError?.('unsupported');
      return null;
    };
    renderSpeaking(unavailable);

    await user.click(screen.getByRole('button',{name:'Нажми и скажи'}));
    expect(await screen.findByText(/не поддерживает распознавание речи/)).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Показать ответ'}));
    expect(await screen.findByText('I work at home.')).toBeTruthy();
    expect(screen.getByRole('button',{name:'Всё же засчитать'})).toBeTruthy();
  });
});
