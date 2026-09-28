import { createAuthClient } from '@appbase/core/auth.js';

export const authClient = createAuthClient({
  endpoint: '/api/auth',
  sessionKey: 'unmute.auth.session',
  deviceKey: 'unmute.auth.device'
});
