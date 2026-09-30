import { createAdminClient } from '@appbase/core/admin.js';
import { apiUrl } from './api-url';

export const adminClient = createAdminClient({
  endpoint:apiUrl('/api/admin'),
  healthEndpoint:apiUrl('/api/health')
});
