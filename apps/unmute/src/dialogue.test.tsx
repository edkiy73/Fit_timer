import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import type { Activity } from './content/schema';
import type { StartRecognition, WebRecognitionHandlers } from './speech-web';
import { dictionaries } from './i18n';
import {
  DialogueView,
  dialogueAnswerMatches,
  dialoguePassed
} from './dialogue';

const activity:Extract<Activity,{type:'dialogue'}>={
  id:'dialogue.d1',
  revision:1,
  type:'dialogue',
  tags:['dialogue'],
  revisionProgress:'preserve',
  lexiconRefs:[],
  scene:{ru:'Знакомство'},
  lines:[
    {
      id:'dialogue.d1.line-1',
      partner:{ru:'Hi! Are you here on holiday?'},
      task:{ru:'Скажи, что живёшь здесь'},
      answer:{accepted:['no, i live here','i live here'],nearMiss:true,caseSensitive:false},
      displayAnswer:'No, I live here.'
    },
    {
      id:'dialogue.d1.line-2',
      partner:{ru:'And what do you do?'},
      task:{ru:'Скажи, что работаешь в IT'},
      answer:{accepted:['i work in it','i work in tech'],nearMiss:true,caseSensitive:false},
      displayAnswer:'I work in IT.'
    }
  ]
};

function fakeRecognition(){
  let handlers:WebRecognitionHandlers|null=null;
  const startRecognition:StartRecognition=next=>{
    handlers=next;
    return {stop:()=>{},abort:()=>{}};
  };
  return {
    startRecognition,
    result:(alternatives:string[])=>handlers?.onResult(alternatives)
  };
}

function renderDialogue(
  startRecognition:StartRecognition,
  saveDialogue=vi.fn(async()=>{}),
  onDone=vi.fn(),
  speak=vi.fn(async()=>true)
){
  render(
    <I18nProvider
      dictionaries={dictionaries}
      config={{locales:['ru'],default:'ru'}}
      storageKey="dialogue-test.locale"
      systemLanguages={['ru']}
    >
      <DialogueView
        activity={activity}
        setId="general-foundation"
        saveDialogue={saveDialogue}
        onDone={onDone}
        speak={speak}
        startRecognition={startRecognition}
      />
    </I18nProvider>
  );
  return {saveDialogue,onDone,speak};
}

describe('dialogue runner',()=>{
  it('keeps legacy text + loose voice acceptance rules',()=>{
    expect(dialogueAnswerMatches('No, I live here!',activity.lines[0]!)).toBe(true);
    expect(dialogueAnswerMatches('I live',activity.lines[0]!)).toBe(false);
    expect(dialoguePassed(7,10)).toBe(true);
    expect(dialoguePassed(6,10)).toBe(false);
  });

  it('runs text then voice answers and saves the final dialogue score',async()=>{
    const user=userEvent.setup();
    const recognition=fakeRecognition();
    const {saveDialogue,onDone,speak}=renderDialogue(recognition.startRecognition);

    await waitFor(()=>expect(speak).toHaveBeenCalledWith('Hi! Are you here on holiday?','en-US'));

    const input=screen.getByRole('textbox',{name:'Твой ответ'});
    await user.type(input,'No, I live here');
    await user.click(screen.getByRole('button',{name:'Проверить'}));
    expect(await screen.findByText('Так и есть')).toBeTruthy();
    expect(screen.getByText('No, I live here.')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Далее'}));

    await user.click(screen.getByRole('button',{name:'Ответить голосом'}));
    recognition.result(['I work in tech']);
    expect(await screen.findByText('Так и есть')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Завершить'}));

    await waitFor(()=>expect(saveDialogue).toHaveBeenCalledWith(
      'general-foundation',
      'dialogue.d1',
      100
    ));
    expect(await screen.findByText('2 из 2 удачно')).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Далее'}));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('keeps typed input usable when speech recognition is unavailable',async()=>{
    const user=userEvent.setup();
    const unavailable:StartRecognition=handlers=>{
      handlers.onError?.('unsupported');
      return null;
    };
    renderDialogue(unavailable);

    await user.click(screen.getByRole('button',{name:'Ответить голосом'}));
    expect(await screen.findByText(/не поддерживает распознавание речи/)).toBeTruthy();

    const input=screen.getByRole('textbox',{name:'Твой ответ'});
    await user.type(input,'I live here');
    await user.click(screen.getByRole('button',{name:'Проверить'}));
    expect(await screen.findByText('Так и есть')).toBeTruthy();
  });
});
