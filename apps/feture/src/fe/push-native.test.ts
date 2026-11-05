import {describe,expect,it} from 'vitest';
import {pushRoute,takePushTap} from './push-native';

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

// A tap that arrived while the app showed the required-update screen is still there after the install restarts the app.
describe('takePushTap',()=>{
 const KEY='feture.fe.push.tap';
 it('gives a remembered tap once',()=>{
  localStorage.setItem(KEY,JSON.stringify({route:'/n/inbox',at:Date.now()}));
  expect(takePushTap()).toBe('/n/inbox');
  expect(takePushTap()).toBeNull();
 });
 it('drops an old or foreign one',()=>{
  localStorage.setItem(KEY,JSON.stringify({route:'/n/inbox',at:Date.now()-2*60*60*1000}));
  expect(takePushTap()).toBeNull();
  localStorage.setItem(KEY,JSON.stringify({route:'https://evil.example',at:Date.now()}));
  expect(takePushTap()).toBeNull();
 });
});
