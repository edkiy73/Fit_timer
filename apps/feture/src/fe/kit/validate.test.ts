import {describe,expect,it} from 'vitest';
// The contracts are plain JS for the server (no types for the app); the test only parses through them.
// @ts-expect-error untyped .mjs
import {meCommands} from '../../../contracts/me.mjs';
// @ts-expect-error untyped .mjs
import {communitiesCommands} from '../../../contracts/communities.mjs';
// @ts-expect-error untyped .mjs
import {supportCommands} from '../../../contracts/support.mjs';
import {ru,en} from '../i18n/validate';
import {FIELD,textError,textErrorMessage,type FieldName} from './validate';

const U=(...c:number[])=>String.fromCodePoint(...c);
const t=(k:string,v?:Record<string,string|number>)=>{let s=(ru as Record<string,string>)[k]??k;for(const [a,b] of Object.entries(v??{}))s=s.replace('{'+a+'}',String(b));return s;};
// Hostile and ordinary values: the form and the server must agree on every one.
const CORPUS=['Анна','  Анна  ','<b>x</b>','a'+U(0x202E)+'b','x'.repeat(41),'x'.repeat(90),'a\nb','   ','a'+U(0x200B)+'b',U(0x1F469,0x200D,0x1F4BB)+' dev',
 'Встречи и разговоры о верёвке для новичков','see https://example.com/'+'p'.repeat(120)+' ok',Array(30).fill('a').join('\n'),'ok '.repeat(200)];

describe('kit validation layer',()=>{
 it('has a RU and EN message for every refusal code',()=>{
  for(const code of ['bad_characters','line_break','markup','empty','too_short','too_long','too_many_lines','long_word','invalid']){
   expect(ru).toHaveProperty('fe.val.'+code);expect(en).toHaveProperty('fe.val.'+code);
  }
  expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
 });
 it('says the limit in the message',()=>{
  expect(textErrorMessage(t,'too_long',FIELD.bio)).toBe('Максимум 500 символов');
  expect(textErrorMessage(t,'too_short',FIELD.communityName)).toBe('Минимум 3 символа');
  expect(textErrorMessage(t,'too_short',FIELD.joinAnswer.min?FIELD.joinAnswer:FIELD.placeName)).toBe('Минимум 2 символа');
  expect(textErrorMessage(t,'long_word',FIELD.profileName)).toContain('40');
  expect(textErrorMessage(t,'whatever',FIELD.bio)).toBe(ru['fe.val.invalid']);
 });
 it('agrees with the server contracts on every value',()=>{
  const cases:[FieldName,(v:string)=>boolean][]=[
   ['communityName',v=>communitiesCommands['community.create'].input.shape.name.safeParse(v).success],
   ['communityDescription',v=>communitiesCommands['community.create'].input.shape.description.safeParse(v).success],
   ['bio',v=>meCommands['profile.update'].input.shape.bio.safeParse(v).success],
   ['profileName',v=>meCommands['profile.update'].input.shape.name.safeParse(v).success],
   ['support',v=>supportCommands['support.create'].input.shape.body.safeParse(v).success],
  ];
  for(const [name,server] of cases)for(const v of CORPUS)expect([name,v,!textError(t,name,v)]).toEqual([name,v,server(v)]);
 });
});
