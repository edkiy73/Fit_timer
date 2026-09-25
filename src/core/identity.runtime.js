"use strict";
var AppBaseIdentity = (() => {
    const module = { exports: {} };
    const exports = module.exports;
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.createAccount = createAccount;
    exports.createProfileDraft = createProfileDraft;
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
    function createProfileDraft(name) {
        return {
            id: null,
            name: String(name || ''),
            photo: null,
            theme: 'system',
            locale: 'system'
        };
    }
    
    return module.exports;
})();
