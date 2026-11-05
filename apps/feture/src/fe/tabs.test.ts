import {beforeEach,describe,expect,it} from 'vitest';
import {tabsActive,tabsBack,tabsGo,tabsInit,tabsNote,tabsReset,tabsStack} from './tabs';

// The owner's walk (05.11.2026): feed → communities → a community → feed → communities again → «Назад» must lead to the
// communities list, then to the feed — not to whatever the browser opened last.
const shown:string[]=[];
const go=(to:string,o:{state:Record<string,unknown>})=>{shown.push(to);tabsNote('REPLACE',{to},o.state.tn===true);};
const push=(to:string)=>{shown.push(to);tabsNote('PUSH',{to},false);};

describe('tab stacks',()=>{
 beforeEach(()=>{tabsReset();shown.length=0;tabsInit('feed',{to:'/n/feed'});});
 it('keeps one stack per tab and goes back inside the tab',()=>{
  tabsGo('communities',go);push('/n/communities/c1');
  tabsGo('feed',go);
  tabsGo('communities',go);
  expect(shown.at(-1)).toBe('/n/communities/c1');
  expect(tabsBack(go)).toBe(true);expect(shown.at(-1)).toBe('/n/communities');
  expect(tabsBack(go)).toBe(true);expect(shown.at(-1)).toBe('/n/feed');
  expect(tabsActive()).toBe('feed');
  expect(tabsBack(go)).toBe(false);
 });
 it('opens a screen of another section inside the tab you are in',()=>{
  push('/n/feed/post/p1');push('/n/chats/c9');
  expect(tabsStack('feed').map(x=>x.to)).toEqual(['/n/feed','/n/feed/post/p1','/n/chats/c9']);
  tabsBack(go);expect(shown.at(-1)).toBe('/n/feed/post/p1');
 });
 it('a tap on the tab you are in returns to its root',()=>{
  push('/n/feed/post/p1');tabsGo('feed',go);
  expect(shown.at(-1)).toBe('/n/feed');expect(tabsStack('feed')).toHaveLength(1);
 });
 it('a link opened at the start has the tab root under it',()=>{
  tabsReset();tabsInit('chats',{to:'/n/chats/c1'});
  expect(tabsStack('chats').map(x=>x.to)).toEqual(['/n/chats','/n/chats/c1']);
  tabsBack(go);expect(shown.at(-1)).toBe('/n/chats');
 });
 it('the browser back folds the stack to that screen',()=>{
  push('/n/feed/post/p1');push('/n/feed/post/p1/x');
  tabsNote('POP',{to:'/n/feed/post/p1'},false);
  expect(tabsStack('feed').map(x=>x.to)).toEqual(['/n/feed','/n/feed/post/p1']);
 });
});
