/* Generated from src/app/sync-schema.ts. Do not edit directly. */
const __fitSyncSchemaCompat = (() => {
  const module = { exports: {} };
  const exports = module.exports;
  const require = (specifier) => {
    if(specifier === '../core/sync.js') return AppBaseSync;
    throw new Error('Unsupported compatibility import: ' + specifier);
  };
  "use strict";
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.FIT_SYNC_REGISTRY = exports.FIT_SYNC_ACCOUNT_DOC_KEYS = exports.FIT_SYNC_PROFILE_DOC_KEYS = void 0;
  const sync_js_1 = require("../core/sync.js");
  exports.FIT_SYNC_PROFILE_DOC_KEYS = ['stats'];
  exports.FIT_SYNC_ACCOUNT_DOC_KEYS = ['trainer', 'clients', 'notificationPrefs'];
  exports.FIT_SYNC_REGISTRY = (0, sync_js_1.createRegistry)([
      { scope: 'profile', key: 'stats' },
      { scope: 'profile', key: 'index' },
      { scope: 'profile', prefix: 'program:', allowDeleted: true },
      { scope: 'account', key: 'trainer' },
      { scope: 'account', key: 'clients' },
      { scope: 'account', key: 'notificationPrefs', free: true }
  ]);
  
  return module.exports;
})();
const FIT_SYNC_PROFILE_DOC_KEYS = __fitSyncSchemaCompat.FIT_SYNC_PROFILE_DOC_KEYS;
const FIT_SYNC_ACCOUNT_DOC_KEYS = __fitSyncSchemaCompat.FIT_SYNC_ACCOUNT_DOC_KEYS;
const FIT_SYNC_REGISTRY = __fitSyncSchemaCompat.FIT_SYNC_REGISTRY;
