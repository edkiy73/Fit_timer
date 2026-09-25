"use strict";
var AppBaseStorage;
(function (AppBaseStorage) {
    function namespacedKey(key, namespace) {
        return `${key}_${namespace}`;
    }
    AppBaseStorage.namespacedKey = namespacedKey;
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
    AppBaseStorage.createStorage = createStorage;
})(AppBaseStorage || (AppBaseStorage = {}));
"use strict";
var AppBaseIdentity;
(function (AppBaseIdentity) {
    function createAccount(now = new Date()) {
        return {
            email: '',
            handle: '',
            locale: '',
            createdAt: now.toISOString(),
            linkedAt: null,
            sub: null,
            biometry: null,
            deletedProfiles: []
        };
    }
    AppBaseIdentity.createAccount = createAccount;
    function createProfileDraft(name) {
        return {
            id: null,
            name: String(name || ''),
            photo: null,
            theme: 'system',
            locale: 'system'
        };
    }
    AppBaseIdentity.createProfileDraft = createProfileDraft;
})(AppBaseIdentity || (AppBaseIdentity = {}));
"use strict";
var AppBaseSync;
(function (AppBaseSync) {
    function validRule(rule) {
        return !!rule && (rule.scope === 'profile' || rule.scope === 'account')
            && ((typeof rule.key === 'string' && !!rule.key)
                !== (typeof rule.prefix === 'string' && !!rule.prefix));
    }
    function createRegistry(rules) {
        const clean = rules.map(rule => ({ ...rule })).filter(validRule);
        const match = (scope, key) => {
            const value = String(key || '');
            const rule = clean.find(item => item.scope === scope
                && (item.key ? item.key === value : value.startsWith(item.prefix || '')));
            return rule ? { ...rule, keyValue: value } : null;
        };
        return {
            match,
            accepts(scope, key) { return !!match(scope, key); },
            allowsDeleted(scope, key) { return !!match(scope, key)?.allowDeleted; },
            isFree(scope, key) { return !!match(scope, key)?.free; }
        };
    }
    AppBaseSync.createRegistry = createRegistry;
})(AppBaseSync || (AppBaseSync = {}));
"use strict";
var AppBaseObservability;
(function (AppBaseObservability) {
    function createClient(options) {
        let reporting = false;
        const diagnosticPayload = (kind, error, fallbackMessage) => {
            const e = error && typeof error === 'object'
                ? error
                : null;
            const ctx = options.context();
            return {
                action: 'client_error',
                kind: kind === 'rejection' ? 'rejection' : 'error',
                name: String((e && e.name) || 'Error').slice(0, 80),
                message: String((e && e.message) || fallbackMessage || 'unknown').slice(0, 700),
                stack: String((e && e.stack) || '').slice(0, 4000),
                build: String(ctx.build || '').slice(0, 80),
                platform: ctx.platform,
                locale: String(ctx.locale || '').slice(0, 20)
            };
        };
        return {
            async track(event) {
                const name = String(event || '').trim();
                if (!name)
                    return false;
                try {
                    const ctx = options.context();
                    return await options.post({
                        action: 'analytics',
                        event: name,
                        deviceId: await options.deviceId(),
                        platform: ctx.platform,
                        locale: String(ctx.locale || '').slice(0, 20),
                        premium: !!ctx.premium
                    });
                }
                catch (_) {
                    return false;
                }
            },
            diagnosticPayload,
            async capture(kind, error, fallbackMessage) {
                if (reporting)
                    return false;
                reporting = true;
                try {
                    return await options.post(diagnosticPayload(kind, error, fallbackMessage));
                }
                catch (_) {
                    return false;
                }
                finally {
                    reporting = false;
                }
            }
        };
    }
    AppBaseObservability.createClient = createClient;
})(AppBaseObservability || (AppBaseObservability = {}));
"use strict";
var AppBaseNotifications;
(function (AppBaseNotifications) {
    function createPreferenceStore(options) {
        const defaults = Object.freeze({ ...options.defaults });
        return {
            get() {
                try {
                    const raw = JSON.parse(options.storage.getItem(options.key) || '{}');
                    return { ...defaults, ...(raw && typeof raw === 'object' ? raw : {}) };
                }
                catch (_) {
                    return { ...defaults };
                }
            },
            set(next) {
                options.storage.setItem(options.key, JSON.stringify({ ...defaults, ...(next || {}) }));
            }
        };
    }
    AppBaseNotifications.createPreferenceStore = createPreferenceStore;
    function limitCandidates(items, options) {
        const out = [];
        const engagementDay = new Set();
        const engagementWeek = new Map();
        const passiveDayCount = new Map();
        const reserved = options.reservedDayKeys || new Set();
        const sorted = [...items].sort((a, b) => (+new Date(a.at) - +new Date(b.at)) || ((b.priority || 0) - (a.priority || 0)));
        for (const item of sorted) {
            const at = new Date(item.at);
            if (Number.isNaN(at.getTime()))
                continue;
            const day = options.dayKey(at);
            if (item.engagement) {
                if (reserved.has(day) || options.blocksEngagementOn?.(at, item))
                    continue;
                if (engagementDay.has(day))
                    continue;
                const monday = new Date(at);
                monday.setHours(0, 0, 0, 0);
                monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
                const week = options.dayKey(monday);
                const count = engagementWeek.get(week) || 0;
                if (count >= options.engagementWeeklyLimit)
                    continue;
                engagementDay.add(day);
                engagementWeek.set(week, count + 1);
            }
            if (!item.budgetExempt) {
                const count = passiveDayCount.get(day) || 0;
                if (count >= options.passiveDailyLimit)
                    continue;
                passiveDayCount.set(day, count + 1);
            }
            out.push(item);
            if (out.length >= options.maxTotal)
                break;
        }
        return out;
    }
    AppBaseNotifications.limitCandidates = limitCandidates;
})(AppBaseNotifications || (AppBaseNotifications = {}));
var AppBaseUI;
(function (AppBaseUI) {
    function setShown(element, shown, hiddenClass = 'hidden') {
        if (!element)
            return;
        element.classList.toggle(hiddenClass, !shown);
    }
    AppBaseUI.setShown = setShown;
    function setText(element, value) {
        if (!element)
            return;
        element.textContent = String(value == null ? '' : value);
    }
    AppBaseUI.setText = setText;
    function applyCssVars(element, vars) {
        if (!element)
            return;
        Object.entries(vars).forEach(([name, value]) => {
            const key = name.startsWith('--') ? name : '--' + name;
            if (value == null || value === '')
                element.style.removeProperty(key);
            else
                element.style.setProperty(key, String(value));
        });
    }
    AppBaseUI.applyCssVars = applyCssVars;
    function openModal(modal, openClass = 'open') {
        if (!modal)
            return false;
        modal.classList.add(openClass);
        return true;
    }
    AppBaseUI.openModal = openModal;
    function closeModal(modal, openClass = 'open') {
        if (!modal)
            return false;
        modal.classList.remove(openClass);
        return true;
    }
    AppBaseUI.closeModal = closeModal;
    function closestModal(element, selector = '.modal') {
        if (!element)
            return null;
        const modal = element.closest(selector);
        return modal instanceof HTMLElement ? modal : null;
    }
    AppBaseUI.closestModal = closestModal;
    function setBusy(button, busy, options = {}) {
        if (!button)
            return;
        const idleText = options.idleText ?? button.dataset.idleText ?? button.textContent ?? '';
        if (!button.dataset.idleText)
            button.dataset.idleText = idleText;
        button.disabled = options.disabled ?? busy;
        if (options.ariaBusy !== false)
            button.setAttribute('aria-busy', busy ? 'true' : 'false');
        if (busy && options.busyText != null)
            button.textContent = options.busyText;
        if (!busy)
            button.textContent = options.idleText ?? button.dataset.idleText ?? idleText;
    }
    AppBaseUI.setBusy = setBusy;
    function bindActions(root, actions, attribute = 'data-act') {
        const selector = '[' + attribute + ']';
        const listener = (event) => {
            const target = event.target;
            if (!(target instanceof Element))
                return;
            const element = target.closest(selector);
            if (!(element instanceof HTMLElement))
                return;
            const action = element.getAttribute(attribute) || '';
            const handler = actions[action];
            if (handler)
                handler(element, event);
        };
        root.addEventListener('click', listener);
        return () => root.removeEventListener('click', listener);
    }
    AppBaseUI.bindActions = bindActions;
})(AppBaseUI || (AppBaseUI = {}));
