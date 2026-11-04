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

  it('sends the old staff page to the moderation area in the app', async () => {
    signIn();
    const router=renderApp('/operator');
    await waitFor(()=>expect(router.state.location.pathname).toBe('/n/staff'));
  });

  it('keeps dictionaries in sync', () => {
    expect(missingKeys(dictionaries)).toEqual({});
  });
});
