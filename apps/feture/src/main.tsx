import './zod-config';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createHashRouter, RouterProvider } from 'react-router';
import { routes } from './app';
import { AppErrorBoundary } from '@appbase/ui-react/error-boundary.js';
import { installBusyButtons } from '@appbase/core/busy-buttons.js';
import { applyProductTheme } from './theme';
import { captureFatal, installGlobalDiagnostics } from './observability';
import './styles.css';

// The font stylesheet is added from here, not by an inline `onload` in index.html (the CSP allows no inline script; security audit B7).
const fonts = document.createElement('link');
fonts.rel = 'stylesheet';
fonts.href = 'https://fonts.googleapis.com/css2?family=Geologica:wght,CRSV,SHRP@300..900,0..1,0..100&family=Onest:wght@400..800&display=swap';
document.head.appendChild(fonts);

applyProductTheme();
// Every pressed button that waits for the server shows a spinner until the answer comes.
installBusyButtons();
installGlobalDiagnostics();

const router = createHashRouter(routes);
const queryClient = new QueryClient({defaultOptions:{queries:{staleTime:30_000,retry:1}}});

const root = document.getElementById('root');
if(!root) throw new Error('feture_root_missing');

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary locale="ru" onError={captureFatal}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>
);
