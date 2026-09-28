import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createHashRouter, RouterProvider } from 'react-router';
import { routes } from './app';
import { applyProductTheme } from './theme';
import './styles.css';

applyProductTheme();

// Hash routing works on any static host and inside a Capacitor WebView without server rewrites.
const router = createHashRouter(routes);
const queryClient = new QueryClient({defaultOptions: {queries: {staleTime: Infinity}}});

const root = document.getElementById('root');
if(!root) throw new Error('task_mini_root_missing');
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
