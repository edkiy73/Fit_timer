import { createAdminClient } from '@appbase/core/admin.js';
export const taskAdmin = createAdminClient({endpoint:'/api/admin', healthEndpoint:'/api/health'});
