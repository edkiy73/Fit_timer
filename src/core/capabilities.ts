import type { AppFeatureFlags } from '../types/core.js';

export type AppCapability = keyof AppFeatureFlags;

export interface AppCapabilities {
  isEnabled(name: AppCapability): boolean;
  snapshot(): Readonly<AppFeatureFlags>;
}

const CAPABILITY_KEYS: readonly AppCapability[] = [
  'profiles',
  'premium',
  'ai',
  'notifications',
  'biometrics',
  'sharing'
];

export function createCapabilities(
  flags: Partial<AppFeatureFlags> | null | undefined
): AppCapabilities {
  const snapshot = Object.freeze(
    Object.fromEntries(
      CAPABILITY_KEYS.map(name => [name, flags?.[name] === true])
    )
  ) as Readonly<AppFeatureFlags>;

  return {
    isEnabled(name){
      return snapshot[name] === true;
    },
    snapshot(){
      return snapshot;
    }
  };
}
