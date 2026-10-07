import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import type { Activity } from './content/schema';
import type { RequestMicrophone, StartRecognition, WebRecognitionHandlers } from './speech-web';
import { dictionaries } from './i18n';
import { looseSpeechMatch } from './speech-match';
import {
  PatternSpeakingView,
  onceMicrophone,
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
  speak=vi.fn(async()=>true),
  requestMicrophone?:RequestMicrophone
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
        {...(requestMicrophone?{requestMicrophone}:{})}
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

  it('lets the learner override a bad ASR match without pretending it was recognized',async()=>{
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
    await user.click(screen.getByRole('button',{name:'Сказано правильно'}));

    await waitFor(()=>expect(savePractice).toHaveBeenCalledWith(
      'general-foundation',
      'pattern.present',
      'speaking',
      false,
      50,
      {
        'p1':'strong',
        'p2':'neutral'
      }
    ));
    expect(await screen.findByText('Распознано 1 из 2 · сверено вручную 1')).toBeTruthy();
    expect(screen.getByText('Все фразы пройдены.')).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Далее'}));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('uses manual self-check when speech recognition is unavailable',async()=>{
    const user=userEvent.setup();
    const unavailable:StartRecognition=handlers=>{
      handlers.onError?.('unsupported');
      return null;
    };
    renderSpeaking(unavailable);

    await user.click(screen.getByRole('button',{name:'Нажми и скажи'}));
    // One note for the whole session instead of an error on every phrase (decision 13).
    expect(await screen.findByText(/распознавание речи недоступно/)).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Нажми и скажи'})).toBeNull();

    await user.click(screen.getByRole('button',{name:'Готово — сверить'}));
    expect(await screen.findByText('Сверь со своим вариантом')).toBeTruthy();
    expect(screen.getByText('I work at home.')).toBeTruthy();
    expect(screen.getByRole('button',{name:'Не совпало'})).toBeTruthy();
    expect(screen.getByRole('button',{name:'Совпало'})).toBeTruthy();
  });

  it('asks for the microphone on entry and checks by hand when it is not allowed',async()=>{
    const user=userEvent.setup();
    const recognition=fakeRecognition();
    const answers:Array<'granted'|'denied'>=['denied','granted'];
    const requestMicrophone=vi.fn(async()=>answers.shift()!);
    renderSpeaking(recognition.startRecognition,undefined,undefined,undefined,requestMicrophone);

    expect(await screen.findByText(/Микрофон не разрешён/)).toBeTruthy();
    expect(screen.getByText('Скажи фразу по-английски вслух, потом сверь с ответом.')).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Нажми и скажи'})).toBeNull();
    expect(requestMicrophone).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button',{name:'Готово — сверить'}));
    await user.click(await screen.findByRole('button',{name:'Совпало'}));
    // The next phrase stays in manual mode without asking or showing an error again.
    expect(await screen.findByText('Она работает здесь.')).toBeTruthy();
    expect(screen.getByText(/Микрофон не разрешён/)).toBeTruthy();
    expect(requestMicrophone).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button',{name:'Разрешить микрофон'}));
    expect(await screen.findByRole('button',{name:'Нажми и скажи'})).toBeTruthy();
    expect(requestMicrophone).toHaveBeenCalledTimes(2);
  });

  it('asks once per review even when every phrase is its own view',async()=>{
    const request=vi.fn(async()=>'granted' as const);
    const once=onceMicrophone(request);
    await once(); await once();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not allow manual pass after explicitly revealing the answer',async()=>{
    const user=userEvent.setup();
    const recognition=fakeRecognition();
    renderSpeaking(recognition.startRecognition);

    await user.click(screen.getByRole('button',{name:'Показать ответ'}));
    expect(await screen.findByText('Вот как правильно')).toBeTruthy();
    expect(screen.getByText('I work at home.')).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Сказано правильно'})).toBeNull();
  });

  it('keeps a speech mismatch in correction until it is resolved',async()=>{
    const user=userEvent.setup();
    const recognition=fakeRecognition();
    const {savePractice}=renderSpeaking(recognition.startRecognition);

    await user.click(screen.getByRole('button',{name:'Нажми и скажи'}));
    recognition.result(['work home']);
    expect(await screen.findByText('Не совпало')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Далее'}));

    await user.click(screen.getByRole('button',{name:'Нажми и скажи'}));
    recognition.result(['She works here']);
    expect(await screen.findByText('Получилось')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Далее'}));

    expect(await screen.findByText('Работа над ошибками · осталось 1')).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Нажми и скажи'}));
    recognition.result(['work home']);
    expect(await screen.findByText('Не совпало')).toBeTruthy();
    await user.click(await screen.findByRole('button',{name:'Далее'}));
    expect(await screen.findByText('Работа над ошибками · осталось 1')).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Нажми и скажи'}));
    recognition.result(['I work at home']);
    expect(await screen.findByText('Получилось')).toBeTruthy();
    await user.click(await screen.findByRole('button',{name:'Далее'}));

    await waitFor(()=>expect(savePractice).toHaveBeenCalledWith(
      'general-foundation',
      'pattern.present',
      'speaking',
      false,
      50,
      {
        'p1':'weak',
        'p2':'strong'
      }
    ));
    expect(await screen.findByText('1 из 2 распознано')).toBeTruthy();
  });
});
