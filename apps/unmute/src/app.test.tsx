import { appRestart } from './sign-out';
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
import { resetAllStatistics, restartCourseProgress } from './progress-reset';

vi.mock('./progress-reset', () => ({
  resetAllStatistics:vi.fn(async () => undefined),
  restartCourseProgress:vi.fn(async () => undefined)
}));

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
    // Signing in is one button; the code form opens in a sheet.
    await user.click(await screen.findByRole('button', {name:t['me.signIn']}));
    expect(await screen.findByRole('textbox', {name:'Email'})).toBeTruthy();
    await user.click(screen.getByRole('button', {name:t['access.signInClose']}));
    await user.click(within(tabs).getByRole('link', {name:t['nav.route']}));
    expect(router.state.location.pathname).toBe('/course');
  });

  it('switches directly from Review to Route from the bottom bar', async () => {
    localStorage.setItem('unmute.onboarding.v1', '1');
    const user = userEvent.setup();
    const router = renderApp('/review');
    const tabs = await screen.findByRole('navigation', {name:t['nav.tabs']});
    await user.click(within(tabs).getByRole('link', {name:t['nav.route']}));
    await waitFor(() => expect(router.state.location.pathname).toBe('/course'));
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
    // Signing out lives in «Настройки» next to deleting the account.
    await user.click(screen.getByRole('link', {name:t['me.settings']}));
    const restart = vi.spyOn(appRestart, 'reload').mockImplementation(() => {});
    await user.click(await screen.findByRole('button', {name:t['account.signOut']}));
    // Sign-out asks first (owner's check 08.10).
    await user.click(await screen.findByRole('button', {name:t['account.signOutYes']}));
    // If progress could not be confirmed as sent, the app asks first.
    const anyway = await screen.findByRole('button', {name:t['account.signOutAnyway']}, {timeout:800}).catch(() => null);
    if(anyway) await user.click(anyway);
    await waitFor(() => expect(restart).toHaveBeenCalled());
    await user.click(await screen.findByRole('link', {name:t['nav.me']}));
    expect(await screen.findByRole('button', {name:t['me.signIn']})).toBeTruthy();
  });

  it('deletes the account after an explicit confirmation', async () => {
    signIn();
    const forget = vi.spyOn(authClient, 'forget').mockResolvedValue({ok:true});
    const user = userEvent.setup();
    renderApp('/settings');
    await user.click(await screen.findByRole('button', {name:t['account.delete']}));
    expect(screen.getByText(t['account.deleteConfirm'])).toBeTruthy();
    expect(forget).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', {name:t['account.deleteYes']}));
    await waitFor(() => expect(forget).toHaveBeenCalledWith('all'));
  });

  it('«Я» shows results and a sign-in button; settings are their own screen', async () => {
    const router = renderApp('/account');
    expect(await screen.findByRole('link', {name:t['me.settings']})).toBeTruthy();
    expect(screen.getByRole('button', {name:t['me.signIn']})).toBeTruthy();
    expect(screen.queryByText(t['me.theme'])).toBeNull();
    // The old results page now lands on «Я».
    await router.navigate('/progress');
    await waitFor(() => expect(router.state.location.pathname).toBe('/account'));
  });

  it('resets statistics only after confirmation and keeps the user in Settings', async () => {
    const user = userEvent.setup();
    const router = renderApp('/settings');
    await user.click(await screen.findByRole('button', {name:t['reset.statsStart']}));
    expect(screen.getByText(t['reset.statsConfirm'])).toBeTruthy();
    expect(resetAllStatistics).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', {name:t['reset.statsYes']}));
    await waitFor(() => expect(resetAllStatistics).toHaveBeenCalled());
    expect(router.state.location.pathname).toBe('/settings');
  });

  it('restarts only the selected course after a separate destructive confirmation', async () => {
    const user = userEvent.setup();
    const router = renderApp('/settings');
    await user.click(await screen.findByRole('button', {name:t['reset.courseStart']}));
    expect(screen.getByText(t['reset.courseConfirm'])).toBeTruthy();
    expect(restartCourseProgress).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', {name:t['reset.courseYes']}));
    await waitFor(() => expect(restartCourseProgress).toHaveBeenCalled());
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('opens the privacy and account deletion pages inside the app, so Back returns', async () => {
    renderApp('/settings');
    expect((await screen.findByRole('link', {name:t['account.privacy']})).getAttribute('href')).toMatch(/\/legal\/privacy$/);
    expect(screen.getByRole('link', {name:t['account.deletionInfo']}).getAttribute('href')).toMatch(/\/legal\/delete-account$/);
  });

  it('keeps dictionaries in sync and offers a language switch only for several locales', async () => {
    expect(missingKeys(dictionaries)).toEqual({});
    renderApp('/settings');
    await screen.findByRole('heading', {name:t['me.settings']});
    expect(!!screen.queryByRole('combobox', {name:t['account.language']})).toBe(product.i18n.locales.length > 1);
  });
});
