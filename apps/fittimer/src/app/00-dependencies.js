/* Product-runtime adapters over AppBase Core and the typed product modules. Every
   src/app module imports what it needs directly (i18n, options, other parts); only
   these small adapter objects live here. Namespaces avoid clashes with legacy names
   such as the product's own setShown() helper. */
import * as appbaseNotifications from '@appbase/core/notifications.js';
import * as appbaseUi from '@appbase/core/ui.js';
import * as fitSyncSchema from './sync-schema.js';
import * as fitInfrastructure from './infrastructure.js';
import * as fitIdentity from './identity.js';
import * as fitRuntimeCompat from './runtime-compat.js';

export const appInfrastructure = {create: fitInfrastructure.createProductInfrastructure};
export const appIdentity = {
  createAccount: fitIdentity.createFitTimerAccount,
  createProfile: fitIdentity.createFitTimerProfile
};
export const appSync = {
  profileKeys: fitSyncSchema.FIT_SYNC_PROFILE_DOC_KEYS,
  accountKeys: fitSyncSchema.FIT_SYNC_ACCOUNT_DOC_KEYS,
  registry: fitSyncSchema.FIT_SYNC_REGISTRY
};
export const appNotifications = {
  createPreferenceStore: appbaseNotifications.createPreferenceStore,
  limitCandidates: appbaseNotifications.limitCandidates
};
export const appUi = {
  setShown: appbaseUi.setShown,
  setText: appbaseUi.setText,
  applyCssVars: appbaseUi.applyCssVars,
  openModal: appbaseUi.openModal,
  closeModal: appbaseUi.closeModal,
  closestModal: appbaseUi.closestModal,
  setBusy: appbaseUi.setBusy,
  bindActions: appbaseUi.bindActions
};
export const appRuntimeCompat = fitRuntimeCompat.appRuntimeCompat;
