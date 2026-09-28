import { createAdminClient } from '@appbase/core/admin.js';

export const adminClient = createAdminClient({
  endpoint:'/api/admin',
  healthEndpoint:'/api/health'
});
