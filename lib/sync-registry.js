'use strict';

function validRule(rule){
  return !!rule && (rule.scope === 'profile' || rule.scope === 'account')
    && ((typeof rule.key === 'string' && !!rule.key)
      !== (typeof rule.prefix === 'string' && !!rule.prefix));
}

function createSyncRegistry(rules){
  const clean = (Array.isArray(rules) ? rules : [])
    .map(rule => Object.assign({}, rule))
    .filter(validRule);

  const match = (scope, key) => {
    const value = String(key || '');
    const rule = clean.find(item => item.scope === scope
      && (item.key ? item.key === value : value.startsWith(item.prefix || '')));
    return rule ? Object.assign({keyValue:value}, rule) : null;
  };

  return {
    match,
    accepts(scope, key){ return !!match(scope, key); },
    allowsDeleted(scope, key){ const rule = match(scope, key); return !!(rule && rule.allowDeleted); },
    isFree(scope, key){ const rule = match(scope, key); return !!(rule && rule.free); }
  };
}

module.exports = { createSyncRegistry };
