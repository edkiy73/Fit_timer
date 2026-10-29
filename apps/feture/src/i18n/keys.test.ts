import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {dictionaries} from './index';

/** Every literal `t('fe.…')` key used in the app screens exists in both dictionaries (a missing one shows as the raw key
 * on a button — the Premium checkout once showed «fe.close»). Keys built at run time (`t('fe.x.'+kind)`) are not checked. */
const walk=(dir:string):string[]=>readdirSync(dir).flatMap(f=>{const p=join(dir,f);return statSync(p).isDirectory()?(f==='i18n'?[]:walk(p)):/\.tsx?$/.test(f)&&!/\.(test|stories)\./.test(f)?[p]:[];});

describe('i18n keys used in code',()=>{
 const used=new Map<string,string>();
 for(const f of walk(join(__dirname,'..'))){
  const src=readFileSync(f,'utf8');
  for(const m of src.matchAll(/\bt\(\s*['"`](fe\.[A-Za-z0-9_.-]+)['"`]\s*[,)]/g))if(!used.has(m[1]!))used.set(m[1]!,f);
 }
 for(const lang of ['ru','en'] as const)it(`has every literal key in ${lang}`,()=>{
  const dict=dictionaries[lang] as Record<string,string>;
  const missing=[...used].filter(([k])=>!(k in dict)).map(([k,f])=>`${k}  (${f.split('/src/')[1]})`);
  expect(missing).toEqual([]);
 });
});
