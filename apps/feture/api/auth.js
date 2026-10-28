require('../lib/product');
const { createAuthHandler } = require('../../../packages/core/server/auth-core');
const analytics = require('../lib/app-analytics');
const {safeFetureDiagnostic}=require('../lib/feture/diagnostic-policy');
module.exports = createAuthHandler({analytics,sanitizeClientDiagnostic:safeFetureDiagnostic,emailChange:true});
