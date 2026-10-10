require('../lib/product');
const { createAdminHandler } = require('../../../packages/core/server/admin-handler');
const { analyticsStats } = require('../lib/app-analytics');
const Supabase = require('../../../packages/core/server/supabase');
const {createDocumentsAdmin}=require('../lib/feture/documents-admin');
const {createModerationAdmin}=require('../lib/feture/moderation-admin');
const {store}=require('../../../packages/core/server/store');

module.exports = createAdminHandler({analyticsStats,handlers:[createDocumentsAdmin(Supabase),createModerationAdmin(Supabase,store)]});
