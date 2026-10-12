import {describe,expect,it} from 'vitest';
import {mergeProfileDraft,profileDraftChanged} from './profile-draft';
const keys=['nickname','about','city'] as const;
describe('profile draft conflict reconciliation',()=>{
 it('retains local edits but respects unrelated remote updates',()=>{
  const previous={nickname:'Мила',about:'Мой текст',city:'Москва'};
  const local={...previous,nickname:'Мия'};
  const latest={...previous,about:'Обновлено с другого устройства',city:'Казань'};
  expect(mergeProfileDraft(previous,local,latest,keys)).toEqual({nickname:'Мия',about:'Обновлено с другого устройства',city:'Казань'});
 });
 it('preserves deliberate emptying of a field and identifies clean drafts',()=>{
  const previous={nickname:'Имя',about:'Описание',city:''};
  const local={...previous,about:''};
  const latest={...previous,city:'Бали'};
  const merged=mergeProfileDraft(previous,local,latest,keys);
  expect(merged).toEqual({nickname:'Имя',about:'',city:'Бали'});
  expect(profileDraftChanged(latest,merged,keys)).toBe(true);
  expect(profileDraftChanged(latest,latest,keys)).toBe(false);
 });
});
