'use strict';

const { createSyncRegistry } = require('./sync-registry');

const ACCOUNT_PROFILE = '__account__';

const rules = [
  {scope:'profile', key:'stats'},
  {scope:'profile', key:'index'},
  {scope:'profile', prefix:'program:', allowDeleted:true},
  // Compatibility for clients that still know the old hidden weight-correction doc.
  {scope:'profile', key:'progWeights', legacy:true},
  {scope:'account', key:'trainer'},
  {scope:'account', key:'clients'},
  // Marketing notification opt-out must work even without Premium.
  {scope:'account', key:'notificationPrefs', free:true}
];

module.exports = {
  ACCOUNT_PROFILE,
  PROFILE_DOC_KEYS: ['stats'],
  ACCOUNT_DOC_KEYS: ['trainer', 'clients', 'notificationPrefs'],
  registry: createSyncRegistry(rules)
};
