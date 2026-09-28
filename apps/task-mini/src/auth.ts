import { createAuthClient } from '@appbase/core/auth.js';

export const taskAuth = createAuthClient({
  endpoint: '/api/auth',
  sessionKey: 'task-mini.auth.session',
  deviceKey: 'task-mini.auth.device'
});
