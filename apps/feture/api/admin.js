require('../lib/product');
const { createAdminHandler } = require('../../../packages/core/server/admin-handler');
const { analyticsStats } = require('../lib/app-analytics');
const Supabase = require('../../../packages/core/server/supabase');
const {createDocumentsAdmin}=require('../lib/feture/documents-admin');

module.exports = createAdminHandler({analyticsStats,handlers:[createDocumentsAdmin(Supabase)]});
