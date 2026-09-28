import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createHashRouter, RouterProvider } from 'react-router';
import { routes } from './app';
import { AppErrorBoundary } from '@appbase/ui-react/error-boundary.js';
import { applyProductTheme } from './theme';
import { captureFatal, installGlobalDiagnostics, trackInstallOnce } from './observability';
import { startAppSync } from './sync';
import './styles.css';

applyProductTheme();
installGlobalDiagnostics();
void trackInstallOnce();
startAppSync();

const router = createHashRouter(routes);
const queryClient = new QueryClient({defaultOptions:{queries:{staleTime:30_000,retry:1}}});

const root = document.getElementById('root');
if(!root) throw new Error('unmute_root_missing');

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary locale="ru" onError={captureFatal}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>
);
