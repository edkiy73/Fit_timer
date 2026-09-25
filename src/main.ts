import { createPreferenceStore, limitCandidates } from './core/notifications.js';
import { setShown, setText, applyCssVars, openModal, closeModal, closestModal, setBusy, bindActions } from './core/ui.js';
import { FIT_SYNC_PROFILE_DOC_KEYS, FIT_SYNC_ACCOUNT_DOC_KEYS, FIT_SYNC_REGISTRY } from './app/sync-schema.js';
import { createProductInfrastructure } from './app/infrastructure.js';
import { createFitTimerAccount, createFitTimerProfile } from './app/identity.js';

/**
 * Production ESM composition entry point.
 *
 * Core now loads through this module graph. The legacy product source is still
 * concatenated into app.js temporarily, but app.js itself executes in ES-module
 * scope after the ESM dependencies are exposed through a narrow startup bridge.
 */
export const APPBASE_ESM_FOUNDATION = true;

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


type LegacyProductModules = {
  infrastructure: typeof productInfrastructure;
  identity: typeof productIdentity;
  sync: typeof productSyncSchema;
  notifications: typeof notificationsCore;
  ui: typeof uiCore;
};

type LegacyProductGlobal = typeof globalThis & {FitTimerModules?: LegacyProductModules};

function exposeLegacyProductModules(): void {
  const legacy = globalThis as LegacyProductGlobal;
  legacy.FitTimerModules = {
    infrastructure: productInfrastructure,
    identity: productIdentity,
    sync: productSyncSchema,
    notifications: notificationsCore,
    ui: uiCore
  };
}

function clearLegacyProductModules(): void {
  delete (globalThis as LegacyProductGlobal).FitTimerModules;
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
  return loadLegacyScript(
    'app.js',
    'data-legacy-product-runtime',
    'legacy_product_runtime_failed',
    true
  );
}

exposeLegacyProductModules();
try{
  await loadLegacyMobileRuntime();
  await loadLegacyProductRuntime();
  clearLegacyProductModules();
}catch(error){
  console.error('Failed to start product runtime', error);
  document.body.classList.remove('booting');
}
