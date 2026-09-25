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
