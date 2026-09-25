import { createAccount, createProfileDraft } from './core/identity.js';

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
