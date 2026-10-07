import { MemoryRouter } from 'react-router';
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
    <MemoryRouter>
      <I18nProvider
        dictionaries={dictionaries}
        config={{locales:['ru'],default:'ru'}}
        storageKey="access-test.locale"
        systemLanguages={['ru']}
      >
        <AccessOfferView runtime={value} session={auth} authLoading={false} {...handlers} {...props} />
      </I18nProvider>
    </MemoryRouter>
  );
  return handlers;
}

describe('course access and purchase',()=>{
  it('sells only the course on the course screen: whole course or course + a year of Plus (decision 2)',async()=>{
    const user=userEvent.setup();
    const {onBuy}=renderView(runtime(),session());
    expect(screen.getByRole('heading',{name:'Открой весь курс'})).toBeTruthy();
    expect(screen.getByRole('radio',{name:/Весь курс навсегда/})).toBeTruthy();
    expect(screen.getByRole('radio',{name:/Курс \+ Plus на год/})).toBeTruthy();
    expect(screen.queryByRole('radio',{name:/Plus на месяц/})).toBeNull();
    expect(screen.queryByRole('radio',{name:/^Plus на год/})).toBeNull();
    expect(screen.queryByText(/администратор/)).toBeNull();
    expect(screen.getByText('Весь курс — 40 дней: уроки, практика, диалоги')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:/Оплатить 1\s490\s₽/}));
    expect(onBuy).toHaveBeenCalledWith('course');
    await user.click(screen.getByRole('radio',{name:/Курс \+ Plus на год/}));
    // Course 1 490 + a year of Plus 2 990 = 4 480, minus the default 30 % → 3 136: the saving is spelled out.
    expect(screen.getByText(/Отдельно 4\s480\s₽ — вместе всего 3\s136\s₽/)).toBeTruthy();
    expect(screen.getByText(/Экономия 1\s344\s₽/)).toBeTruthy();
    expect(screen.getByText('Год Plus: разговоры с ИИ прямо в приложении и разбор ошибок')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:/Оплатить 3\s136\s₽/}));
    expect(onBuy).toHaveBeenLastCalledWith('course.plus');
  });

  it('shows a course its own price when it has one',()=>{
    const value=runtime();
    const access=value.state!.set.access;
    if(access.mode==='entitlement')access.price={RUB:990};
    renderView(value,session());
    expect(screen.getByRole('button',{name:/Оплатить 990\s₽/})).toBeTruthy();
  });

  it('uses the bundle price set for the course in the admin',()=>{
    const value=runtime();
    const access=value.state!.set.access;
    if(access.mode==='entitlement')access.bundlePrice={RUB:2490};
    renderView(value,session());
    expect(screen.getByRole('radio',{name:/Курс \+ Plus на год.*2\s490\s₽/})).toBeTruthy();
  });

  it('opened during the free days says how many are left, not «Бесплатная часть пройдена»',()=>{
    const value=runtime();
    const progress=value.state!.roadmapProgress;
    value.state!.roadmapProgress={...progress,currentNode:{...progress.currentNode!,dayIndex:2}};
    renderView(value,session());
    expect(screen.getByText(/Первые 6 дней — бесплатно, попробуй без оплаты/)).toBeTruthy();
    expect(screen.queryByText(/Бесплатная часть пройдена/)).toBeNull();
  });

  it('the Plus screen has one title, without a repeated eyebrow',()=>{
    renderView(runtime(),session(),{focus:'plus'});
    expect(screen.getAllByText('UnMute Plus')).toHaveLength(1);
  });

  it('sells only Plus on the Plus screen: a month or a year',async()=>{
    const user=userEvent.setup();
    const {onBuy}=renderView(runtime(),session(),{focus:'plus'});
    expect(screen.getByRole('radio',{name:/Plus на месяц/})).toBeTruthy();
    expect(screen.getByRole('radio',{name:/Plus на год/})).toBeTruthy();
    expect(screen.queryByRole('radio',{name:/Весь курс навсегда/})).toBeNull();
    expect(screen.queryByRole('radio',{name:/Курс \+ Plus/})).toBeNull();
    await user.click(screen.getByRole('button',{name:/Оплатить 2\s990\s₽/}));
    expect(onBuy).toHaveBeenLastCalledWith('plus.year');
  });

  it('says plainly when purchases are unavailable and keeps the button off',()=>{
    renderView(runtime(),session(),{canBuy:false});
    expect(screen.getByText(/Покупка сейчас недоступна. Попробуй чуть позже./)).toBeTruthy();
    expect((screen.getByRole('button',{name:/Оплатить/}) as HTMLButtonElement).disabled).toBe(true);
  });

  it('links the terms of use next to the pay button',()=>{
    renderView(runtime(),session());
    expect(screen.getByRole('link',{name:'условия использования'}).getAttribute('href')).toBe('/legal/terms');
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
    expect(screen.getByRole('heading',{name:'UnMute Plus',level:2})).toBeTruthy();
    expect(screen.queryByText(/Plus не открывает этот курс/)).toBeNull();
    expect(screen.queryByRole('radio',{name:/Весь курс навсегда/})).toBeNull();
    expect(screen.getByRole('radio',{name:/Plus на год/})).toHaveProperty('checked',true);
  });

  it('does not claim the course is usable until full content is actually loaded',()=>{
    renderView(runtime(),session({owned:['course.general-foundation']}));
    expect(screen.getByRole('heading',{name:'Курс открыт — осталось его скачать'})).toBeTruthy();
  });
});
