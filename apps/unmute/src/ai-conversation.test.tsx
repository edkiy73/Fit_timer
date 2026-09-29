import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import { dictionaries } from './i18n';
import { AIConversationView } from './ai-conversation';

const activity={
  id:'talk.clinic',
  revision:1,
  type:'ai-conversation' as const,
  title:{ru:'Разговор в клинике'},
  tags:[],
  revisionProgress:'preserve' as const,
  lexiconRefs:[],
  topic:{ru:'В клинике'},
  promptTemplate:'Act as a receptionist.',
  focus:['appointments']
};

function wrap(ui:ReactNode){
  return render(
    <I18nProvider
      dictionaries={dictionaries}
      config={{locales:['ru'],default:'ru'}}
      storageKey="ai-conversation-test.locale"
      systemLanguages={['ru']}
    >
      {ui}
    </I18nProvider>
  );
}

describe('AI conversation runner',()=>{
  it('opens with AI, exchanges typed turns and marks the activity seen only after whole-conversation review',async()=>{
    const user=userEvent.setup();
    const saveSeen=vi.fn(async()=>{});
    const onDone=vi.fn();
    const onStarted=vi.fn();
    const requestReply=vi.fn()
      .mockResolvedValueOnce({
        reply:'Hello. How can I help you?',
        correction:null,
        note:null,
        usage:{bucket:'light',used:1,limit:100},
        trial:{remaining:9,maxCalls:10}
      })
      .mockResolvedValueOnce({
        reply:'Sure. What day works for you?',
        correction:'I need an appointment.',
        note:'Нужен артикль an.',
        usage:{bucket:'light',used:2,limit:100},
        trial:{remaining:8,maxCalls:10}
      });
    const requestReview=vi.fn(async()=>({
      strengths:['Ты сразу объяснил, что тебе нужно.'],
      corrections:[{
        original:'I need appointment',
        better:'I need an appointment.',
        why:'Перед исчисляемым appointment нужен артикль.'
      }],
      focus:'В следующий раз добавляй артикль перед appointment.',
      usage:{bucket:'light',used:3,limit:100},
      trial:{remaining:7,maxCalls:10}
    }));

    wrap(
      <AIConversationView
        activity={activity}
        setId="general-foundation"
        saveSeen={saveSeen}
        onDone={onDone}
        onSignIn={()=>{}}
        onAccess={()=>{}}
        requestReply={requestReply}
        requestReview={requestReview}
        onStarted={onStarted}
      />
    );

    await user.click(screen.getByRole('button',{name:'Начать разговор'}));
    expect(await screen.findByText('Hello. How can I help you?')).toBeTruthy();
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(requestReply).toHaveBeenNthCalledWith(1,expect.objectContaining({
      start:true,
      learnerText:'',
      trial:expect.objectContaining({scope:'talk.clinic'})
    }));
    expect(saveSeen).not.toHaveBeenCalled();

    const input=screen.getByRole('textbox',{name:'Твой ответ'});
    await user.type(input,'I need appointment');
    await user.click(screen.getByRole('button',{name:'Отправить'}));

    expect(await screen.findByText('Sure. What day works for you?')).toBeTruthy();
    expect(screen.getByText('I need an appointment.')).toBeTruthy();
    expect(screen.getByText('Нужен артикль an.')).toBeTruthy();
    expect(screen.getByText('Пробная')).toBeTruthy();
    expect(screen.getByText('Пробная беседа · осталось ответов ИИ: 8')).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Завершить разговор'}));

    expect(requestReview).toHaveBeenCalledWith(expect.objectContaining({
      topic:'В клинике',
      history:expect.arrayContaining([
        {role:'learner',text:'I need appointment'},
        {role:'partner',text:'Sure. What day works for you?'}
      ]),
      locale:'ru',
      trial:expect.objectContaining({scope:'talk.clinic'})
    }));
    expect(await screen.findByRole('heading',{name:'Что получилось и что улучшить'})).toBeTruthy();
    expect(screen.getByText('Ты сразу объяснил, что тебе нужно.')).toBeTruthy();
    expect(screen.getByText('I need appointment')).toBeTruthy();
    expect(screen.getByText('Перед исчисляемым appointment нужен артикль.')).toBeTruthy();
    expect(screen.getByText('Пробная беседа · осталось ответов ИИ: 7')).toBeTruthy();
    expect(saveSeen).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button',{name:'Готово'}));
    expect(saveSeen).toHaveBeenCalledWith('general-foundation','talk.clinic');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('offers sign-in when the AI endpoint requires an account',async()=>{
    const user=userEvent.setup();
    const onSignIn=vi.fn();
    const requestReply=vi.fn(async()=>{
      throw Object.assign(new Error('auth_required'),{code:'auth_required'});
    });

    wrap(
      <AIConversationView
        activity={activity}
        setId="general-foundation"
        saveSeen={async()=>{}}
        onDone={()=>{}}
        onSignIn={onSignIn}
        onAccess={()=>{}}
        requestReply={requestReply}
      />
    );

    await user.click(screen.getByRole('button',{name:'Начать разговор'}));
    expect(await screen.findByText('Для ИИ-разговора нужно войти.')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Войти'}));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('can finish the activity when whole-conversation review temporarily fails',async()=>{
    const user=userEvent.setup();
    const saveSeen=vi.fn(async()=>{});
    const onDone=vi.fn();
    const requestReply=vi.fn()
      .mockResolvedValueOnce({
        reply:'Hello. How can I help you?',
        correction:null,
        note:null
      })
      .mockResolvedValueOnce({
        reply:'Sure.',
        correction:null,
        note:null
      });
    const requestReview=vi.fn(async()=>{
      throw Object.assign(new Error('ai_timeout'),{code:'ai_timeout'});
    });

    wrap(
      <AIConversationView
        activity={activity}
        setId="general-foundation"
        saveSeen={saveSeen}
        onDone={onDone}
        onSignIn={()=>{}}
        onAccess={()=>{}}
        requestReply={requestReply}
        requestReview={requestReview}
      />
    );

    await user.click(screen.getByRole('button',{name:'Начать разговор'}));
    const input=await screen.findByRole('textbox',{name:'Твой ответ'});
    await user.type(input,'I need help');
    await user.click(screen.getByRole('button',{name:'Отправить'}));
    await screen.findByText('Sure.');

    await user.click(screen.getByRole('button',{name:'Завершить разговор'}));
    expect(await screen.findByText(/слишком долго/)).toBeTruthy();
    expect(saveSeen).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button',{name:'Завершить без разбора'}));
    expect(saveSeen).toHaveBeenCalledWith('general-foundation','talk.clinic');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('preserves the old quick-finish behavior when the learner has not sent a turn',async()=>{
    const user=userEvent.setup();
    const saveSeen=vi.fn(async()=>{});
    const onDone=vi.fn();
    const requestReview=vi.fn();

    wrap(
      <AIConversationView
        activity={activity}
        setId="general-foundation"
        saveSeen={saveSeen}
        onDone={onDone}
        onSignIn={()=>{}}
        onAccess={()=>{}}
        requestReply={vi.fn(async()=>({
          reply:'Hello. How can I help you?',
          correction:null,
          note:null
        }))}
        requestReview={requestReview}
      />
    );

    await user.click(screen.getByRole('button',{name:'Начать разговор'}));
    await screen.findByText('Hello. How can I help you?');
    await user.click(screen.getByRole('button',{name:'Завершить разговор'}));

    expect(requestReview).not.toHaveBeenCalled();
    expect(saveSeen).toHaveBeenCalledWith('general-foundation','talk.clinic');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('offers Plus after the account trial has already been used',async()=>{
    const user=userEvent.setup();
    const onAccess=vi.fn();
    const requestReply=vi.fn(async()=>{
      throw Object.assign(new Error('trial_used'),{code:'trial_used'});
    });

    wrap(
      <AIConversationView
        activity={activity}
        setId="general-foundation"
        saveSeen={async()=>{}}
        onDone={()=>{}}
        onSignIn={()=>{}}
        onAccess={onAccess}
        requestReply={requestReply}
      />
    );

    await user.click(screen.getByRole('button',{name:'Начать разговор'}));
    expect(await screen.findByText(/Пробная ИИ-беседа уже использована/)).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Открыть Plus'}));
    expect(onAccess).toHaveBeenCalledTimes(1);
  });

  it('offers Plus when the signed-in account has no AI entitlement',async()=>{
    const user=userEvent.setup();
    const onAccess=vi.fn();
    const requestReply=vi.fn(async()=>{
      throw Object.assign(new Error('premium_required'),{code:'premium_required'});
    });

    wrap(
      <AIConversationView
        activity={activity}
        setId="general-foundation"
        saveSeen={async()=>{}}
        onDone={()=>{}}
        onSignIn={()=>{}}
        onAccess={onAccess}
        requestReply={requestReply}
      />
    );

    await user.click(screen.getByRole('button',{name:'Начать разговор'}));
    expect(await screen.findByText('ИИ-разговоры доступны в UnMute Plus.')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Открыть Plus'}));
    expect(onAccess).toHaveBeenCalledTimes(1);
  });

  it('sends a recognized voice turn to AI and speaks partner replies automatically',async()=>{
    const user=userEvent.setup();
    const speak=vi.fn(async()=>true);
    let handlers:any=null;
    const startRecognition=vi.fn((next:any)=>{
      handlers=next;
      return {stop:vi.fn(),abort:vi.fn()};
    });
    const requestReply=vi.fn()
      .mockResolvedValueOnce({
        reply:'Hello. How can I help you?',
        correction:null,
        note:null
      })
      .mockResolvedValueOnce({
        reply:'Sure. What day works for you?',
        correction:null,
        note:null
      });

    wrap(
      <AIConversationView
        activity={activity}
        setId="general-foundation"
        saveSeen={async()=>{}}
        onDone={()=>{}}
        onSignIn={()=>{}}
        onAccess={()=>{}}
        requestReply={requestReply}
        requestReview={vi.fn()}
        speak={speak}
        startRecognition={startRecognition}
      />
    );

    await user.click(screen.getByRole('button',{name:'Начать разговор'}));
    expect(await screen.findByText('Hello. How can I help you?')).toBeTruthy();
    expect(speak).toHaveBeenCalledWith('Hello. How can I help you?','en-US');

    await user.click(screen.getByRole('button',{name:'Ответить голосом'}));
    expect(startRecognition).toHaveBeenCalledTimes(1);
    expect(handlers).toBeTruthy();

    await act(async()=>{
      handlers.onResult(['I need an appointment']);
    });

    expect(await screen.findByText('Sure. What day works for you?')).toBeTruthy();
    expect(requestReply).toHaveBeenNthCalledWith(2,expect.objectContaining({
      learnerText:'I need an appointment'
    }));
    expect(speak).toHaveBeenCalledWith('Sure. What day works for you?','en-US');
  });

  it('keeps text reply available when speech recognition is unsupported',async()=>{
    const user=userEvent.setup();
    const requestReply=vi.fn(async()=>({
      reply:'Hello. How can I help you?',
      correction:null,
      note:null
    }));

    wrap(
      <AIConversationView
        activity={activity}
        setId="general-foundation"
        saveSeen={async()=>{}}
        onDone={()=>{}}
        onSignIn={()=>{}}
        onAccess={()=>{}}
        requestReply={requestReply}
        requestReview={vi.fn()}
        speak={async()=>true}
        startRecognition={handlers=>{
          handlers.onError?.('unsupported');
          return null;
        }}
      />
    );

    await user.click(screen.getByRole('button',{name:'Начать разговор'}));
    await screen.findByText('Hello. How can I help you?');
    await user.click(screen.getByRole('button',{name:'Ответить голосом'}));

    expect(await screen.findByText(/распознавание речи недоступно/)).toBeTruthy();
    expect((screen.getByRole('textbox',{name:'Твой ответ'}) as HTMLInputElement).disabled).toBe(false);
  });
});
