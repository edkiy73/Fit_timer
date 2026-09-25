import type { RuntimeAppConfig } from './core';

declare global {
  interface Window {
    FIT_TIMER_CONFIG?: Readonly<RuntimeAppConfig>;
    storage?: {
      get(key: string): Promise<{ value: string } | null>;
      set(key: string, value: string): Promise<void>;
      delete(key: string): Promise<void>;
    };
  }
}

export {};
