import {describe,expect,it} from 'vitest';
import {routeFromLink} from './app-links';

describe('routeFromLink (Android App Links → hash route)',()=>{
 it('opens the screen of a FetUre link',()=>{
  expect(routeFromLink('https://app.kinhaze.com/#/n/feed/post/abc-1')).toBe('/n/feed/post/abc-1');
  expect(routeFromLink('https://app.kinhaze.com/#/n/me/pair?link=x')).toBe('/n/me/pair?link=x');
  expect(routeFromLink('https://app.kinhaze.com/index.html#/n/people/42')).toBe('/n/people/42');
 });
 it('opens the feed for the bare site or a non-app route',()=>{
  expect(routeFromLink('https://app.kinhaze.com/')).toBe('/n');
  expect(routeFromLink('https://app.kinhaze.com/#/admin')).toBe('/n');
  expect(routeFromLink('https://app.kinhaze.com/#/n/../admin')).toBe('/n');
 });
 it('ignores links that are not ours',()=>{
  expect(routeFromLink('https://evil.example/#/n/feed')).toBeNull();
  expect(routeFromLink('http://app.kinhaze.com/#/n/feed')).toBeNull();
  expect(routeFromLink('https://app.kinhaze.com/kit/#/n/feed')).toBeNull();
  expect(routeFromLink('not a url')).toBeNull();
 });
});
