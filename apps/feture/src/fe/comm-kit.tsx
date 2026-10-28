import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Users,type LucideIcon} from 'lucide-react';
import {publicOrigin} from '../api-url';
import {ReportSheet as AppReportSheet} from './report';
import {namedPlate} from './create-community';

/** What only the «Сообщества» screens share, built from the kit (src/fe/kit): the named plates, the report sheet,
 * the link helpers and the plural/fill text helpers. Controls themselves always come from the kit. */

export const okRes=z.object({ok:z.literal(true)}).passthrough();
export const fill=(s:string,v:Record<string,string|number>)=>s.replace(/\{(\w+)\}/g,(m,k:string)=>k in v?String(v[k]):m);
/** `pl()` — «1 участник / 2 участника / 5 участников»; the forms come from the dictionary as «a|b|c». */
export function pl(n:number,forms:string,locale:string){
 const f=forms.split('|');
 if(locale==='en')return `${n} ${n===1?f[0]:f[1]??f[0]}`;
 const m=n%10,h=n%100;return `${n} ${m===1&&h!==11?f[0]:m>=2&&m<=4&&(h<12||h>14)?f[1]:f[2]??f[1]}`;
}
export const plWord=(n:number,forms:string,locale:string)=>pl(n,forms,locale).replace(/^\d+ /,'');

/** The community / event picture when there is no photo: the named plate, with the group icon for communities. */
export function NamedPlate({k,icon:Icon}:{k:string|null|undefined,icon?:LucideIcon|undefined}){
 return <div className="plate" style={namedPlate(k||'lilac')}>{Icon&&<span className="pi"><Icon/></span>}</div>;
}
export const CommPlate=({k}:{k:string|null|undefined})=><NamedPlate k={k} icon={Users}/>;

/** «Пожаловаться» on a community, an event or a community post: the app's one report sheet (./report). */
export function ReportSheet({targetType,targetId,onClose,onDone}:{targetType:'community'|'event'|'post',targetId:string,onClose:()=>void,onDone:(msg:string)=>void}){
 const {t}=useI18n();
 return <AppReportSheet targetType={targetType} targetId={targetId} onClose={onClose} onDone={()=>onDone(t('fe.cm.reported'))}/>;
}

/** Copies a link; says so either way. */
export async function copyLink(url:string){
 try{await navigator.clipboard.writeText(url);return true;}catch{return false;}
}
export const appUrl=(path:string)=>`${publicOrigin()}/#${path}`;
