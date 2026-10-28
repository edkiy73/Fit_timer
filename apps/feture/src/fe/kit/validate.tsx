import {useCallback,useMemo,useState,type ReactNode} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {checkText,FIELD,lineRule,textLength,textRule,type FieldName,type TextError,type TextRule} from '../../../contracts/_text.mjs';
import {FeError} from '../../feture/fe-api';
import {Counter} from './index';

/** Kit validation layer: every text field of a form checks the same rules the server applies (contracts/_text.mjs —
 * one module for both), shows the error inline under the field on blur and on submit, a counter near the limit, and
 * the first wrong field shakes. A server refusal (`invalid_input` with `fields`/`reasons`) lands on the same field. */

export {FIELD,lineRule,textLength,textRule};
export type {FieldName,TextRule};
type T=(key:string,vars?:Record<string,string|number>)=>string;

const ruleOf=(r:FieldName|TextRule):TextRule=>typeof r==='string'?FIELD[r]:r;
const CODES=new Set<string>(['bad_characters','line_break','markup','empty','too_short','too_long','too_many_lines','long_word']);

/** The message for a refusal code; `{n}` is the rule's limit for that code, `{chars}` the word «символ» in its form. */
export function textErrorMessage(t:T,code:string,rule:TextRule):string{
 if(!CODES.has(code))return t('fe.val.invalid');
 const c=code as TextError;
 const n=c==='too_short'?rule.min:c==='too_long'?rule.max:c==='too_many_lines'?rule.lines:c==='long_word'?rule.run:0;
 let form='other';try{form=new Intl.PluralRules(t('fe.val.locale')).select(n);}catch{/* keep «other» */}
 return t('fe.val.'+c,{n,chars:t('fe.val.chars.'+form)});
}
/** One value against a field's rule: the message, or undefined when it passes. */
export function textError(t:T,rule:FieldName|TextRule,value:string):string|undefined{
 const r=ruleOf(rule);const e=checkText(value,r).error;return e?textErrorMessage(t,e,r):undefined;
}
/** Native `maxLength` that still lets an overflow show (the counter turns red, the error explains) instead of cutting a
 * paste silently; the server guard is far above it. */
export const softMax=(rule:FieldName|TextRule)=>ruleOf(rule).max*2;

/** shakeFirstErr(): the first field with an error shakes, gets focus and scrolls into view. */
export function shakeFirstErr(){
 requestAnimationFrame(()=>{
  const e=document.querySelector<HTMLElement>('.v21 .field.err');if(!e)return;
  e.classList.remove('shake');void e.offsetWidth;e.classList.add('shake');
  e.querySelector<HTMLElement>('.inp,input,textarea,select,button')?.focus({preventScroll:true});
  e.scrollIntoView({block:'center',behavior:'smooth'});
 });
}

/** The server's refused paths of `invalid_input`, with their reasons; [] for any other error. */
export function serverFields(e:unknown):{path:string,code:string}[]{
 if(!(e instanceof FeError)||e.code!=='invalid_input'||!e.fields?.length)return [];
 return e.fields.map(path=>({path,code:e.reasons?.[path]??'invalid'}));
}

/**
 * A form's text fields. `spec` names each field's rule, `values` are the current values.
 * - `input(k)` → props for Input / TextArea (`onBlur`, `invalid`, `maxLength`); `error(k)` → Field's `error`;
 *   `counter(k)` → a Counter once the value reaches 80% of the limit.
 * - `submit()` shows every error and shakes the first; false when something is wrong.
 * - `fromServer(e, map?)` puts a server refusal on its field (path → key: exact, then the first segment, then `map`);
 *   true when it did. The server's message stays until the value changes.
 */
export function useChecks<K extends string>(spec:Partial<Record<K,FieldName|TextRule>>,values:Record<K,string>,
 /** A screen's own words for a code (e.g. support «Напиши хотя бы пару слов» for too_short). */ words:Partial<Record<K,Partial<Record<TextError,string>>>>={}){
 const {t}=useI18n();
 const [shown,setShown]=useState<ReadonlySet<K>>(()=>new Set());
 const [srv,setSrv]=useState<Partial<Record<K,{msg:string,value:string}>>>({});
 const keys=(Object.keys(spec) as K[]).filter(k=>spec[k]!==undefined);
 const local=useMemo(()=>{
  const out:Partial<Record<K,string>>={};
  for(const k of keys){const r=ruleOf(spec[k]!);const e=checkText(values[k]??'',r).error;if(e)out[k]=words[k]?.[e]??textErrorMessage(t,e,r);}
  return out;
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[t,keys.join(),JSON.stringify(values)]);
 const error=(k:K):string|undefined=>{const s=srv[k];if(s&&s.value===(values[k]??''))return s.msg;return shown.has(k)?local[k]:undefined;};
 const blur=useCallback((k:K)=>setShown(s=>s.has(k)?s:new Set([...s,k])),[]);
 const valid=Object.keys(local).length===0;
 return {
  error,valid,
  input:(k:K)=>({onBlur:()=>blur(k),invalid:!!error(k),...(spec[k]?{maxLength:softMax(spec[k])}:{})}),
  counter:(k:K):ReactNode=>{const s=spec[k];if(!s)return null;const r=ruleOf(s);const n=textLength(values[k]??'');return n>=r.max*0.8?<Counter n={n} max={r.max}/>:null;},
  /** Show all errors; shake the first. */
  submit:():boolean=>{setShown(new Set(keys));if(!valid){shakeFirstErr();return false;}return true;},
  fromServer:(e:unknown,map:Partial<Record<string,K>>={}):boolean=>{
   const next:Partial<Record<K,{msg:string,value:string}>>={};
   for(const {path,code} of serverFields(e)){
    const head=path.split('.')[0]!;
    const k=(map[path]??(path in spec?path:undefined)??map[head]??(head in spec?head:undefined)) as K|undefined;
    const s=k&&spec[k];
    if(k&&s&&!next[k])next[k]={msg:words[k]?.[code as TextError]??textErrorMessage(t,code,ruleOf(s)),value:values[k]??''};
   }
   if(!Object.keys(next).length)return false;
   setSrv(s=>({...s,...next}));setShown(new Set(keys));shakeFirstErr();return true;
  },
  /** After a successful save. */
  reset:()=>{setShown(new Set());setSrv({});},
 };
}
