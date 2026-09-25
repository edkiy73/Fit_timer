import type { ExternalStorage } from '../core/storage.js';
import type { Platform } from '../core/observability.js';
import type { AppFeatureFlags, RuntimeAppConfig } from '../types/core.js';

interface LegacyRuntimeWindow extends Window {
  APP_CONFIG?: Partial<RuntimeAppConfig>;
  storage?: ExternalStorage;
  FitNative?: unknown;
  Capacitor?: {
    getPlatform?: () => string;
  };
}

let runtimeBuild = '';

function runtimeWindow(): LegacyRuntimeWindow {
  return window as LegacyRuntimeWindow;
}

export function externalStorage(): ExternalStorage | null {
  try{
    const candidate = runtimeWindow().storage;
    if(!candidate) return null;
    if(typeof candidate.get !== 'function') return null;
    if(typeof candidate.set !== 'function') return null;
    if(typeof candidate.delete !== 'function') return null;
    return candidate;
  }catch(_){
    return null;
  }
}

export function runtimePlatform(): Platform {
  try{
    const candidate = runtimeWindow().Capacitor;
    if(candidate && typeof candidate.getPlatform === 'function'){
      const platform = candidate.getPlatform();
      if(platform === 'android' || platform === 'ios') return platform;
    }
  }catch(_){}
  return 'web';
}

export function setRuntimeBuild(value: unknown): void {
  runtimeBuild = String(value || '');
}

export function getRuntimeBuild(): string {
  return runtimeBuild;
}


const DISABLED_FEATURES: Readonly<AppFeatureFlags> = Object.freeze({
  profiles:false,
  premium:false,
  ai:false,
  notifications:false,
  biometrics:false,
  sharing:false
});

export function runtimeFeatures(): Readonly<AppFeatureFlags> {
  const source = runtimeWindow().APP_CONFIG?.features;
  if(!source) return DISABLED_FEATURES;
  return Object.freeze({
    profiles:source.profiles === true,
    premium:source.premium === true,
    ai:source.ai === true,
    notifications:source.notifications === true,
    biometrics:source.biometrics === true,
    sharing:source.sharing === true
  });
}
