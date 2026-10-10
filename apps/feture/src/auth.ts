import { createAuthClient } from '@appbase/core/auth.js';

export const authClient = createAuthClient({
  endpoint: '/api/auth',
  sessionKey: 'feture.auth.session',
  deviceKey: 'feture.auth.device'
});
