import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import { dictionaries } from './i18n';
import { emptyCourseProgress } from './progress';
import {
  OnboardingView,
  hasExistingCourseProgress
} from './onboarding';

function renderOnboarding(onDone=vi.fn()){
  render(
    <I18nProvider
      dictionaries={dictionaries}
      config={{locales:['ru'],default:'ru'}}
      storageKey="onboarding-test.locale"
      systemLanguages={['ru']}
    >
      <OnboardingView onDone={onDone} />
    </I18nProvider>
  );
  return onDone;
}

describe('minimal onboarding',()=>{
  it('is one short screen with no questionnaire and starts day one directly',async()=>{
    const user=userEvent.setup();
    const onDone=renderOnboarding();

    expect(screen.getByRole('heading',{name:'Говори по-английски в реальной жизни'})).toBeTruthy();
    expect(screen.getByText('Говори вслух')).toBeTruthy();
    expect(screen.getByText('Нажимай любое слово')).toBeTruthy();
    expect(screen.getByText('Повторы придут сами')).toBeTruthy();

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText(/уровень/i)).toBeNull();
    expect(screen.queryByText(/где жив/i)).toBeNull();
    expect(screen.queryByText(/минут в день/i)).toBeNull();
    expect(screen.queryByRole('button',{name:'Далее'})).toBeNull();
    expect(screen.queryByRole('button',{name:'Пропустить'})).toBeNull();

    await user.click(screen.getByRole('button',{name:'Начать день 1'}));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('automatically recognizes real/imported progress but ignores tombstones',()=>{
    const progress=emptyCourseProgress();
    expect(hasExistingCourseProgress(progress)).toBe(false);

    progress.seen['old']={at:'2026-09-01T00:00:00Z',deleted:true};
    expect(hasExistingCourseProgress(progress)).toBe(false);

    progress.learningDays['2026-09-29']={at:'2026-09-29T00:00:00Z'};
    expect(hasExistingCourseProgress(progress)).toBe(true);
  });
});
