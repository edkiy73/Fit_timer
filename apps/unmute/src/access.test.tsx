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

function renderView(value:LearnerCourseRuntimeValue,auth:AuthSession|null,onRefresh=vi.fn(),onAccount=vi.fn()){
  render(
    <I18nProvider
      dictionaries={dictionaries}
      config={{locales:['ru'],default:'ru'}}
      storageKey="access-test.locale"
      systemLanguages={['ru']}
    >
      <AccessOfferView
        runtime={value}
        session={auth}
        authLoading={false}
        onRefresh={onRefresh}
        onAccount={onAccount}
        onCourse={()=>{}}
      />
    </I18nProvider>
  );
}

describe('course access offer',()=>{
  it('shows permanent and Plus options without pretending checkout already exists',()=>{
    renderView(runtime(),null);
    expect(screen.getByRole('heading',{name:'Открыть весь курс'})).toBeTruthy();
    expect(screen.getByRole('heading',{name:'Весь курс навсегда'})).toBeTruthy();
    expect(screen.getByRole('heading',{name:'UnMute Plus'})).toBeTruthy();
    expect(screen.getByText(/Покупки подключим на этапе оплаты/)).toBeTruthy();
  });

  it('sends an anonymous learner to account recovery',async()=>{
    const user=userEvent.setup();
    const onAccount=vi.fn();
    renderView(runtime(),null,vi.fn(),onAccount);
    await user.click(screen.getByRole('button',{name:'Войти или восстановить доступ'}));
    expect(onAccount).toHaveBeenCalledTimes(1);
  });

  it('lets a signed-in learner refresh admin-granted access',async()=>{
    const user=userEvent.setup();
    const onRefresh=vi.fn();
    renderView(runtime(),session(),onRefresh);
    await user.click(screen.getByRole('button',{name:'Проверить доступ'}));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows active access for an owned course',()=>{
    renderView(runtime('full'),session({owned:['course.general-foundation']}));
    expect(screen.getByRole('heading',{name:'Полный курс открыт'})).toBeTruthy();
    expect(screen.getByText(/навсегда/)).toBeTruthy();
  });

  it('shows active access for Plus',()=>{
    renderView(runtime('full'),session({
      premium:true,
      sub:{until:'2099-01-01T00:00:00.000Z'}
    }));
    expect(screen.getByText(/UnMute Plus/)).toBeTruthy();
  });

  it('does not claim the course is usable until full content is actually loaded',()=>{
    renderView(runtime('preview'),session({owned:['course.general-foundation']}),vi.fn());
    expect(screen.getByRole('heading',{name:'Доступ есть — загружаем курс'})).toBeTruthy();
    expect(screen.queryByRole('heading',{name:'Полный курс открыт'})).toBeNull();
  });
});
