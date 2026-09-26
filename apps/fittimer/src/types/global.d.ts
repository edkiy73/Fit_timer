import type { RuntimeAppConfig } from '@appbase/types/core';

declare global {
  interface Window {
    APP_CONFIG?: Readonly<RuntimeAppConfig>;
    storage?: {
      get(key: string): Promise<{ value: string } | null>;
      set(key: string, value: string): Promise<void>;
      delete(key: string): Promise<void>;
    };
  }
}

export {};
