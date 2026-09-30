import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { missingKeys } from '@appbase/ui-react/i18n.js';
import { routes } from './app';
import { authClient } from './auth';
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

afterEach(() => { vi.restoreAllMocks(); });

beforeEach(() => {
  localStorage.clear();
  // With several locales the app follows the system language; tests pin the default one.
  localStorage.setItem(LOCALE_KEY, product.i18n.default);
});

describe('UnMute: English for Expats starter', () => {
  it('opens Today without an account and offers sign-in under the Me tab', async () => {
    localStorage.setItem('unmute.onboarding.v1', '1');
    const user = userEvent.setup();
    const router = renderApp();
    expect(await screen.findByRole('heading', {name:t['today.title']})).toBeTruthy();
    const tabs = screen.getByRole('navigation', {name:t['nav.tabs']});
    expect(within(tabs).getByRole('link', {name:t['nav.today']}).getAttribute('aria-current')).toBe('page');
    await user.click(within(tabs).getByRole('link', {name:t['nav.me']}));
    expect(router.state.location.pathname).toBe('/account');
    expect(await screen.findByRole('textbox', {name:'Email'})).toBeTruthy();
    await user.click(within(tabs).getByRole('link', {name:t['nav.route']}));
    expect(router.state.location.pathname).toBe('/course');
  });

  it('hides the bottom bar inside a lesson', async () => {
    localStorage.setItem('unmute.onboarding.v1', '1');
    renderApp('/learn/day-1');
    await screen.findByRole('alert');
    expect(screen.queryByRole('navigation', {name:t['nav.tabs']})).toBeNull();
  });

  it('shows the signed-in account and signs out', async () => {
    signIn();
    const user = userEvent.setup();
    renderApp('/account');
    expect(await screen.findByText(/demo@example\.com/)).toBeTruthy();
    await user.click(screen.getByRole('button', {name:t['account.signOut']}));
    expect(await screen.findByRole('textbox', {name:'Email'})).toBeTruthy();
  });

  it('deletes the account after an explicit confirmation', async () => {
    signIn();
    const forget = vi.spyOn(authClient, 'forget').mockResolvedValue({ok:true});
    const user = userEvent.setup();
    renderApp('/account');
    await user.click(await screen.findByRole('button', {name:t['account.delete']}));
    expect(screen.getByText(t['account.deleteConfirm'])).toBeTruthy();
    expect(forget).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', {name:t['account.deleteYes']}));
    await waitFor(() => expect(screen.queryByText(/demo@example\.com/)).toBeNull());
    expect(forget).toHaveBeenCalledWith('all');
  });

  it('links the privacy and account deletion pages', async () => {
    renderApp('/account');
    expect((await screen.findByRole('link', {name:t['account.privacy']})).getAttribute('href')).toBe('./privacy.html');
    expect(screen.getByRole('link', {name:t['account.deletionInfo']}).getAttribute('href')).toBe('./delete-account.html');
  });

  it('keeps dictionaries in sync and offers a language switch only for several locales', async () => {
    expect(missingKeys(dictionaries)).toEqual({});
    renderApp('/account');
    await screen.findByRole('textbox', {name:'Email'});
    expect(!!screen.queryByRole('combobox', {name:t['account.language']})).toBe(product.i18n.locales.length > 1);
  });
});
