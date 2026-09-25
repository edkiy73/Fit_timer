import { createAccount, createProfileDraft } from './core/identity.js';
import { createRegistry } from './core/sync.js';
import { createStorage, namespacedKey } from './core/storage.js';
import { createClient } from './core/observability.js';
import { createPreferenceStore, limitCandidates } from './core/notifications.js';
import { setShown, setText, applyCssVars, openModal, closeModal, closestModal, setBusy, bindActions } from './core/ui.js';
import { createTransport } from './core/native-notifications.js';
import { createBridge } from './core/mobile.js';
import { FIT_SYNC_PROFILE_DOC_KEYS, FIT_SYNC_ACCOUNT_DOC_KEYS, FIT_SYNC_REGISTRY } from './app/sync-schema.js';
import { createProductInfrastructure } from './app/infrastructure.js';
import { createFitTimerAccount, createFitTimerProfile } from './app/identity.js';
import { externalStorage, runtimePlatform, setRuntimeBuild, getRuntimeBuild } from './app/runtime-environment.js';
import { createProductBootstrap } from './app/bootstrap.js';

/**
 * Production ESM composition entry point.
 *
 * Core now loads through this module graph. The legacy product bundle still runs
 * temporarily, but only after the ESM Core exports are exposed through a narrow
 * compatibility surface.
 */
export const APPBASE_ESM_FOUNDATION = true;

export const identityCore = {
  createAccount,
  createProfileDraft
};

export const syncCore = {
  createRegistry
};

export const storageCore = {
  createStorage,
  namespacedKey
};

export const observabilityCore = {
  createClient
};

export const notificationsCore = {
  createPreferenceStore,
  limitCandidates
};

export const uiCore = {
  setShown,
  setText,
  applyCssVars,
  openModal,
  closeModal,
  closestModal,
  setBusy,
  bindActions
};

export const nativeNotificationsCore = {
  createTransport
};

export const mobileCore = {
  createBridge
};

export const productSyncSchema = {
  profileKeys: FIT_SYNC_PROFILE_DOC_KEYS,
  accountKeys: FIT_SYNC_ACCOUNT_DOC_KEYS,
  registry: FIT_SYNC_REGISTRY
};

export const productInfrastructure = {
  create: createProductInfrastructure
};

export const productIdentity = {
  createAccount: createFitTimerAccount,
  createProfile: createFitTimerProfile
};

export const runtimeEnvironment = {
  externalStorage,
  platform: runtimePlatform,
  setBuild: setRuntimeBuild,
  build: getRuntimeBuild
};

export const productBootstrap = {
  create: createProductBootstrap
};


type LegacyCoreGlobals = {
  AppBaseStorage: typeof storageCore;
  AppBaseIdentity: typeof identityCore;
  AppBaseSync: typeof syncCore;
  AppBaseObservability: typeof observabilityCore;
  AppBaseNotifications: typeof notificationsCore;
  AppBaseUI: typeof uiCore;
};

type LegacyProductModules = {
  infrastructure: typeof productInfrastructure;
  identity: typeof productIdentity;
  sync: typeof productSyncSchema;
};

function exposeLegacyCoreGlobals(): void {
  const legacy = globalThis as typeof globalThis & Partial<LegacyCoreGlobals>;
  legacy.AppBaseStorage = storageCore;
  legacy.AppBaseIdentity = identityCore;
  legacy.AppBaseSync = syncCore;
  legacy.AppBaseObservability = observabilityCore;
  legacy.AppBaseNotifications = notificationsCore;
  legacy.AppBaseUI = uiCore;
  (legacy as typeof legacy & {FitTimerModules?: LegacyProductModules}).FitTimerModules = {
    infrastructure: productInfrastructure,
    identity: productIdentity,
    sync: productSyncSchema
  };
}

export function loadLegacyProductRuntime(): Promise<void> {
  return new Promise((resolve, reject) => {
    if(document.querySelector('script[data-legacy-product-runtime]')){
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'app.js';
    script.async = false;
    script.dataset.legacyProductRuntime = 'true';
    script.addEventListener('load', () => resolve(), {once:true});
    script.addEventListener('error', () => reject(new Error('legacy_product_runtime_failed')), {once:true});
    document.body.appendChild(script);
  });
}

exposeLegacyCoreGlobals();
try{
  await loadLegacyProductRuntime();
}catch(error){
  console.error('Failed to start product runtime', error);
  document.body.classList.remove('booting');
}
