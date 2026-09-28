import { createBillingClient } from '@appbase/core/billing.js';
import { taskAuth } from './auth';

export const taskBilling = createBillingClient({auth: taskAuth, endpoint: '/api/billing'});
