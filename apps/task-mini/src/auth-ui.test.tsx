import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createAuthClient } from '@appbase/core/auth.js';
import { AuthGate, useAuth } from '@appbase/ui-react/auth.js';

function SignedIn(){
  const auth = useAuth();
  return <div>signed:{auth.session.email}:{auth.session.handle}</div>;
}

describe('shared React auth UI', () => {
  it('runs email code and first-account handle flow through Core auth', async () => {
    const memory = new Map<string,string>();
    const calls: Record<string, unknown>[] = [];
    const fakeFetch: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      calls.push(body);
      let payload: Record<string, unknown>;
      if(body.action === 'send') payload = {ok:true, devCode:'123456'};
      else if(body.action === 'verify') payload = {
        ok:true, syncToken:'sync-test', handle:'', locale:'ru', fresh:true, needsHandle:true
      };
      else if(body.action === 'set_handle') payload = {ok:true, handle:body.handle};
      else payload = {ok:false, error:'unknown_action'};
      return new Response(JSON.stringify(payload), {
        status: payload.ok === false ? 400 : 200,
        headers:{'Content-Type':'application/json'}
      });
    };
    const client = createAuthClient({
      endpoint:'/api/auth',
      storage:{
        getItem:key => memory.get(key) || null,
        setItem:(key,value) => { memory.set(key,value); },
        removeItem:key => { memory.delete(key); }
      },
      fetch:fakeFetch,
      createDeviceId:()=>'device-ui-test'
    });

    const user = userEvent.setup();
    render(<AuthGate client={client} locale="ru" productName="Demo"><SignedIn /></AuthGate>);

    expect(await screen.findByRole('heading', {name:'Аккаунт'})).toBeTruthy();
    await user.type(screen.getByRole('textbox', {name:'Email'}), 'Demo@Example.com');
    await user.click(screen.getByRole('button', {name:'Прислать код'}));

    expect(await screen.findByText((_, el) => el?.textContent === 'Код отправлен на demo@example.com.')).toBeTruthy();
    expect((screen.getByRole('textbox', {name:'Код из письма'}) as HTMLInputElement).value).toBe('123456');
    await user.click(screen.getByRole('button', {name:'Войти'}));

    expect(await screen.findByText('Придумай ник для аккаунта.')).toBeTruthy();
    const handle = screen.getByRole('textbox', {name:'Ник'});
    await user.clear(handle);
    await user.type(handle, '@demo');
    await user.click(screen.getByRole('button', {name:'Создать аккаунт'}));

    expect(await screen.findByText('signed:demo@example.com:@demo')).toBeTruthy();
    expect(calls.map(call => call.action)).toEqual(['send','verify','set_handle']);
    expect(calls[1]?.deviceId).toBe('device-ui-test');
  });
});
