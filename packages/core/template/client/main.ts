import { createProfileDraft } from '@appbase/core/identity.js';
import { createRegistry } from '@appbase/core/sync.js';
import type { JsonObject } from '@appbase/types/core.js';

export interface AppDocument extends JsonObject {
  id: string;
}

export function createDefaultProfile(name: string){
  return createProfileDraft(name);
}

export function createDocumentRegistry(prefix: string){
  return createRegistry([{scope:'profile', prefix, free:true, allowDeleted:true}]);
}
