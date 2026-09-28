import type { QueryClient } from '@tanstack/react-query';
import { startAutoSync, type AutoSync } from '@appbase/core/document-sync.js';
import { taskDocs } from './repository';

let auto: AutoSync | null = null;

/** Started once by main.tsx: sync after changes, on reconnect and when the app is shown again;
 *  tasks changed on another device refresh the list. Tests render the app without it. */
export function startTaskSync(queryClient: QueryClient): void {
  if(auto) return;
  auto = startAutoSync(taskDocs());
  taskDocs().subscribe(change => {
    if(change.source === 'remote') void queryClient.invalidateQueries({queryKey: ['tasks']});
  });
  void auto.now();
}

/** After sign-in: local tasks are merged into the account right away. */
export function syncTasksNow(): void {
  void auto?.now();
}
