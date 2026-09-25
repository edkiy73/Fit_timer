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

/**
 * Future ESM application entry point.
 *
 * Intentionally not wired into production HTML yet. It now owns one real
 * dependency edge: the generic Identity Core. More Core/product modules can
 * migrate here incrementally while the legacy concatenated runtime remains.
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
