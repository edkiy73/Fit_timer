import { createProfileDraft } from '@appbase/core/identity.js';
import { createRegistry } from '@appbase/core/sync.js';
import type { JsonObject } from '@appbase/types/core.js';

export interface TaskRecord extends JsonObject {
  id: string;
  title: string;
  done: boolean;
}

export const taskDocuments = createRegistry([
  {scope:'profile', prefix:'task:', free:true, allowDeleted:true}
]);

export function createTask(id: string, title: string): TaskRecord {
  return {id, title, done:false};
}

export function createDefaultProfile(){
  return createProfileDraft('My tasks');
}
