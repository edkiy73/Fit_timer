import { apiUrl } from './api-url';
import { createAdminClient } from '@appbase/core/admin.js';

export const adminClient = createAdminClient({
  endpoint:apiUrl('/api/admin'),
  healthEndpoint:apiUrl('/api/health')
});
