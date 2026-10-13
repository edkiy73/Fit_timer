import {act,renderHook} from '@testing-library/react';
import {beforeEach,describe,expect,it} from 'vitest';
import {endSandbox,readSandboxValue,sandboxActive,startSandbox,useSandboxState,writeSandboxValue} from './sandbox-session';
import {sandboxTarget} from './sandbox-route';

describe('FetUre temporary user session',()=>{
 beforeEach(()=>{sessionStorage.clear();});
 it('survives simulated app remount and keeps every value isolated from Core auth',()=>{
  startSandbox();
  const initial={Nickname:'',City:''};
  const first=renderHook(()=>useSandboxState('draft',initial,true));
  act(()=>first.result.current[1](prev=>({...prev,Nickname:'First try',City:'Bali'})));
  expect(readSandboxValue('draft',initial)).toEqual({Nickname:'First try',City:'Bali'});
  first.unmount(); // a page refresh, layout recreation, or code update
  const afterReload=renderHook(()=>useSandboxState('draft',initial,true));
  expect(afterReload.result.current[0]).toEqual({Nickname:'First try',City:'Bali'});
  afterReload.unmount();
  expect(sessionStorage.getItem('feture.auth.session')).toBeNull();
 });
 it('keeps posts, event drafts and profile changes until explicit reset',()=>{
  startSandbox();
  expect(writeSandboxValue('ownedPosts',['One post'])).toBe(true);
  expect(writeSandboxValue('ownedEvents',[{title:'New gathering',description:'Description'}])).toBe(true);
  expect(writeSandboxValue('interestLevels',{closeness:75})).toBe(true);
  startSandbox(); // reopening the sign-in screen is not logout
  expect(readSandboxValue('ownedPosts',[])).toEqual(['One post']);
  expect(readSandboxValue('interestLevels',{})).toEqual({closeness:75});
  endSandbox();
  expect(sandboxActive()).toBe(false);
  expect(sessionStorage.length).toBe(0);
  startSandbox(); // a new, clean user journey
  expect(readSandboxValue('ownedPosts',[])).toEqual([]);
  expect(readSandboxValue('interestLevels',{})).toEqual({});
  expect(readSandboxValue('ownedEvents',[])).toEqual([]);
 });
 it('does not read or write personal data when no sandbox is active',()=>{
  expect(writeSandboxValue('ownedPosts',['should not exist'])).toBe(false);
  expect(readSandboxValue('ownedPosts',[])).toEqual([]);
 });
 it('routes old product pages to the same temporary profile; never grants admin access',()=>{
  expect(sandboxTarget('/profile')).toBe('/design/P03');
  expect(sandboxTarget('/world')).toBe('/design/X01');
  expect(sandboxTarget('/tests')).toBe('/design/X05');
  expect(sandboxTarget('/community')).toBe('/design/C01');
  expect(sandboxTarget('/people/example')).toBe('/design/G02');
  expect(sandboxTarget('/')).toBe('/design/F01');
  expect(sandboxTarget('/admin')).toBeNull();
  expect(sandboxTarget('/operator')).toBeNull();
  expect(sandboxTarget('/account')).toBeNull();
  expect(sandboxTarget('/documents')).toBeNull();
 });
});
