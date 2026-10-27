import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { missingKeys } from '@appbase/ui-react/i18n.js';
import { routes } from './app';
import { dictionaries, LOCALE_KEY } from './i18n';
import product from '../config/product.json';
import questionnaires from '../data/questionnaires.json';

const t = dictionaries[product.i18n.default as keyof typeof dictionaries];

function renderApp(path = '/'){
  const router = createMemoryRouter(routes, {initialEntries:[path]});
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}

const signIn = () => localStorage.setItem('feture.auth.session', JSON.stringify({
  email:'demo@example.com',
  deviceId:'device-test',
  syncToken:'token-test',
  handle:'@demo',
  locale:'ru',
  sub:null,
  premium:false,
  owned:[],
  fresh:false
}));

beforeEach(() => {
  localStorage.clear();
  // With several locales the app follows the system language; tests pin the default one.
  localStorage.setItem(LOCALE_KEY, product.i18n.default);
});

describe('FetUre starter', () => {
  it('shows the public Welcome and keeps account accessible', async () => {
    const router=renderApp();
    expect(await screen.findByRole('heading',{name:/Открывай себя/i})).toBeTruthy();
    expect(screen.getByRole('link',{name:/Вход или регистрация/i}).getAttribute('href')).toBe('/design/A02');
    await router.navigate('/account');
    expect(await screen.findByRole('textbox',{name:'Email'})).toBeTruthy();
  });

  it('opens World without a duplicate Home and adds Dating only after opting in', async () => {
    signIn();
    const user=userEvent.setup();
    // «/» opens the V21 app now; the earlier World keeps its own path.
    const router=renderApp('/world');
    expect(await screen.findByRole('heading',{name:/Твой мир/i,level:1})).toBeTruthy();
    const dock=()=>screen.getByRole('navigation',{name:'Основная навигация FetUre'});
    expect(dock().querySelectorAll('a')).toHaveLength(4);
    expect(router.state.location.pathname).toBe('/world');
    await router.navigate('/dating');
    await user.click(await screen.findByRole('button',{name:'Открыть знакомства'}));
    expect(dock().querySelectorAll('a')).toHaveLength(5);
    await user.click(within(dock()).getByRole('link',{name:'Исследовать'}));
    expect(router.state.location.pathname).toBe('/explore');
    expect(dock().querySelectorAll('a')).toHaveLength(5);
  });
  it('distinguishes the editorial Explore from a personal map', async () => {
    const router=renderApp('/explore');
    const user=userEvent.setup();
    expect(await screen.findByRole('heading',{name:/Новое начинается с любопытства/i})).toBeTruthy();
    const covers=await screen.findAllByRole('button',{name:/Открыть направление/i});
    expect(covers.length).toBeGreaterThan(0);
    await user.click(covers[0]!);
    expect(router.state.location.pathname).toMatch(/^\/explore\//);
    expect(await screen.findByRole('button',{name:/Все направления/i})).toBeTruthy();
  });

  it('offers a skippable first-use journey without pretending selections were saved', async () => {
    signIn();
    const user=userEvent.setup();
    const router=renderApp('/start');
    expect(await screen.findByRole('heading',{name:/Что хочется открыть первым/i})).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Продолжить'}));
    expect(await screen.findByRole('heading',{name:/Какие темы тебе интересны/i})).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Продолжить'}));
    expect(await screen.findByRole('heading',{name:/Твой мир — в твоих руках/i})).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Открыть каталог'}));
    expect(router.state.location.pathname).toBe('/explore');
  });

  it('uses the selected first-use intention as a real destination', async () => {
    signIn();
    const user=userEvent.setup();
    const router=renderApp('/start');
    await user.click(await screen.findByRole('button',{name:/Найти общение/i}));
    await user.click(screen.getByRole('button',{name:'Продолжить'}));
    await user.click(screen.getByRole('button',{name:'Продолжить'}));
    await user.click(screen.getByRole('button',{name:'Открыть сообщество'}));
    expect(router.state.location.pathname).toBe('/community');
  });

  it('keeps the intended shared-card route in account sign-in navigation state', async () => {
    const id='91e9ee01-e4e2-4900-a7ad-144c46442390';
    const router=renderApp('/share/'+id);
    const user=userEvent.setup();
    await user.click(await screen.findByRole('link',{name:'Войти и открыть карточку'}));
    expect(router.state.location.pathname).toBe('/account');
    expect(router.state.location.state).toEqual({returnTo:'/share/'+id});
  });

  it('shows the signed-in account and signs out', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ok:true}),{status:200,headers:{'Content-Type':'application/json'}}));
    signIn();
    const user = userEvent.setup();
    renderApp('/account');
    expect(await screen.findByText(/demo@example\.com/)).toBeTruthy();
    await user.click(screen.getByRole('button', {name:t['account.signOut']}));
    expect(await screen.findByRole('heading',{name:/Открывай себя/i})).toBeTruthy();
    vi.restoreAllMocks();
  });

  it('shows a calm not-found screen for broken links', async () => {
    const user = userEvent.setup();
    const router = renderApp('/does-not-exist');
    expect(await screen.findByRole('heading', {name:t['route.notFoundTitle']})).toBeTruthy();
    await user.click(screen.getByRole('button', {name:t['route.home']}));
    expect(router.state.location.pathname).toBe('/');
  });

  it('recovers the email-code form after resend and lets the address be corrected', async () => {
    const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({ok:true}),{status:200}));
    try {
      const user=userEvent.setup();
      renderApp('/account');
      await user.type(await screen.findByRole('textbox',{name:'Email'}),'owner@example.com');
      await user.click(screen.getByRole('button',{name:'Прислать код'}));
      const code=await screen.findByRole('textbox',{name:'Код из письма'});
      expect(screen.getByText(/Код действует 15 минут/)).toBeTruthy();
      await user.type(code,'123456');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ok:true}),{status:200}));
      await user.click(screen.getByRole('button',{name:'Отправить код ещё раз'}));
      expect((code as HTMLInputElement).value).toBe('');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({error:'rate_limited'}),{status:429}));
      await user.click(screen.getByRole('button',{name:'Отправить код ещё раз'}));
      expect(await screen.findByRole('alert')).toHaveProperty('textContent','Слишком много попыток. Подожди и попробуй позже.');
      await user.click(screen.getByRole('button',{name:'Изменить адрес'}));
      expect(screen.queryByRole('alert')).toBeNull();
      const email=screen.getByRole('textbox',{name:'Email'});
      await user.clear(email);
      await user.type(email,'second@example.com');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ok:true}),{status:200}));
      await user.click(screen.getByRole('button',{name:'Прислать код'}));
      expect(await screen.findByText('second@example.com')).toBeTruthy();
      const last=fetchMock.mock.calls.at(-1);
      expect(JSON.parse(String(last?.[1]?.body))).toMatchObject({action:'send',email:'second@example.com'});
    } finally {vi.restoreAllMocks();}
  });

  it('keeps a journal draft after a lost response, blocks navigation and retries the same operation', async () => {
    signIn();
    const calls:Record<string,unknown>[]=[];
    let failures=1;
    const requestId='00000000-0000-4000-8000-000000000001';
    vi.spyOn(globalThis,'fetch').mockImplementation(async (_url,options) => {
      const c=JSON.parse(String(options?.body||'{}')) as Record<string,unknown>;
      if(c.action==='journal.list')return new Response(JSON.stringify({ok:true,items:[],nextCursor:null,requestId}));
      if(c.action==='journal.save'){
        calls.push(c);
        if(failures--)return new Response(JSON.stringify({error:'domain_unavailable'}),{status:503});
        return new Response(JSON.stringify({ok:true,replayed:true,requestId,entry:{id:c.id,title:c.title,text:c.text,topicId:c.topicId,deleted:false,revision:1,createdAt:'2026-10-11T00:00:00Z',updatedAt:'2026-10-11T00:00:00Z'}}));
      }
      return new Response('{}',{status:503});
    });
    try {
      const user=userEvent.setup();renderApp('/journal');
      const text=await screen.findByRole('textbox',{name:'Твои мысли'});
      await user.type(text,'Мысль, которую нельзя потерять');
      await user.click(screen.getByRole('button',{name:'Сохранить запись'}));
      await screen.findByRole('alert');
      expect(text).toHaveProperty('value','Мысль, которую нельзя потерять');
      await user.click(screen.getByRole('link',{name:'← Мой мир'}));
      await screen.findByRole('dialog',{name:'Результат действия ещё не подтверждён'});
      expect(screen.queryByRole('button',{name:'Выйти без сохранения'})).toBeNull();
      expect(text.matches(':disabled')).toBe(true);
      await user.click(screen.getByRole('button',{name:'Остаться'}));
      expect(text).toHaveProperty('value','Мысль, которую нельзя потерять');
      await user.click(await screen.findByRole('button',{name:'Повторить то же действие'}));
      await screen.findByText('Запись сохранена. Её видишь только ты.');
      expect(calls).toHaveLength(2);expect(calls[1]).toEqual(calls[0]);
      await user.click(screen.getByRole('link',{name:'← Мой мир'}));
      expect(await screen.findByRole('heading',{name:/Твой мир/i,level:1})).toBeTruthy();
    } finally {vi.restoreAllMocks();}
  });

  it('preserves questionnaire answers after a lost response and retries the exact save', async () => {
    signIn();
    const user=userEvent.setup(),calls:Record<string,unknown>[]=[];
    const requestId='00000000-0000-4000-8000-000000000001',attemptId='00000000-0000-4000-8000-000000000002';
    const definition=questionnaires[0]!;
    const attempt={id:attemptId,version:{id:requestId,testId:definition.id,revision:1,definition,publishedAt:'2026-10-11T00:00:00Z'},status:'draft',answers:{},position:0,revision:1,result:null,updatedAt:'2026-10-11T00:00:00Z'};
    vi.spyOn(globalThis,'fetch').mockImplementation(async (_url,options)=>{
      const c=JSON.parse(String(options?.body||'{}')) as Record<string,unknown>;
      if(c.action==='tests.read')return new Response(JSON.stringify({ok:true,attempt,requestId}));
      if(c.action==='tests.save'){calls.push(c);if(calls.length===1)return new Response(JSON.stringify({error:'domain_unavailable'}),{status:503});if(calls.length===2)return new Response(JSON.stringify({error:'consent_required'}),{status:403});return new Response(JSON.stringify({ok:true,replayed:true,requestId,attempt:{...attempt,answers:c.answers,position:c.position,revision:2}}));}
      return new Response('{}',{status:503});
    });
    try {
      renderApp('/tests/'+attemptId);
      const choice=await screen.findByRole('radio',{name:'Сейчас подходит'});
      await user.click(choice);
      await user.click(screen.getByRole('button',{name:'Сохранить и продолжить позже'}));
      await screen.findByRole('alert');expect(choice).toHaveProperty('checked',true);
      expect(screen.getByRole('button',{name:'Загрузить сохранённое'}).matches(':disabled')).toBe(true);
      await user.click(within(screen.getByRole('navigation',{name:'Основная навигация FetUre'})).getByRole('link',{name:'Исследовать'}));
      await screen.findByRole('dialog',{name:'Результат действия ещё не подтверждён'});
      expect(screen.queryByRole('button',{name:'Уйти без сохранения'})).toBeNull();
      await user.click(screen.getByRole('button',{name:'Остаться'}));expect(choice).toHaveProperty('checked',true);
      await user.click(await screen.findByRole('button',{name:'Повторить то же действие'}));
      await screen.findByText('Прочитай актуальные документы и подтверди согласие.');
      expect(screen.getByRole('button',{name:'Загрузить сохранённое'}).matches(':disabled')).toBe(true);
      await user.click(screen.getByRole('button',{name:'Повторить то же действие'}));
      await screen.findByText('Ответы сохранены. Можно продолжить позже.');
      expect(calls).toHaveLength(3);expect(calls[1]).toEqual(calls[0]);expect(calls[2]).toEqual(calls[0]);
      await user.click(within(screen.getByRole('navigation',{name:'Основная навигация FetUre'})).getByRole('link',{name:'Исследовать'}));
      expect(await screen.findByRole('heading',{name:/Новое начинается с любопытства/i})).toBeTruthy();
    } finally {vi.restoreAllMocks();}
  });

  it('opens the auditor workspace without a key and clears audit data after role revocation', async () => {
    signIn();
    let revoked=false;
    const headers:Headers[]=[];
    vi.spyOn(globalThis,'fetch').mockImplementation(async (_url,options)=>{
      const body=JSON.parse(String(options?.body||'{}')) as Record<string,unknown>;
      if(typeof body.action==='string'&&(body.action.startsWith('feture.qa.')||body.action.startsWith('feture.operators.'))){
        headers.push(new Headers(options?.headers));
        if(revoked)return new Response(JSON.stringify({error:'forbidden'}),{status:403});
        if(body.action==='feture.operators.status')return new Response(JSON.stringify({ok:true,role:'auditor',initialized:true,events:[],items:[]}));
        if(body.action==='feture.qa.list')return new Response(JSON.stringify({ok:true,items:[{accountHash:'a'.repeat(32),expiresAt:'2026-10-12T00:00:00Z',revoked:false}],activeCount:1}));
        if(body.action==='feture.qa.audit')return new Response(JSON.stringify({ok:true,items:[]}));
      }
      return new Response('{}',{status:503});
    });
    try {
      const user=userEvent.setup();renderApp('/operator');
      expect(await screen.findByText(/Доступ только для чтения/)).toBeTruthy();
      expect(await screen.findByText(/aaaaaa…aaaaaa/)).toBeTruthy();
      expect(screen.queryByRole('button',{name:'Выдать QA-доступ'})).toBeNull();
      expect(screen.queryByLabelText('Ключ администратора')).toBeNull();
      expect(screen.queryByLabelText('Email существующего аккаунта')).toBeNull();
      expect(headers.length).toBeGreaterThan(0);
      expect(headers.every(h=>!h.has('x-admin-key')&&h.get('x-fit-token')==='token-test')).toBe(true);
      revoked=true;await user.click(screen.getByRole('button',{name:'Обновить журнал'}));
      await screen.findByText('Сессия или права изменились. Проверь вход и обнови доступ.');
      expect(screen.queryByText(/aaaaaa…aaaaaa/)).toBeNull();
    } finally {vi.restoreAllMocks();}
  });

  it('keeps dictionaries in sync and offers a language switch only for several locales', async () => {
    expect(missingKeys(dictionaries)).toEqual({});
    renderApp('/account');
    await screen.findByRole('textbox', {name:'Email'});
    expect(!!screen.queryByRole('combobox', {name: /язык|language/i})).toBe(product.i18n.locales.length > 1);
  });
});
