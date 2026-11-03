import {describe,expect,it} from 'vitest';
import {pushRoute} from './push-native';

// A notification's data.url decides where a tap goes: only the app's own /n screens, never another site.
describe('pushRoute',()=>{
 it('opens the /n screens the server sends',()=>{
  expect(pushRoute('/#/n/chats')).toBe('/n/chats');
  expect(pushRoute('/#/n/inbox')).toBe('/n/inbox');
  const id='018f0000-0000-7000-8000-000000000001';
  expect(pushRoute(`/#/n/me/pair?approval=${id}&as=${id}`)).toBe(`/n/me/pair?approval=${id}&as=${id}`);
  expect(pushRoute(`/#/n/feed/post/${id}?reply=${id}`)).toBe(`/n/feed/post/${id}?reply=${id}`);
 });
 it('refuses anything else',()=>{
  for(const bad of ['https://evil.example/#/n/chats','//evil.example','/#/admin','/#/n/../../x','/#/n/chats?x=1','/#/n/chats/not-a-uuid','/#/n/me/pair?approval=1','/#/n/me?layer=vis&layer=vis','javascript:alert(1)','',null,undefined,42])
   expect(pushRoute(bad)).toBeNull();
 });
});
