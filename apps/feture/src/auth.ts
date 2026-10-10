import { apiUrl } from './api-url';
import { createAuthClient } from '@appbase/core/auth.js';

export const authClient = createAuthClient({
  endpoint: apiUrl('/api/auth'),
  sessionKey: 'feture.auth.session',
  deviceKey: 'feture.auth.device'
});
