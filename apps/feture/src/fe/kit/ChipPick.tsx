import {useRef,useState} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Search} from 'lucide-react';
import {Btn,Empty} from '../ui';
import {Actions,Chip,Chips,Pill,SearchInput,SectionLabel,Sheet} from './index';

export type PickOption={code:string,label:string,/** Extra words the search also matches (the other language, the code). */ search?:string};

/** The whole list of a long choice in a sheet: search, «Популярное» / «Ещё варианты», the count chosen (n / max), «Сбросить»
 * and «Готово · n». Shared by the chips' «Все · N» and by the multiple-choice row. */
export function ChipPickSheet({label,options,value,onToggle,onClear,onClose,max=0,base=8}:{label:string,options:readonly PickOption[],value:readonly string[],
 onToggle:(code:string)=>void,onClear:()=>void,onClose:()=>void,max?:number,base?:number}){
 const {t}=useI18n();const [q,setQ]=useState('');
 const query=q.trim().toLowerCase();
 const hit=(o:PickOption)=>!query||`${o.label} ${o.search??''} ${o.code}`.toLowerCase().includes(query);
 const groups:[string,readonly PickOption[]][]=[[t('fe.onb.popular'),options.slice(0,base)],[t('fe.onb.moreOptions'),options.slice(base)]];
 const total=options.filter(hit).length;
 return <Sheet full title={label} onClose={onClose} head={<Pill tone={value.length?'v':undefined}>{max?`${value.length}/${max}`:value.length}</Pill>}
  search={<SearchInput label={t('fe.onb.find')} value={q} onChange={e=>setQ(e.target.value)}/>}
  foot={<Actions>
   {value.length>0&&<Btn kind="soft" onClick={onClear}>{t('fe.onb.clear')}</Btn>}
   <Btn onClick={onClose}>{value.length?t('fe.onb.doneN').replace('{n}',String(value.length)):t('fe.reg.done')}</Btn>
  </Actions>}>
  {groups.map(([g,list])=>{const vis=list.filter(hit);if(!list.length||query&&!vis.length)return null;
   return <section key={g} className={'fsec'+(query?' searching':'')}><SectionLabel>{g}</SectionLabel>
    <Chips>{vis.map(o=><Chip key={o.code} on={value.includes(o.code)} onClick={()=>onToggle(o.code)}>{o.label}</Chip>)}</Chips></section>;})}
  {query&&!total&&<Empty compact icon={Search} title={t('fe.onb.findNone')}/>}
 </Sheet>;
}

/** Several (or one) from a long list as chips — the one picker of profile details, in sign-up and in the profile editor
 * (V21 `chipGroup(…,{limit:5})` + `openChipPicker()`). Up to seven options show as chips; a longer list shows the first
 * `shown` (plus the chosen ones) and «Все · N», which opens the whole list in a sheet: search, «Популярное» (the first
 * `base`) / «Ещё варианты», the count of chosen (n / max), «Сбросить» and «Готово · n». A chip once on screen stays, so
 * choosing in the sheet never moves the others. Limits are the caller's: `onToggle` decides what a tap does. */
export function ChipPick({label,options,value,onToggle,onClear,max=0,base=8,shown=5}:{label:string,options:readonly PickOption[],value:readonly string[],
 onToggle:(code:string)=>void,onClear:()=>void,/** Shown as n / max in the sheet; 0 shows only n. */ max?:number,base?:number,shown?:number}){
 const {t}=useI18n();const [open,setOpen]=useState(false);
 const seen=useRef<Set<string>>(new Set());
 const long=options.length>shown+2;
 let chips=options;
 if(long){for(const o of options.slice(0,shown))seen.current.add(o.code);for(const c of value)seen.current.add(c);chips=options.filter(o=>seen.current.has(o.code));}
 return <>
  <Chips label={label}>{chips.map(o=><Chip key={o.code} on={value.includes(o.code)} onClick={()=>onToggle(o.code)}>{o.label}</Chip>)}
   {long&&<Chip more popup icon={Search} onClick={()=>setOpen(true)}>{t('fe.onb.all').replace('{n}',String(options.length))}</Chip>}</Chips>
  {open&&<ChipPickSheet label={label} options={options} value={value} onToggle={onToggle} onClear={onClear} max={max} base={base} onClose={()=>setOpen(false)}/>}
 </>;
}
