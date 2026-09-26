import type { AppFeatureFlags } from '../types/core.js';

/* Product capability switches from config/product.json.
   Core modules stay unconditional; composition code asks this object which
   platform integrations to wire so a product can switch a capability off
   without Core learning product names. */

export type CapabilityName = keyof AppFeatureFlags;

export const CAPABILITY_NAMES: readonly CapabilityName[] = Object.freeze([
  'profiles',
  'premium',
  'ai',
  'notifications',
  'biometrics',
  'sharing',
  'voice'
]);

export interface Capabilities {
  enabled(name: CapabilityName): boolean;
  /** Returns the value only when the capability is on, otherwise null. */
  when<T>(name: CapabilityName, value: T): T | null;
  flags(): AppFeatureFlags;
}

export function createCapabilities(input: unknown): Capabilities {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  // Unknown or missing switches are off: a product must opt in to every capability.
  const flags = Object.freeze(Object.fromEntries(
    CAPABILITY_NAMES.map(name => [name, source[name] === true])
  ) as unknown as AppFeatureFlags);

  return {
    enabled(name){ return flags[name] === true; },
    when(name, value){ return flags[name] === true ? value : null; },
    flags(){ return flags; }
  };
}
