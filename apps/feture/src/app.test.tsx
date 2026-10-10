import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { missingKeys } from '@appbase/ui-react/i18n.js';
import { routes } from './app';
import { dictionaries, LOCALE_KEY } from './i18n';
import product from '../config/product.json';

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
  it('renders the native React experience and keeps account accessible', async () => {
    const router=renderApp();
    expect(await screen.findByRole('heading',{name:/Твой мир/i})).toBeTruthy();
    await router.navigate('/account');
    expect(await screen.findByRole('textbox',{name:'Email'})).toBeTruthy();
  });

  it('shows the signed-in account and signs out', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ok:true}),{status:200,headers:{'Content-Type':'application/json'}}));
    signIn();
    const user = userEvent.setup();
    renderApp('/account');
    expect(await screen.findByText(/demo@example\.com/)).toBeTruthy();
    await user.click(screen.getByRole('button', {name:t['account.signOut']}));
    expect(await screen.findByRole('heading',{name:/Твой мир/i})).toBeTruthy();
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

  it('keeps dictionaries in sync and offers a language switch only for several locales', async () => {
    expect(missingKeys(dictionaries)).toEqual({});
    renderApp('/account');
    await screen.findByRole('textbox', {name:'Email'});
    expect(!!screen.queryByRole('combobox', {name: /язык|language/i})).toBe(product.i18n.locales.length > 1);
  });
});
