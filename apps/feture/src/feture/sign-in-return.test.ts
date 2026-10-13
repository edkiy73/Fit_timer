import {describe,it,expect} from 'vitest';
import {safeSignInReturnTo} from './sign-in-return';
const id='91e9ee01-e4e2-4900-a7ad-144c46442390';

describe('OTP invitation return',()=>{
 it('restores only known share and comparison paths',()=>{
  for(const path of ['/share/'+id,'/compare/'+id,'/compare/new/'+id])
   expect(safeSignInReturnTo({returnTo:path})).toBe(path);
 });
 it('rejects external, script, admin, malformed and query redirects',()=>{
  for(const path of ['//elsewhere.example','https://elsewhere.example','javascript:alert(1)',
   '/admin','/account','/share/not-an-id','/share/'+id+'?token=secret',
   '/compare/new/'+id+'/other','/\\elsewhere.example'])expect(safeSignInReturnTo({returnTo:path})).toBe('/');
  expect(safeSignInReturnTo(null)).toBe('/');
  expect(safeSignInReturnTo({returnTo:42})).toBe('/');
 });
 it('restores a bounded design screen without query parameters',()=>{
  expect(safeSignInReturnTo({returnTo:'/design/F01'})).toBe('/design/F01');
  for(const path of ['/design/F01?token=secret','/design/F01/other','/design/../admin','/design/https://elsewhere.example'])
   expect(safeSignInReturnTo({returnTo:path})).toBe('/');
 });
});
