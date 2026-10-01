import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import { dictionaries } from './i18n';
import { AnswerExplanationView } from './answer-explanation';

function renderView(requestExplain:any,onSignIn=vi.fn(),onAccess=vi.fn()){
  render(
    <I18nProvider
      dictionaries={dictionaries}
      config={{locales:['ru'],default:'ru'}}
      storageKey="answer-explain-test.locale"
      systemLanguages={['ru']}
    >
      <AnswerExplanationView
        question="Переведи: Я живу здесь"
        learnerAnswer="I life here"
        acceptedAnswers={['I live here']}
        onSignIn={onSignIn}
        onAccess={onAccess}
        requestExplain={requestExplain}
      />
    </I18nProvider>
  );
  return {onSignIn,onAccess};
}

describe('wrong-answer explanation UI',()=>{
  it('spends AI only after the learner explicitly asks why',async()=>{
    const user=userEvent.setup();
    const requestExplain=vi.fn(async()=>({
      why:'Здесь нужен глагол live, а life — существительное.',
      tip:'После I проверь, что стоит глагол действия.'
    }));
    renderView(requestExplain);

    expect(requestExplain).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button',{name:'Почему?'}));

    expect(requestExplain).toHaveBeenCalledWith(expect.objectContaining({
      learnerAnswer:'I life here',
      acceptedAnswers:['I live here'],
      locale:'ru'
    }));
    expect(await screen.findByText(/нужен глагол live/)).toBeTruthy();
    expect(screen.getByText(/проверь, что стоит глагол/)).toBeTruthy();
  });

  it('shows how many free explanations are left, then offers Plus',async()=>{
    const user=userEvent.setup();
    renderView(vi.fn(async()=>({why:'Нужен глагол live.',tip:'Проверь глагол.',freeRemaining:2,freeLimit:5})));
    await user.click(screen.getByRole('button',{name:'Почему?'}));
    expect(await screen.findByText('Бесплатных разборов осталось: 2 из 5.')).toBeTruthy();
  });

  it('after the free explanations are used, sends to Plus',async()=>{
    const user=userEvent.setup();
    const error:any=new Error('free_explain_used');
    error.code='free_explain_used';
    const onAccess=vi.fn();
    renderView(vi.fn(async()=>{throw error;}),vi.fn(),onAccess);
    await user.click(screen.getByRole('button',{name:'Почему?'}));
    expect(await screen.findByText(/Бесплатные разборы использованы/)).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Открыть Plus'}));
    expect(onAccess).toHaveBeenCalledTimes(1);
  });

  it('routes Plus errors to the existing access screen',async()=>{
    const user=userEvent.setup();
    const error:any=new Error('premium_required');
    error.code='premium_required';
    const onAccess=vi.fn();
    renderView(vi.fn(async()=>{throw error;}),vi.fn(),onAccess);

    await user.click(screen.getByRole('button',{name:'Почему?'}));
    await user.click(await screen.findByRole('button',{name:'Открыть Plus'}));
    expect(onAccess).toHaveBeenCalledTimes(1);
  });
});
