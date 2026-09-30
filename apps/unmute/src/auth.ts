import { createAuthClient } from '@appbase/core/auth.js';
import { apiUrl } from './api-url';

export const authClient = createAuthClient({
  endpoint: apiUrl('/api/auth'),
  sessionKey: 'unmute.auth.session',
  deviceKey: 'unmute.auth.device'
});
