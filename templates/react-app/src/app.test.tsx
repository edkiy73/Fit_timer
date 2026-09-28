import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from './app';

function renderApp(){
  const router = createMemoryRouter(routes);
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}

beforeEach(() => {
  localStorage.setItem('__APP_SLUG__.auth.session', JSON.stringify({
    email:'demo@example.com',
    deviceId:'device-test',
    syncToken:'token-test',
    handle:'@demo',
    locale:'__APP_LOCALE__',
    sub:null,
    premium:false,
    fresh:false
  }));
});

describe('__APP_NAME__ starter', () => {
  it('boots behind the shared auth gate', async () => {
    renderApp();
    expect(await screen.findByRole('heading', {name:'__READY_TITLE__'})).toBeTruthy();
    expect(screen.getByRole('button', {name:'__LOGOUT_TEXT__'})).toBeTruthy();
  });
});
