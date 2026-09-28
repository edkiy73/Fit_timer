import { createAuthClient } from '@appbase/core/auth.js';

export const authClient = createAuthClient({
  endpoint: '/api/auth',
  sessionKey: '__APP_SLUG__.auth.session',
  deviceKey: '__APP_SLUG__.auth.device'
});
