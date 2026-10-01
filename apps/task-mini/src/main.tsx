import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createHashRouter, RouterProvider } from 'react-router';
import { routes } from './app';
import { installBusyButtons } from '@appbase/core/busy-buttons.js';
import { applyProductTheme } from './theme';
import { startTaskSync } from './tasks/sync';
import './styles.css';

applyProductTheme();
// Every pressed button that waits for the server shows a spinner until the answer comes.
installBusyButtons();

// Hash routing works on any static host and inside a Capacitor WebView without server rewrites.
const router = createHashRouter(routes);
const queryClient = new QueryClient({defaultOptions: {queries: {staleTime: Infinity}}});
startTaskSync(queryClient);

const root = document.getElementById('root');
if(!root) throw new Error('task_mini_root_missing');
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
