import {entryFor,noteLine} from '../../contracts/notifications.mjs';

/** The line of an inbox row that names nobody: what staff, the platform or a system decided about the person — a photo,
 * a city, Premium, a role, a removal, a restriction… The words are the catalog's (contracts/notifications.mjs); only
 * the parts filled from the data (which file, which rule, until when, the kind of staff alert) come from the
 * dictionary. `null` for a row that names someone or a couple (the inbox draws those with the name in bold) and for an
 * unknown type. */
type T=(key:string,vars?:Record<string,string>)=>string;
type Row={type:string,data:Record<string,unknown>};

export function statusText(n:Row,t:T,locale:string):string|null{
 const d=n.data;
 const e=entryFor(n.type,d);if(!e)return null;
 const known=(k:string)=>{const s=t(k);return s===k?null:s;};
 const day=(v:unknown)=>{try{return new Date(String(v)).toLocaleDateString(locale==='en'?'en-GB':'ru-RU',{day:'numeric',month:'long'});}catch{return '';}};
 const rule=(r:unknown)=>typeof r==='string'?known('fe.ibx.rule.'+r):null;
 const line=(vars:Record<string,string>={})=>noteLine(e,locale,{vars});
 switch(n.type){
  case 'mediaDecided':{
   const ok=d.state==='approved';const c=Number(d.count)||1;const purpose=String(d.purpose??'');
   const why=!ok&&typeof d.reason==='string'?known('fe.ibx.media.r.'+d.reason):null;
   let head:string;
   if(c>1)head=t(ok?'fe.ibx.media.many.ok':'fe.ibx.media.many.no',{n:String(c)});
   else{
    const cover=purpose==='community'||purpose==='event';
    const what=cover?t('fe.ibx.media.cover.'+purpose):t('fe.ibx.media.k.'+(['video','audio'].includes(String(d.kind))?String(d.kind):'image'))+(known('fe.ibx.media.in.'+purpose)??'');
    head=t((ok?'fe.ibx.media.ok':'fe.ibx.media.no')+(cover?'F':''),{what});
   }
   return why?t('fe.ibx.media.why',{head,reason:why}):head;
  }
  case 'staffAlert':{
   const what=String(d.what);const c=Number(d.count)||1;
   const k=c>1?'fe.ibx.staff.'+what+'.many':what==='report'?'fe.ibx.staff.report.'+(d.reason==='minor'?'minor':'threat'):'fe.ibx.staff.'+what;
   return t(k)!==k?t(k,{n:String(c)}):line();
  }
  case 'premiumGranted':return line({date:day(d.until)});
  case 'staffRole':{const role=String(d.role??'');return line({role:known('fe.staff.role.'+role)??role});}
  case 'contentRemoved':{const head=line();const r=rule(d.rule);return r?t('fe.ibx.withRule',{head,rule:r}):head;}
  case 'profileSuspended':case 'profileRestricted':{
   const head=line({date:day(d.until)});const r=rule(d.rule);
   if(r)return t('fe.ibx.withRule',{head,rule:r});
   return n.type==='profileRestricted'?t('fe.ibx.withRule',{head,rule:t('fe.ibx.restrictedEffect')}):head;
  }
  default:{
   const s=line();
   return /\{(name|couple)\}/.test(locale==='en'?String(e.text.en):String(e.text.ru))?null:s;
  }
 }
}
