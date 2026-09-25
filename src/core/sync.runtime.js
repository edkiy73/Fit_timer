"use strict";
var AppBaseSync = (() => {
    const module = { exports: {} };
    const exports = module.exports;
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.createRegistry = createRegistry;
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
    
    return module.exports;
})();
