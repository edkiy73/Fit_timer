import { createPreferenceStore, limitCandidates } from './core/notifications.js';
import { createCapabilities } from './core/capabilities.js';
import { setShown, setText, applyCssVars, openModal, closeModal, closestModal, setBusy, bindActions } from './core/ui.js';
import { FIT_SYNC_PROFILE_DOC_KEYS, FIT_SYNC_ACCOUNT_DOC_KEYS, FIT_SYNC_REGISTRY } from './app/sync-schema.js';
import { createProductInfrastructure } from './app/infrastructure.js';
import { createFitTimerAccount, createFitTimerProfile } from './app/identity.js';
import { externalStorage, runtimePlatform, setRuntimeBuild, getRuntimeBuild, runtimeFeatures } from './app/runtime-environment.js';
import { createProductBootstrap } from './app/bootstrap.js';

/**
 * Production ESM composition entry point.
 *
 * Core now loads through this module graph. The legacy product bundle still runs
 * temporarily, but only after the ESM Core exports are exposed through a narrow
 * compatibility surface.
 */
export const APPBASE_ESM_FOUNDATION = true;

export const capabilitiesCore = createCapabilities(runtimeFeatures());

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
  build: getRuntimeBuild,
  features: runtimeFeatures
};

export const productBootstrap = {
  create: createProductBootstrap
};


type LegacyProductModules = {
  capabilities: typeof capabilitiesCore;
  infrastructure: typeof productInfrastructure;
  identity: typeof productIdentity;
  sync: typeof productSyncSchema;
  notifications: typeof notificationsCore;
  ui: typeof uiCore;
};

function exposeLegacyProductModules(): void {
  const legacy = globalThis as typeof globalThis & {FitTimerModules?: LegacyProductModules};
  legacy.FitTimerModules = {
    capabilities: capabilitiesCore,
    infrastructure: productInfrastructure,
    identity: productIdentity,
    sync: productSyncSchema,
    notifications: notificationsCore,
    ui: uiCore
  };
}

function loadLegacyScript(
  src: string,
  marker: string,
  failureCode: string,
  module = false
): Promise<void> {
  return new Promise((resolve, reject) => {
    if(document.querySelector(`script[${marker}]`)){
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    if(module) script.type = 'module';
    script.setAttribute(marker, 'true');
    script.addEventListener('load', () => resolve(), {once:true});
    script.addEventListener('error', () => reject(new Error(failureCode)), {once:true});
    document.body.appendChild(script);
  });
}

export function loadLegacyMobileRuntime(): Promise<void> {
  return loadLegacyScript(
    'mobile.js',
    'data-legacy-mobile-runtime',
    'legacy_mobile_runtime_failed',
    true
  );
}

export function loadLegacyProductRuntime(): Promise<void> {
  return loadLegacyScript('app.js', 'data-legacy-product-runtime', 'legacy_product_runtime_failed');
}

exposeLegacyProductModules();
try{
  await loadLegacyMobileRuntime();
  await loadLegacyProductRuntime();
}catch(error){
  console.error('Failed to start product runtime', error);
  document.body.classList.remove('booting');
}
