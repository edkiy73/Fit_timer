require('../lib/product');
const { createAdminHandler } = require('../../../packages/core/server/admin-handler');
const { analyticsStats } = require('../lib/app-analytics');
const Supabase = require('../../../packages/core/server/supabase');
const {createDocumentsAdmin}=require('../lib/feture/documents-admin');
const {createModerationAdmin}=require('../lib/feture/moderation-admin');
const {createTestsAdmin}=require('../lib/feture/questionnaires-admin');
const {createCatalogAdmin}=require('../lib/feture/catalog-admin');
const {store}=require('../../../packages/core/server/store');
const {createQaAdultAdmin}=require('../lib/feture/qa-adult');

module.exports = createAdminHandler({analyticsStats,handlers:[createCatalogAdmin(Supabase),createTestsAdmin(Supabase),createDocumentsAdmin(Supabase),createModerationAdmin(Supabase,store),createQaAdultAdmin(Supabase,store)]});
