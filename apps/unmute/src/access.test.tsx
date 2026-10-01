import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import type { AuthSession } from '@appbase/core/auth.js';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import type { LearnerCourseState } from './course-loader';
import { emptyCourseProgress } from './progress';
import { dictionaries } from './i18n';
import { AccessOfferView } from './access';

function state(access:'preview'|'full'='preview'):LearnerCourseState{
  const node={
    id:'day-8',kind:'lesson' as const,title:{ru:'День 8'},dayIndex:8,order:7,
    prerequisites:['day-7'],activityIds:[],optional:false
  };
  return {
    set:{
      schemaVersion:1,id:'general-foundation',revision:1,slug:'general-foundation',
      title:{ru:'Курс'},level:{labels:[]},
      access:{
        mode:'entitlement',
        entitlement:'course.general-foundation',
        freePreview:{kind:'first-days',days:7,learnedContentStaysAvailable:true}
      },
      defaultRoadmapId:'main',
      roadmaps:[{id:'main',title:{ru:'Путь'},nodes:[node]}],
      activities:[],resources:[]
    },
    roadmap:{id:'main',title:{ru:'Путь'},nodes:[node]},
    progress:emptyCourseProgress(),
    roadmapProgress:{
      nodes:[{node,complete:false,unlocked:true}],
      currentNode:node,currentDayIndex:8,completedCount:7,requiredCount:40,courseComplete:false
    },
    currentNode:null,currentDayIndex:null,access,fromCache:false
  };
}

function runtime(access:'preview'|'full'='preview'):LearnerCourseRuntimeValue{
  return {state:state(access),status:'ready',error:null,refresh:async()=>{}};
}

function session(overrides:Partial<AuthSession>={}):AuthSession{
  return {
    email:'person@example.com',deviceId:'d',syncToken:'t',handle:'',locale:'ru',
    sub:null,premium:false,owned:[],fresh:false,...overrides
  };
}

function renderView(
  value:LearnerCourseRuntimeValue,
  auth:AuthSession|null,
  props:Partial<Parameters<typeof AccessOfferView>[0]>={}
){
  const handlers={onBuy:vi.fn(),onRestore:vi.fn(),onCourse:vi.fn(),onContinue:vi.fn()};
  render(
    <I18nProvider
      dictionaries={dictionaries}
      config={{locales:['ru'],default:'ru'}}
      storageKey="access-test.locale"
      systemLanguages={['ru']}
    >
      <AccessOfferView runtime={value} session={auth} authLoading={false} {...handlers} {...props} />
    </I18nProvider>
  );
  return handlers;
}

describe('course access and purchase',()=>{
  it('offers the course and Plus with prices and a pay button, without placeholder wording',async()=>{
    const user=userEvent.setup();
    const {onBuy}=renderView(runtime(),session());
    expect(screen.getByRole('heading',{name:'Открой весь курс'})).toBeTruthy();
    expect(screen.getByRole('radio',{name:/Весь курс навсегда/})).toBeTruthy();
    expect(screen.getByRole('radio',{name:/Plus на месяц/})).toBeTruthy();
    expect(screen.getByRole('radio',{name:/Plus на год/})).toBeTruthy();
    expect(screen.queryByText(/администратор/)).toBeNull();
    expect(screen.getByText('Весь курс — 40 дней: уроки, практика, диалоги')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:/Оплатить 1\s490\s₽/}));
    expect(onBuy).toHaveBeenCalledWith('course');
    await user.click(screen.getByRole('radio',{name:/Plus на год/}));
    expect(screen.getByText('Расширенный доступ к разбору ошибок и разговорам с ИИ')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:/Оплатить 2\s990\s₽/}));
    expect(onBuy).toHaveBeenLastCalledWith('plus.year');
  });

  it('shows a course its own price when it has one',()=>{
    const value=runtime();
    const access=value.state!.set.access;
    if(access.mode==='entitlement')access.price={RUB:990};
    renderView(value,session());
    expect(screen.getByRole('button',{name:/Оплатить 990\s₽/})).toBeTruthy();
  });

  it('gives a Plus member the discounted course price, with the full price struck out',()=>{
    renderView(runtime(),session({premium:true,sub:{plan:'plus.month',until:'2099-01-01'} as AuthSession['sub']}));
    expect(screen.getByRole('button',{name:/Оплатить 1\s043\s₽/})).toBeTruthy();
    expect(screen.getByText('Цена со скидкой Plus −30%')).toBeTruthy();
    // Plus is already theirs: the screen does not sell it again.
    expect(screen.queryByText('Plus на месяц')).toBeNull();
    expect(screen.queryByText('Plus на год')).toBeNull();
  });

  it('says plainly when purchases are unavailable and keeps the button off',()=>{
    renderView(runtime(),session(),{canBuy:false});
    expect(screen.getByText('Покупка сейчас недоступна. Попробуй чуть позже.')).toBeTruthy();
    expect((screen.getByRole('button',{name:/Оплатить/}) as HTMLButtonElement).disabled).toBe(true);
  });

  it('restores purchases',async()=>{
    const user=userEvent.setup();
    const {onRestore}=renderView(runtime(),session());
    await user.click(screen.getByRole('button',{name:'Уже есть покупка? Восстановить'}));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it('celebrates a finished purchase and continues learning',async()=>{
    const user=userEvent.setup();
    const {onContinue}=renderView(runtime(),session(),{done:{plan:'course'}});
    expect(screen.getByRole('heading',{name:'Курс открыт!'})).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Продолжить обучение'}));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('shows active access for an owned course',()=>{
    renderView(runtime('full'),session({owned:['course.general-foundation']}));
    expect(screen.getByRole('heading',{name:'Курс открыт'})).toBeTruthy();
  });

  it('leads with Plus when the learner came from the AI limits',()=>{
    renderView(runtime('full'),session(),{focus:'plus'});
    expect(screen.getByRole('heading',{name:'UnMute Plus'})).toBeTruthy();
    expect(screen.queryByRole('radio',{name:/Весь курс навсегда/})).toBeNull();
    expect(screen.getByRole('radio',{name:/Plus на год/})).toHaveProperty('checked',true);
  });

  it('does not claim the course is usable until full content is actually loaded',()=>{
    renderView(runtime(),session({owned:['course.general-foundation']}));
    expect(screen.getByRole('heading',{name:'Курс открыт — осталось его скачать'})).toBeTruthy();
  });
});
