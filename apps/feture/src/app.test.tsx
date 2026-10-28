import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { missingKeys } from '@appbase/ui-react/i18n.js';
import { routes } from './app';
import { dictionaries, LOCALE_KEY } from './i18n';
import product from '../config/product.json';


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

describe('FetUre routes', () => {
  it('sends the root and unknown links to the app', async () => {
    const router=renderApp();
    await waitFor(()=>expect(router.state.location.pathname).toBe('/n/feed'));
    const broken=renderApp('/does-not-exist');
    await waitFor(()=>expect(broken.state.location.pathname).toBe('/n/feed'));
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

  it('keeps dictionaries in sync', () => {
    expect(missingKeys(dictionaries)).toEqual({});
  });
});
