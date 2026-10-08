import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createHashRouter, RouterProvider } from 'react-router';
import { routes } from './app';
import { AppErrorBoundary } from '@appbase/ui-react/error-boundary.js';
import { installBusyButtons } from '@appbase/core/busy-buttons.js';
import { applyProductTheme } from './theme';
import { captureFatal, installGlobalDiagnostics, trackInstallOnce } from './observability';
import { startTaskSync } from './tasks/sync';
import './styles.css';

applyProductTheme();
// Every pressed button that waits for the server shows a spinner until the answer comes.
installBusyButtons();
installGlobalDiagnostics();
void trackInstallOnce();

// Hash routing works on any static host and inside a Capacitor WebView without server rewrites.
const router = createHashRouter(routes);
const queryClient = new QueryClient({defaultOptions: {queries: {staleTime: Infinity}}});
startTaskSync(queryClient);

const root = document.getElementById('root');
if(!root) throw new Error('task_mini_root_missing');
const fatalLocale = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en') ? 'en' : 'ru';

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary locale={fatalLocale} onError={captureFatal}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>
);
