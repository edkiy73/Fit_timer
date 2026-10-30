/** The line of an inbox row for what staff (or the platform) decided about the person: a photo, a city, Premium, a role,
 * a removal, a restriction… Plain text, no actor — `null` for every other type (the inbox builds those itself). */
type T=(key:string,vars?:Record<string,string>)=>string;
type Row={type:string,data:Record<string,unknown>};

export function statusText(n:Row,t:T,locale:string):string|null{
 const d=n.data;
 const known=(k:string)=>{const s=t(k);return s===k?null:s;};
 const day=(v:unknown)=>{try{return new Date(String(v)).toLocaleDateString(locale==='en'?'en-GB':'ru-RU',{day:'numeric',month:'long'});}catch{return '';}};
 const rule=(r:unknown)=>typeof r==='string'?known('fe.ibx.rule.'+r):null;
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
   if(c>1)return t('fe.ibx.staff.'+what+'.many',{n:String(c)});
   return t(what==='report'?'fe.ibx.staff.report.'+(d.reason==='minor'?'minor':'threat'):'fe.ibx.staff.'+what);
  }
  case 'placeDecided':return t('fe.ibx.t.placeDecided.'+(d.state==='approved'?'approved':'rejected'));
  case 'premiumGranted':return t('fe.ibx.t.premiumGranted',{date:day(d.until)});
  case 'staffRole':{const role=String(d.role??'');return t(d.grant===true?'fe.ibx.t.staffRole.grant':'fe.ibx.t.staffRole.revoke',{role:known('fe.staff.role.'+role)??role});}
  case 'disputeResolved':return t('fe.ibx.t.disputeResolved.'+(d.outcome==='removed'?'removed':'restored'));
  case 'appealDecided':return t('fe.ibx.t.appealDecided.'+(d.state==='granted'?'granted':'denied'));
  case 'contentRemoved':{
   const head=known('fe.ibx.t.contentRemoved.'+String(d.targetType))??t('fe.ibx.t.contentRemoved.post');const r=rule(d.rule);
   return r?t('fe.ibx.t.contentRemoved.why',{head,rule:r}):head;
  }
  case 'profileSuspended':case 'profileRestricted':{
   const head=t('fe.ibx.t.'+n.type+(d.until?'.until':'.forever'),{date:day(d.until)});const r=rule(d.rule);
   if(r)return t('fe.ibx.t.contentRemoved.why',{head,rule:r});
   return n.type==='profileRestricted'?t('fe.ibx.t.contentRemoved.why',{head,rule:t('fe.ibx.t.profileRestricted.effect')}):head;
  }
  case 'profileRestored':case 'profileUnrestricted':return d.rule==='expired'?t('fe.ibx.t.'+n.type+'.expired'):null;
  case 'communityPublished':case 'communityRejected':case 'eventPublished':case 'eventRejected':return d.what==='change'?t('fe.ibx.t.'+n.type+'.change'):null;
  default:return null;
 }
}
