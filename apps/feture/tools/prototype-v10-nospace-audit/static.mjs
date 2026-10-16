import {chromium} from 'playwright';
import fs from 'node:fs';
import {open,DETECT,ctxInfo,VIEWS} from './lib.mjs';
const [,, langArg='ru,en', schemeArg='light', viewsArg='all', personaArg='full', outName='phase1']=process.argv;
const b=await chromium.launch();
const results=[];
const views=viewsArg==='all'?VIEWS:VIEWS.filter(v=>viewsArg.split(',').includes(String(v[0])));
for(const lang of langArg.split(','))for(const [w,h] of views){
  const p=await open(b,{w,h,lang,scheme:schemeArg,persona:personaArg});
  const list=await p.evaluate(()=>FT_QA.list().flatMap(([g,items])=>items.map(([id,l,pp])=>({g,id,l,pp:pp||{}}))));
  for(const it of list){
    try{
      await p.evaluate(({id,pp})=>FT_QA.go(id,pp),it);await p.waitForTimeout(650);
      const info=await ctxInfo(p);
      const f=await p.evaluate(DETECT);
      for(const x of f)results.push({lang,w,h,scheme:schemeArg,persona:personaArg,key:`${it.id}${JSON.stringify(it.pp)}`,label:it.l,group:it.g,...info,...x});
    }catch(e){results.push({lang,w,h,key:it.id,kind:'HARNESS_ERROR',err:String(e).slice(0,200)});}
  }
  console.log(lang,w,h,'done',results.length,p.errs.filter(e=>!/ERR_FILE|Failed to load/.test(e)).slice(0,3));
  await p.context().close();
}
fs.writeFileSync(`${outName}-${langArg.replace(',','')}-${schemeArg}-${personaArg}.json`,JSON.stringify(results));
await b.close();
