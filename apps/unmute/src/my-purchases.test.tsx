import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import type { AuthSession } from '@appbase/core/auth.js';
import { dictionaries } from './i18n';
import { MyPurchases } from './my-purchases';
import type { ContentCatalogSet } from './content/client';

const sets=[{id:'general-foundation',slug:'general-foundation',revision:1,title:{ru:'Общий английский'},description:null,level:{},
  access:{mode:'entitlement',entitlement:'course.general-foundation'},defaultRoadmapId:'main',publishedAt:''}] as ContentCatalogSet[];

function renderPurchases(session:Partial<AuthSession>,onRestore=vi.fn(async()=>{})){
  render(
    <MemoryRouter>
      <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="purchases-test.locale" systemLanguages={['ru']}>
        <MyPurchases session={{email:'a@example.com',owned:[],premium:false,...session} as AuthSession} sets={sets} onRestore={onRestore} />
      </I18nProvider>
    </MemoryRouter>
  );
  return onRestore;
}

describe('my purchases in the profile',()=>{
  it('lists a course bought forever and Plus with its date',()=>{
    renderPurchases({owned:['course.general-foundation'],premium:true,sub:{plan:'plus.year',until:'2027-10-07'} as AuthSession['sub']});
    expect(screen.getByRole('heading',{name:'Мои покупки'})).toBeTruthy();
    expect(screen.getByText('Общий английский')).toBeTruthy();
    expect(screen.getByText('Навсегда')).toBeTruthy();
    expect(screen.getByText(/Подключён до 7 октября 2027/)).toBeTruthy();
    expect(screen.getByRole('button',{name:'Продлить'})).toBeTruthy();
  });

  it('an auto-renewing Plus says when it renews and that renewal can be turned off',()=>{
    renderPurchases({premium:true,sub:{plan:'plus.month',until:'2026-11-07',autoRenew:true} as AuthSession['sub']});
    expect(screen.getByText(/Продлится автоматически 7 ноября 2026/)).toBeTruthy();
    expect(screen.getByText(/Автопродление можно отключить в любой момент/)).toBeTruthy();
    expect(screen.queryByText(/не продлевается/)).toBeNull();
  });

  it('says plainly when there is nothing yet and restores purchases',async()=>{
    const user=userEvent.setup();
    const onRestore=renderPurchases({});
    expect(screen.getByText(/Покупок пока нет/)).toBeTruthy();
    expect(screen.getByText(/Не подключён/)).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Покупка была на другом телефоне? Восстановить'}));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });
});
