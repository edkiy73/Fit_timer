import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createHashRouter, RouterProvider } from 'react-router';
import { routes } from './app';
import { AppErrorBoundary } from '@appbase/ui-react/error-boundary.js';
import { installBusyButtons } from '@appbase/core/busy-buttons.js';
import { applyProductTheme } from './theme';
import { captureFatal, installGlobalDiagnostics, trackInstallOnce } from './observability';
import { startAppSync } from './sync';
import './styles.css';

applyProductTheme();
// Every pressed button that waits for the server shows a spinner until the answer comes.
installBusyButtons();
installGlobalDiagnostics();
void trackInstallOnce();
startAppSync();

const router = createHashRouter(routes);
const queryClient = new QueryClient({defaultOptions:{queries:{staleTime:30_000,retry:1}}});

const root = document.getElementById('root');
if(!root) throw new Error('__APP_SLUG___root_missing');

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary locale="__APP_LOCALE__" onError={captureFatal}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>
);
