import { createStorage, type ExternalStorage, type StorageCore } from '../core/storage.js';
import {
  createClient,
  type ObservabilityClient,
  type Platform
} from '../core/observability.js';

export interface ProductInfrastructureOptions {
  externalStorage?: () => ExternalStorage | null | undefined;
  onStorageWriteFailure?: () => void;
  platform(): Platform;
  locale(): string;
  build(): string;
  premium(): boolean;
  newId(): string;
  post(body: unknown): Promise<boolean>;
}

export interface ProductInfrastructure {
  storage: StorageCore;
  observability: ObservabilityClient;
  deviceId(): Promise<string>;
}

export function createProductInfrastructure(
  options: ProductInfrastructureOptions
): ProductInfrastructure {
  const storageOptions = {
    dbName: 'fittimer',
    storeName: 'kv',
    mirrorKeys: ['account']
  } satisfies import('../core/storage.js').StorageOptions;

  const storage = createStorage({
    ...storageOptions,
    ...(options.externalStorage ? {externalStorage: options.externalStorage} : {}),
    ...(options.onStorageWriteFailure ? {onWriteFailure: options.onStorageWriteFailure} : {})
  });

  const deviceId = async (): Promise<string> => {
    let id = await storage.get('deviceId');
    if(!id){
      id = options.newId();
      await storage.set('deviceId', id);
    }
    return id;
  };

  const observability = createClient({
    post: body => options.post(body),
    deviceId,
    context: () => ({
      platform: options.platform(),
      locale: options.locale(),
      build: options.build(),
      premium: options.premium()
    })
  });

  return {
    storage,
    observability,
    deviceId
  };
}
