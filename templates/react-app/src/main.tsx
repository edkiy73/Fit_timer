import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createHashRouter, RouterProvider } from 'react-router';
import { routes } from './app';
import { applyProductTheme } from './theme';
import { installGlobalDiagnostics, trackInstallOnce } from './observability';
import './styles.css';

applyProductTheme();
installGlobalDiagnostics();
void trackInstallOnce();

const router = createHashRouter(routes);
const queryClient = new QueryClient({defaultOptions:{queries:{staleTime:30_000,retry:1}}});

const root = document.getElementById('root');
if(!root) throw new Error('__APP_SLUG___root_missing');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
