/* POST /api/sync — FitTimer composition of the generic AppBase sync handler.

   Фото-прогресс сюда не попадает: клиент не создаёт документ `photos`, а сервер
   дополнительно принимает только известные ключи реестра FitTimer. */
require('../lib/product');
const { createSyncHandler } = require('../../../packages/core/server/sync-core');
const { ACCOUNT_PROFILE, registry, sanitizeProfile } = require('../lib/fit-sync-schema');

module.exports = createSyncHandler({registry, accountProfile: ACCOUNT_PROFILE, sanitizeProfile});
