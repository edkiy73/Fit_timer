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

describe('AI conversation runner',()=>{
  it('starts, exchanges text messages and marks the activity seen only on finish',async()=>{
    const user=userEvent.setup();
    const saveSeen=vi.fn(async()=>{});
    const requestReply=vi.fn()
      .mockResolvedValueOnce({reply:'Hello, how can I help you?',premium:false})
      .mockResolvedValueOnce({reply:'Sure. What day works for you?',correction:'I need an appointment.',premium:false});
    const onDone=vi.fn();

    render(
      <I18nProvider
        dictionaries={dictionaries}
        config={{locales:['ru'],default:'ru'}}
        storageKey="ai-talk-test.locale"
        systemLanguages={['ru']}
      >
        <AIConversationView
          activity={activity}
          setId="general-foundation"
          saveSeen={saveSeen}
          onDone={onDone}
          onSignIn={()=>{}}
          requestReply={requestReply}
        />
      </I18nProvider>
    );

    await user.click(screen.getByRole('button',{name:'Начать разговор'}));
    expect(await screen.findByText('Hello, how can I help you?')).toBeTruthy();
    expect(screen.getByText('Пробная беседа')).toBeTruthy();
    expect(saveSeen).not.toHaveBeenCalled();

    const input=screen.getByRole('textbox',{name:'Твой ответ'});
    await user.type(input,'I need doctor');
    await user.click(screen.getByRole('button',{name:'Отправить'}));

    expect(await screen.findByText('Sure. What day works for you?')).toBeTruthy();
    expect(screen.getByText('I need an appointment.')).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Завершить разговор'}));
    expect(saveSeen).toHaveBeenCalledWith('general-foundation','talk.clinic');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('asks a signed-out learner to sign in instead of pretending AI works anonymously',async()=>{
    const user=userEvent.setup();
    const onSignIn=vi.fn();
    const requestReply=vi.fn(async()=>{throw Object.assign(new Error('auth_required'),{code:'auth_required'});});

    render(
      <I18nProvider
        dictionaries={dictionaries}
        config={{locales:['ru'],default:'ru'}}
        storageKey="ai-talk-auth-test.locale"
        systemLanguages={['ru']}
      >
        <AIConversationView
          activity={activity}
          setId="general-foundation"
          saveSeen={async()=>{}}
          onDone={()=>{}}
          onSignIn={onSignIn}
          requestReply={requestReply}
        />
      </I18nProvider>
    );

    await user.click(screen.getByRole('button',{name:'Начать разговор'}));
    expect(await screen.findByText('Для ИИ-разговора нужно войти.')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Войти'}));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });
});
