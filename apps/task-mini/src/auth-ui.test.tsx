import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createAuthClient } from '@appbase/core/auth.js';
import { AuthGate, AuthProvider, SignInForm, useAuth, useOptionalAuth } from '@appbase/ui-react/auth.js';

function SignedIn(){
  const auth = useAuth();
  return <div>signed:{auth.session.email}:{auth.session.handle}</div>;
}

function fakeAuth({mailFails=false}: {mailFails?: boolean} = {}){
  const memory = new Map<string,string>();
  const calls: Record<string, unknown>[] = [];
  const fakeFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
    calls.push(body);
    let payload: Record<string, unknown>;
    if(body.action === 'send') payload = mailFails ? {ok:false, error:'mail_failed'} : {ok:true, devCode:'123456'};
    else if(body.action === 'verify') payload = {
      ok:true, syncToken:'sync-test', handle:'', locale:'ru', fresh:true, needsHandle:true
    };
    else if(body.action === 'set_handle') payload = {ok:true, handle:body.handle};
    else payload = {ok:false, error:'unknown_action'};
    return new Response(JSON.stringify(payload), {
      status: payload.ok === false ? (payload.error === 'mail_failed' ? 502 : 400) : 200,
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
  return {client, calls};
}

function OptionalState(){
  const auth = useOptionalAuth();
  if(auth.loading) return null;
  return <div>{auth.session ? 'state:' + auth.session.email + ':' + (auth.session.handle || 'no-handle') : 'state:signed-out'}</div>;
}

describe('shared React auth UI', () => {
  it('runs email code and first-account handle flow through Core auth', async () => {
    const {client, calls} = fakeAuth();
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

  it('can skip the handle step for products that do not need a handle', async () => {
    const {client, calls} = fakeAuth();
    const user = userEvent.setup();
    render(<AuthGate client={client} locale="ru" askHandle={false}><SignedIn /></AuthGate>);
    await user.type(await screen.findByRole('textbox', {name:'Email'}), 'demo@example.com');
    await user.click(screen.getByRole('button', {name:'Прислать код'}));
    await user.click(await screen.findByRole('button', {name:'Войти'}));
    expect(await screen.findByText('signed:demo@example.com:')).toBeTruthy();
    expect(calls.map(call => call.action)).toEqual(['send','verify']);
  });

  it('lets a local-first app run signed out and sign in from its own screen', async () => {
    const {client} = fakeAuth();
    const user = userEvent.setup();
    let signedIn = '';
    render(
      <AuthProvider client={client}>
        <OptionalState />
        <SignInForm locale="en" askHandle={false} variant="inline" onSignedIn={session => { signedIn = session.email; }} />
      </AuthProvider>
    );
    expect(await screen.findByText('state:signed-out')).toBeTruthy();
    await user.type(screen.getByRole('textbox', {name:'Email'}), 'demo@example.com');
    await user.click(screen.getByRole('button', {name:'Send code'}));
    await user.click(await screen.findByRole('button', {name:'Sign in'}));
    expect(await screen.findByText('state:demo@example.com:no-handle')).toBeTruthy();
    expect(signedIn).toBe('demo@example.com');
  });

  it('signs in with an Admin-issued code when the code email cannot be sent', async () => {
    const {client, calls} = fakeAuth({mailFails:true});
    const user = userEvent.setup();
    render(<AuthGate client={client} locale="ru" askHandle={false}><SignedIn /></AuthGate>);
    await user.type(await screen.findByRole('textbox', {name:'Email'}), 'Family@Example.com');
    await user.click(screen.getByRole('button', {name:'Прислать код'}));
    expect((await screen.findByRole('alert')).textContent).toContain('У меня есть код');

    await user.click(screen.getByRole('button', {name:'У меня есть код'}));
    expect(await screen.findByText((_, el) => el?.textContent === 'Введи код для family@example.com.')).toBeTruthy();
    await user.type(screen.getByRole('textbox', {name:'Код из письма'}), '654321');
    await user.click(screen.getByRole('button', {name:'Войти'}));
    expect(await screen.findByText('signed:family@example.com:')).toBeTruthy();
    expect(calls.map(call => call.action)).toEqual(['send','verify']);
    expect(calls[1]?.email).toBe('family@example.com');
    expect(calls[1]?.code).toBe('654321');
  });
});
