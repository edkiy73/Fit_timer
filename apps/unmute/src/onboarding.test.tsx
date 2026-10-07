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

vi.mock('@appbase/ui-react/auth.js',()=>({useOptionalAuth:()=>({session:null,loading:false})}));

function renderOnboarding(onDone=vi.fn(),extra:Partial<Parameters<typeof OnboardingView>[0]>={}){
  render(
    <I18nProvider
      dictionaries={dictionaries}
      config={{locales:['ru'],default:'ru'}}
      storageKey="onboarding-test.locale"
      systemLanguages={['ru']}
    >
      <OnboardingView onDone={onDone} {...extra} />
    </I18nProvider>
  );
  return onDone;
}

describe('minimal onboarding',()=>{
  it('says when the choice was not saved and keeps the start button',()=>{
    renderOnboarding(vi.fn(),{error:true});
    expect(screen.getByRole('alert').textContent).toContain('Не получилось сохранить выбор');
    expect(screen.getByRole('button',{name:'Начать день 1'})).toBeTruthy();
  });

  it('is one short screen with no questionnaire and starts day one directly',async()=>{
    const user=userEvent.setup();
    const onDone=renderOnboarding();

    expect(screen.getByRole('heading',{name:'Говори по-английски в реальной жизни'})).toBeTruthy();
    expect(screen.getByText('Говори вслух')).toBeTruthy();
    expect(screen.getByText('Нажимай любое слово')).toBeTruthy();
    expect(screen.getByText('Повторы придут сами')).toBeTruthy();
    expect(screen.getByRole('heading',{name:'Как это работает'})).toBeTruthy();

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Можно начать сразу')).toBeTruthy();
    expect(screen.queryByText(/где жив/i)).toBeNull();
    expect(screen.queryByText(/минут в день/i)).toBeNull();
    expect(screen.queryByRole('button',{name:'Далее'})).toBeNull();
    expect(screen.queryByRole('button',{name:'Пропустить'})).toBeNull();

    await user.click(screen.getByRole('button',{name:'Начать день 1'}));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('offers the published courses when there is more than one',async()=>{
    const user=userEvent.setup();
    const onCourse=vi.fn();
    const course=(id:string,title:string,level:string)=>({
      id,title:{ru:title},description:{ru:title+' — описание'},level:{from:level,to:level},access:{mode:'free'}
    }) as never;
    renderOnboarding(vi.fn(),{
      courses:[course('main','Общий английский','a1'),course('a1-starter','A1: первые шаги','a1')],
      courseId:'main',
      onCourse
    });

    expect(screen.getByRole('heading',{name:'Выбери курс'})).toBeTruthy();
    const option=screen.getAllByRole('button',{name:/Общий английский/}).find(button=>button.hasAttribute('aria-pressed'));
    expect(option?.getAttribute('aria-pressed')).toBe('true');
    // The start button names the chosen course (decision 14).
    expect(screen.getByRole('button',{name:'Начать: Общий английский'})).toBeTruthy();
    await user.click(screen.getByRole('button',{name:/A1: первые шаги/}));
    expect(onCourse).toHaveBeenCalledWith('a1-starter');
  });

  it('waits for a choice when Admin preselects no course, and offers sign-in and a look around',async()=>{
    const user=userEvent.setup();
    const onSignIn=vi.fn(), onBrowse=vi.fn();
    const course=(id:string,title:string)=>({id,title:{ru:title},description:null,level:{},access:{mode:'free'}}) as never;
    renderOnboarding(vi.fn(),{courses:[course('main','Общий английский'),course('a1-starter','A1: первые шаги')],courseId:'',onCourse:vi.fn(),onSignIn,onBrowse});
    expect((screen.getByRole('button',{name:'Выбери курс, чтобы начать'}) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button',{name:'Войти в аккаунт'}));
    await user.click(screen.getByRole('button',{name:'Сначала посмотреть приложение'}));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(onBrowse).toHaveBeenCalledTimes(1);
  });

  it('skips the course choice with a single course',()=>{
    renderOnboarding(vi.fn(),{courses:[{id:'main',title:{ru:'Общий'},access:{mode:'free'}} as never],courseId:'main',onCourse:vi.fn()});
    expect(screen.queryByRole('heading',{name:'Выбери курс'})).toBeNull();
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
