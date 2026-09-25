import { createProductInfrastructure } from './infrastructure.js';
import { createFitTimerAccount, createFitTimerProfile } from './identity.js';
import {
  FIT_SYNC_PROFILE_DOC_KEYS,
  FIT_SYNC_ACCOUNT_DOC_KEYS,
  FIT_SYNC_REGISTRY
} from './sync-schema.js';
import {
  externalStorage,
  runtimePlatform,
  getRuntimeBuild
} from './runtime-environment.js';

export interface ProductBootstrapOptions {
  locale(): string;
  premium(): boolean;
  newId(): string;
  onStorageWriteFailure?: () => void;
  post(body: unknown): Promise<boolean>;
}

export function createProductBootstrap(options: ProductBootstrapOptions) {
  const infrastructure = createProductInfrastructure({
    externalStorage,
    ...(options.onStorageWriteFailure
      ? {onStorageWriteFailure: options.onStorageWriteFailure}
      : {}),
    platform: runtimePlatform,
    locale: options.locale,
    build: getRuntimeBuild,
    premium: options.premium,
    newId: options.newId,
    post: options.post
  });

  return {
    infrastructure,
    identity: {
      createAccount: createFitTimerAccount,
      createProfile: createFitTimerProfile
    },
    sync: {
      profileKeys: FIT_SYNC_PROFILE_DOC_KEYS,
      accountKeys: FIT_SYNC_ACCOUNT_DOC_KEYS,
      registry: FIT_SYNC_REGISTRY
    }
  };
}
