import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import { dictionaries } from './i18n';
import { emptyCourseProgress } from './progress';
import {
  OnboardingView,
  hasExistingCourseProgress,
  shouldShowOnboarding
} from './onboarding';

function renderOnboarding(onDone=vi.fn(),onSkip=vi.fn()){
  render(
    <I18nProvider
      dictionaries={dictionaries}
      config={{locales:['ru'],default:'ru'}}
      storageKey="onboarding-test.locale"
      systemLanguages={['ru']}
    >
      <OnboardingView onDone={onDone} onSkip={onSkip} />
    </I18nProvider>
  );
  return {onDone,onSkip};
}

describe('minimal onboarding',()=>{
  it('shows only three short product explanations and starts without a questionnaire',async()=>{
    const user=userEvent.setup();
    const {onDone}=renderOnboarding();

    expect(screen.getByRole('heading',{name:'Говори для жизни'})).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();

    await user.click(screen.getByRole('button',{name:'Далее'}));
    expect(screen.getByRole('heading',{name:'Нажимай любое слово'})).toBeTruthy();
    expect(screen.getByText('I need to book an appointment.')).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Далее'}));
    expect(screen.getByRole('heading',{name:'Говори, слушай, повторяй'})).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Начать день 1'}));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('can be skipped without asking for profile data',async()=>{
    const user=userEvent.setup();
    const {onSkip}=renderOnboarding();

    await user.click(screen.getByRole('button',{name:'Пропустить'}));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('automatically skips onboarding when real/imported course progress already exists',()=>{
    const progress=emptyCourseProgress();
    expect(hasExistingCourseProgress(progress)).toBe(false);

    progress.seen['activity.one']={at:'2026-09-29T00:00:00Z'};
    expect(hasExistingCourseProgress(progress)).toBe(true);

    const state={progress} as Parameters<typeof shouldShowOnboarding>[1];
    expect(shouldShowOnboarding(false,state)).toBe(false);
  });

  it('ignores tombstones when deciding whether the learner already has progress',()=>{
    const progress=emptyCourseProgress();
    progress.seen['old']={at:'2026-09-29T00:00:00Z',deleted:true};
    expect(hasExistingCourseProgress(progress)).toBe(false);
  });
});
