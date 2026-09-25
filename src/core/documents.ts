namespace AppBaseDocuments {
  export type DocumentScope = 'profile' | 'account';

  export interface DocumentRule {
    id: string;
    scope: DocumentScope;
    exact?: string;
    prefix?: string;
  }

  export interface DocumentRegistry {
    resolve(scope: DocumentScope, key: string): DocumentRule | null;
    accepts(scope: DocumentScope, key: string): boolean;
    exactKeys(scope: DocumentScope): string[];
  }

  function validRule(rule: DocumentRule): boolean {
    if (!rule || !rule.id || !rule.scope) return false;
    const exact = typeof rule.exact === 'string' && rule.exact.length > 0;
    const prefix = typeof rule.prefix === 'string' && rule.prefix.length > 0;
    return exact !== prefix;
  }

  export function createRegistry(rules: readonly DocumentRule[]): DocumentRegistry {
    const safe = rules.map(rule => ({...rule}));
    if (!safe.every(validRule)) throw new Error('invalid_document_rule');

    const ids = new Set<string>();
    for (const rule of safe) {
      if (ids.has(rule.id)) throw new Error('duplicate_document_rule');
      ids.add(rule.id);
    }

    const resolve = (scope: DocumentScope, key: string): DocumentRule | null => {
      const raw = String(key || '');
      for (const rule of safe) {
        if (rule.scope !== scope) continue;
        if (rule.exact && raw === rule.exact) return rule;
        if (rule.prefix && raw.startsWith(rule.prefix)) return rule;
      }
      return null;
    };

    return {
      resolve,
      accepts(scope: DocumentScope, key: string): boolean {
        return !!resolve(scope, key);
      },
      exactKeys(scope: DocumentScope): string[] {
        return safe
          .filter(rule => rule.scope === scope && !!rule.exact)
          .map(rule => rule.exact as string);
      }
    };
  }
}
