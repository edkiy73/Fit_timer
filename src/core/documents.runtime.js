"use strict";
var AppBaseDocuments;
(function (AppBaseDocuments) {
    function validRule(rule) {
        if (!rule || !rule.id || !rule.scope)
            return false;
        const exact = typeof rule.exact === 'string' && rule.exact.length > 0;
        const prefix = typeof rule.prefix === 'string' && rule.prefix.length > 0;
        return exact !== prefix;
    }
    function createRegistry(rules) {
        const safe = rules.map(rule => ({ ...rule }));
        if (!safe.every(validRule))
            throw new Error('invalid_document_rule');
        const ids = new Set();
        for (const rule of safe) {
            if (ids.has(rule.id))
                throw new Error('duplicate_document_rule');
            ids.add(rule.id);
        }
        const resolve = (scope, key) => {
            const raw = String(key || '');
            for (const rule of safe) {
                if (rule.scope !== scope)
                    continue;
                if (rule.exact && raw === rule.exact)
                    return rule;
                if (rule.prefix && raw.startsWith(rule.prefix))
                    return rule;
            }
            return null;
        };
        return {
            resolve,
            accepts(scope, key) {
                return !!resolve(scope, key);
            },
            exactKeys(scope) {
                return safe
                    .filter(rule => rule.scope === scope && !!rule.exact)
                    .map(rule => rule.exact);
            }
        };
    }
    AppBaseDocuments.createRegistry = createRegistry;
})(AppBaseDocuments || (AppBaseDocuments = {}));
