namespace AppBaseSync {
  export type SyncScope = 'profile' | 'account';

  export interface DocumentRule {
    scope: SyncScope;
    key?: string;
    prefix?: string;
    allowDeleted?: boolean;
    free?: boolean;
  }

  export interface DocumentMatch extends DocumentRule {
    keyValue: string;
  }

  export interface DocumentRegistry {
    match(scope: SyncScope, key: string): DocumentMatch | null;
    accepts(scope: SyncScope, key: string): boolean;
    allowsDeleted(scope: SyncScope, key: string): boolean;
    isFree(scope: SyncScope, key: string): boolean;
  }

  function validRule(rule: DocumentRule): boolean {
    return !!rule && (rule.scope === 'profile' || rule.scope === 'account')
      && ((typeof rule.key === 'string' && !!rule.key)
        !== (typeof rule.prefix === 'string' && !!rule.prefix));
  }

  export function createRegistry(rules: readonly DocumentRule[]): DocumentRegistry {
    const clean = rules.map(rule => ({...rule})).filter(validRule);

    const match = (scope: SyncScope, key: string): DocumentMatch | null => {
      const value = String(key || '');
      const rule = clean.find(item => item.scope === scope
        && (item.key ? item.key === value : value.startsWith(item.prefix || '')));
      return rule ? {...rule, keyValue:value} : null;
    };

    return {
      match,
      accepts(scope, key){ return !!match(scope, key); },
      allowsDeleted(scope, key){ return !!match(scope, key)?.allowDeleted; },
      isFree(scope, key){ return !!match(scope, key)?.free; }
    };
  }
}
