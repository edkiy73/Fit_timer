"use strict";
var AppBaseStorage = (() => {
    const module = { exports: {} };
    const exports = module.exports;
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.namespacedKey = namespacedKey;
    exports.createStorage = createStorage;
    function namespacedKey(key, namespace) {
        return `${key}_${namespace}`;
    }
    function createStorage(options) {
        const mirrorKeys = new Set(options.mirrorKeys || []);
        let dbPromise = null;
        let fullWarned = false;
        const external = () => {
            try {
                return options.externalStorage?.() || null;
            }
            catch (_) {
                return null;
            }
        };
        const openDb = () => {
            if (dbPromise)
                return dbPromise;
            dbPromise = new Promise((resolve) => {
                try {
                    if (!window.indexedDB) {
                        resolve(null);
                        return;
                    }
                    const request = indexedDB.open(options.dbName, 1);
                    request.onupgradeneeded = () => {
                        try {
                            request.result.createObjectStore(options.storeName);
                        }
                        catch (_) { }
                    };
                    request.onsuccess = () => {
                        const db = request.result;
                        db.onversionchange = () => {
                            try {
                                db.close();
                            }
                            catch (_) { }
                            dbPromise = null;
                        };
                        resolve(db);
                    };
                    request.onerror = () => resolve(null);
                    request.onblocked = () => resolve(null);
                }
                catch (_) {
                    resolve(null);
                }
            });
            return dbPromise;
        };
        const requestStore = (mode, operation) => openDb().then((db) => new Promise((resolve, reject) => {
            if (!db) {
                reject(new Error('no_idb'));
                return;
            }
            try {
                const transaction = db.transaction(options.storeName, mode);
                const request = operation(transaction.objectStore(options.storeName));
                transaction.oncomplete = () => resolve(request ? request.result : undefined);
                transaction.onerror = () => reject(transaction.error || new Error('idb_tx'));
                transaction.onabort = () => reject(transaction.error || new Error('idb_abort'));
            }
            catch (error) {
                reject(error);
            }
        }));
        const notifyWriteFailure = () => {
            if (fullWarned)
                return;
            fullWarned = true;
            try {
                options.onWriteFailure?.();
            }
            catch (_) { }
        };
        try {
            if (navigator.storage?.persist)
                navigator.storage.persist().catch(() => { });
        }
        catch (_) { }
        return {
            async get(key) {
                const ext = external();
                if (ext) {
                    try {
                        const result = await ext.get(key);
                        return result ? result.value : null;
                    }
                    catch (_) {
                        return null;
                    }
                }
                let indexedDbAvailable = true;
                try {
                    const value = await requestStore('readonly', (store) => store.get(key));
                    if (value !== undefined && value !== null)
                        return String(value);
                }
                catch (_) {
                    indexedDbAvailable = false;
                }
                let localValue = null;
                try {
                    localValue = localStorage.getItem(key);
                }
                catch (_) {
                    localValue = null;
                }
                if (localValue !== null && indexedDbAvailable) {
                    try {
                        await requestStore('readwrite', (store) => store.put(localValue, key));
                        if (!mirrorKeys.has(key)) {
                            try {
                                localStorage.removeItem(key);
                            }
                            catch (_) { }
                        }
                    }
                    catch (_) { }
                }
                return localValue;
            },
            async set(key, value) {
                const ext = external();
                if (ext) {
                    try {
                        await ext.set(key, value);
                        return true;
                    }
                    catch (_) { }
                }
                try {
                    await requestStore('readwrite', (store) => store.put(value, key));
                    if (mirrorKeys.has(key)) {
                        try {
                            localStorage.setItem(key, value);
                        }
                        catch (_) { }
                    }
                    else {
                        try {
                            localStorage.removeItem(key);
                        }
                        catch (_) { }
                    }
                    return true;
                }
                catch (_) { }
                try {
                    localStorage.setItem(key, value);
                    return true;
                }
                catch (_) {
                    notifyWriteFailure();
                    return false;
                }
            },
            async delete(key) {
                const ext = external();
                if (ext) {
                    try {
                        await ext.delete(key);
                        return;
                    }
                    catch (_) { }
                }
                try {
                    await requestStore('readwrite', (store) => store.delete(key));
                }
                catch (_) { }
                try {
                    localStorage.removeItem(key);
                }
                catch (_) { }
            },
            async clearAll() {
                try {
                    await requestStore('readwrite', (store) => store.clear());
                }
                catch (_) { }
                try {
                    localStorage.clear();
                }
                catch (_) { }
            },
            namespacedKey,
            async __testReadIndexedDb(key) {
                return requestStore('readonly', (store) => store.get(key));
            },
            __testDisableIndexedDb() {
                dbPromise = Promise.resolve(null);
            }
        };
    }
    
    return module.exports;
})();
