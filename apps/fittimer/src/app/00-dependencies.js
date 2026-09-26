/* Product runtime dependencies. The concatenated product runtime (app.js) is an
   ES module bundled by esbuild together with AppBase Core, so dependencies are
   plain imports — no global bridge. Namespaces avoid clashes with legacy names
   such as the product's own setShown() helper. */
import * as appbaseNotifications from '@appbase/core/notifications.js';
import * as appbaseUi from '@appbase/core/ui.js';
import * as fitSyncSchema from './src/app/sync-schema.js';
import * as fitInfrastructure from './src/app/infrastructure.js';
import * as fitIdentity from './src/app/identity.js';
import * as fitRuntimeCompat from './src/app/runtime-compat.js';
import FitAIProtocol from './lib/ai-protocol.js';

const appInfrastructure = {create: fitInfrastructure.createProductInfrastructure};
const appIdentity = {
  createAccount: fitIdentity.createFitTimerAccount,
  createProfile: fitIdentity.createFitTimerProfile
};
const appSync = {
  profileKeys: fitSyncSchema.FIT_SYNC_PROFILE_DOC_KEYS,
  accountKeys: fitSyncSchema.FIT_SYNC_ACCOUNT_DOC_KEYS,
  registry: fitSyncSchema.FIT_SYNC_REGISTRY
};
const appNotifications = {
  createPreferenceStore: appbaseNotifications.createPreferenceStore,
  limitCandidates: appbaseNotifications.limitCandidates
};
const appUi = {
  setShown: appbaseUi.setShown,
  setText: appbaseUi.setText,
  applyCssVars: appbaseUi.applyCssVars,
  openModal: appbaseUi.openModal,
  closeModal: appbaseUi.closeModal,
  closestModal: appbaseUi.closestModal,
  setBusy: appbaseUi.setBusy,
  bindActions: appbaseUi.bindActions
};
const appRuntimeCompat = fitRuntimeCompat.appRuntimeCompat;
