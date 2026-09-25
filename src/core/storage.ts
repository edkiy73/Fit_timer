namespace AppBaseStorage {
  export interface ExternalStorage {
    get(key: string): Promise<{ value: string } | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  }

  export interface StorageOptions {
    dbName: string;
    storeName: string;
    mirrorKeys?: readonly string[];
    externalStorage?: () => ExternalStorage | null | undefined;
    onWriteFailure?: () => void;
  }

  export interface StorageCore {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<boolean>;
    delete(key: string): Promise<void>;
    clearAll(): Promise<void>;
    namespacedKey(key: string, namespace: string): string;
    __testReadIndexedDb(key: string): Promise<unknown>;
    __testDisableIndexedDb(): void;
  }

  type StoreRequest<T> = (store: IDBObjectStore) => IDBRequest<T>;

  export function namespacedKey(key: string, namespace: string): string {
    return `${key}_${namespace}`;
  }

  export function createStorage(options: StorageOptions): StorageCore {
    const mirrorKeys = new Set(options.mirrorKeys || []);
    let dbPromise: Promise<IDBDatabase | null> | null = null;
    let fullWarned = false;

    const external = (): ExternalStorage | null => {
      try { return options.externalStorage?.() || null; }
      catch (_) { return null; }
    };

    const openDb = (): Promise<IDBDatabase | null> => {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise<IDBDatabase | null>((resolve) => {
        try {
          if (!window.indexedDB) { resolve(null); return; }
          const request = indexedDB.open(options.dbName, 1);
          request.onupgradeneeded = () => {
            try { request.result.createObjectStore(options.storeName); } catch (_) {}
          };
          request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => {
              try { db.close(); } catch (_) {}
              dbPromise = null;
            };
            resolve(db);
          };
          request.onerror = () => resolve(null);
          request.onblocked = () => resolve(null);
        } catch (_) {
          resolve(null);
        }
      });
      return dbPromise;
    };

    const requestStore = <T>(mode: IDBTransactionMode, operation: StoreRequest<T>): Promise<T | undefined> =>
      openDb().then((db) => new Promise<T | undefined>((resolve, reject) => {
        if (!db) { reject(new Error('no_idb')); return; }
        try {
          const transaction = db.transaction(options.storeName, mode);
          const request = operation(transaction.objectStore(options.storeName));
          transaction.oncomplete = () => resolve(request ? request.result : undefined);
          transaction.onerror = () => reject(transaction.error || new Error('idb_tx'));
          transaction.onabort = () => reject(transaction.error || new Error('idb_abort'));
        } catch (error) {
          reject(error);
        }
      }));

    const notifyWriteFailure = (): void => {
      if (fullWarned) return;
      fullWarned = true;
      try { options.onWriteFailure?.(); } catch (_) {}
    };

    try {
      if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    } catch (_) {}

    return {
      async get(key: string): Promise<string | null> {
        const ext = external();
        if (ext) {
          try {
            const result = await ext.get(key);
            return result ? result.value : null;
          } catch (_) {
            return null;
          }
        }

        let indexedDbAvailable = true;
        try {
          const value = await requestStore<unknown>('readonly', (store) => store.get(key));
          if (value !== undefined && value !== null) return String(value);
        } catch (_) {
          indexedDbAvailable = false;
        }

        let localValue: string | null = null;
        try { localValue = localStorage.getItem(key); } catch (_) { localValue = null; }

        if (localValue !== null && indexedDbAvailable) {
          try {
            await requestStore<IDBValidKey>('readwrite', (store) => store.put(localValue, key));
            if (!mirrorKeys.has(key)) {
              try { localStorage.removeItem(key); } catch (_) {}
            }
          } catch (_) {}
        }
        return localValue;
      },

      async set(key: string, value: string): Promise<boolean> {
        const ext = external();
        if (ext) {
          try { await ext.set(key, value); return true; } catch (_) {}
        }

        try {
          await requestStore<IDBValidKey>('readwrite', (store) => store.put(value, key));
          if (mirrorKeys.has(key)) {
            try { localStorage.setItem(key, value); } catch (_) {}
          } else {
            try { localStorage.removeItem(key); } catch (_) {}
          }
          return true;
        } catch (_) {}

        try {
          localStorage.setItem(key, value);
          return true;
        } catch (_) {
          notifyWriteFailure();
          return false;
        }
      },

      async delete(key: string): Promise<void> {
        const ext = external();
        if (ext) {
          try { await ext.delete(key); return; } catch (_) {}
        }
        try { await requestStore<undefined>('readwrite', (store) => store.delete(key)); } catch (_) {}
        try { localStorage.removeItem(key); } catch (_) {}
      },

      async clearAll(): Promise<void> {
        try { await requestStore<undefined>('readwrite', (store) => store.clear()); } catch (_) {}
        try { localStorage.clear(); } catch (_) {}
      },

      namespacedKey,

      async __testReadIndexedDb(key: string): Promise<unknown> {
        return requestStore<unknown>('readonly', (store) => store.get(key));
      },

      __testDisableIndexedDb(): void {
        dbPromise = Promise.resolve(null);
      }
    };
  }
}
