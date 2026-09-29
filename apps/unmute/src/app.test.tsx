import { beforeEach, describe, expect, it } from 'vitest';
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

const signIn = () => localStorage.setItem('unmute.auth.session', JSON.stringify({
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

describe('UnMute: English for Expats starter', () => {
  it('opens Today without an account and offers sign-in', async () => {
    const user = userEvent.setup();
    const router = renderApp();
    expect(await screen.findByRole('heading', {name:t['today.title']})).toBeTruthy();
    await user.click(screen.getByRole('link', {name:t['nav.signIn']}));
    expect(router.state.location.pathname).toBe('/account');
    expect(await screen.findByRole('textbox', {name:'Email'})).toBeTruthy();
  });

  it('shows the signed-in account and signs out', async () => {
    signIn();
    const user = userEvent.setup();
    renderApp('/account');
    expect(await screen.findByText(/demo@example\.com/)).toBeTruthy();
    await user.click(screen.getByRole('button', {name:t['account.signOut']}));
    expect(await screen.findByRole('link', {name:t['nav.signIn']})).toBeTruthy();
  });

  it('keeps dictionaries in sync and offers a language switch only for several locales', async () => {
    expect(missingKeys(dictionaries)).toEqual({});
    renderApp('/account');
    await screen.findByRole('textbox', {name:'Email'});
    expect(!!screen.queryByRole('combobox')).toBe(product.i18n.locales.length > 1);
  });
});
