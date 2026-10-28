import {describe,expect,it} from 'vitest';
import {pushRoute} from './push-native';

// A notification's data.url decides where a tap goes: only the app's own /n screens, never another site.
describe('pushRoute',()=>{
 it('opens the /n screens the server sends',()=>{
  expect(pushRoute('/#/n/chats')).toBe('/n/chats');
  expect(pushRoute('/#/n/inbox')).toBe('/n/inbox');
 });
 it('refuses anything else',()=>{
  for(const bad of ['https://evil.example/#/n/chats','//evil.example','/#/admin','/#/n/../../x','/#/n/chats?x=1','javascript:alert(1)','',null,undefined,42])
   expect(pushRoute(bad)).toBeNull();
 });
});
