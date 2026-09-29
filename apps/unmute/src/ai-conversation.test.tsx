import { render, screen } from '@testing-library/react';
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

function wrap(ui:React.ReactNode){
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
  it('opens with AI, exchanges typed turns and marks the activity seen only on finish',async()=>{
    const user=userEvent.setup();
    const saveSeen=vi.fn(async()=>{});
    const onDone=vi.fn();
    const requestReply=vi.fn()
      .mockResolvedValueOnce({
        reply:'Hello. How can I help you?',
        correction:null,
        note:null,
        usage:{bucket:'light',used:1,limit:100}
      })
      .mockResolvedValueOnce({
        reply:'Sure. What day works for you?',
        correction:'I need an appointment.',
        note:'Нужен артикль an.',
        usage:{bucket:'light',used:2,limit:100}
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
      />
    );

    await user.click(screen.getByRole('button',{name:'Начать разговор'}));
    expect(await screen.findByText('Hello. How can I help you?')).toBeTruthy();
    expect(requestReply).toHaveBeenNthCalledWith(1,expect.objectContaining({
      start:true,
      learnerText:''
    }));
    expect(saveSeen).not.toHaveBeenCalled();

    const input=screen.getByRole('textbox',{name:'Твой ответ'});
    await user.type(input,'I need appointment');
    await user.click(screen.getByRole('button',{name:'Отправить'}));

    expect(await screen.findByText('Sure. What day works for you?')).toBeTruthy();
    expect(screen.getByText('I need an appointment.')).toBeTruthy();
    expect(screen.getByText('Нужен артикль an.')).toBeTruthy();
    expect(screen.getByText('2 / 100')).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Завершить разговор'}));
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
});
