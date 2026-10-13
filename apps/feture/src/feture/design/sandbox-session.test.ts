import {beforeEach,describe,expect,it} from 'vitest';
import {endSandbox,sandboxActive,startSandbox} from './sandbox-session';

describe('ephemeral design session',()=>{
 beforeEach(()=>{sessionStorage.clear();});
 it('stores only a noncredential mode marker and clears it on exit',()=>{
  expect(sandboxActive()).toBe(false);
  startSandbox();
  expect(sandboxActive()).toBe(true);
  expect(sessionStorage.length).toBe(1);
  expect(sessionStorage.getItem('feture.design.ephemeral')).toBe('1');
  endSandbox();
  expect(sandboxActive()).toBe(false);
  expect(sessionStorage.length).toBe(0);
 });
});
