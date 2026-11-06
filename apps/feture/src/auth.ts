import { apiUrl } from './api-url';
import { createAuthClient } from '@appbase/core/auth.js';
import { captchaFields } from './fe/turnstile';

export const authClient = createAuthClient({
  endpoint: apiUrl('/api/auth'),
  sessionKey: 'feture.auth.session',
  deviceKey: 'feture.auth.device',
  // The bot check before a sign-in code is asked for (Cloudflare Turnstile; nothing until its keys are set).
  beforeSend: captchaFields
});
