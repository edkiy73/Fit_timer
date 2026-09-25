import { createAccount, createProfileDraft } from './core/identity.js';
import { createRegistry } from './core/sync.js';
import { createStorage, namespacedKey } from './core/storage.js';
import { createClient } from './core/observability.js';
import { createPreferenceStore, limitCandidates } from './core/notifications.js';

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
