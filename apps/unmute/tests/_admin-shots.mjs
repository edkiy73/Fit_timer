import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';
import { parseLegacySource, buildCourseSet, buildLexicon } from '../lib/legacy-import.mjs';
import { buildA1StarterCourse } from '../lib/a1-starter-course.mjs';
process.env.ALLOW_MEMORY_STORE='1'; process.env.ADMIN_KEY='k';
const require=createRequire(import.meta.url);
const APP='/home/user/Fit_timer/apps/unmute', DIST=join(APP,'dist');
const API=Object.fromEntries(['auth','sync','health','admin','billing','content','lexicon'].map(n=>[n,require(join(APP,'api',n+'.js'))]));
const Content=require(join(APP,'lib/content-store.js')), Lexicon=require(join(APP,'lib/lexicon-store.js')), Release=require(join(APP,'lib/content-release.js'));
const model=parseLegacySource(readFileSync('/tmp/claude-0/-home-user/768a32cc-3996-57d6-b66f-962b94d58f22/scratchpad/legacy.html','utf8'));
const lex=buildLexicon(model); await Lexicon.putDraft(lex);
await Content.putDraft(buildCourseSet(model,lex)); await Content.putDraft(buildA1StarterCourse());
await Release.publishDraftRelease(['general-foundation','a1-starter']);
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{const u=new URL(req.url,'http://x');const p=decodeURIComponent(u.pathname);req.query=Object.fromEntries(u.searchParams);const m=/^\/api\/([a-z]+)$/.exec(p);
 if(m){const h=API[m[1]];const ch=[];for await(const c of req)ch.push(c);req.body=ch.length?JSON.parse(Buffer.concat(ch).toString()):{};await h(req,res);return;}
 const f=normalize(join(DIST,p==='/'?'index.html':p));if(!existsSync(f)||!statSync(f).isFile()){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',T[extname(f)]||'application/octet-stream');res.end(readFileSync(f));});
await new Promise(r=>server.listen(4190,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for(const [w,h,tag] of [[1280,900,'desk'],[390,844,'phone']]){
  const p=await b.newPage({viewport:{width:w,height:h},locale:'ru-RU'});
  await p.goto('http://127.0.0.1:4190/#/admin');
  await p.getByLabel('Ключ администратора').fill('k'); await p.getByRole('button',{name:'Войти',exact:true}).click();
  for(const [name,file] of [['Курсы и словарь','courses'],['Редактор уроков','editor']]){
    if(tag==='phone') await p.locator('.ab-admin-menu').click();
    await p.locator('.ab-admin-nav').getByRole('button',{name,exact:true}).click();
    await p.waitForTimeout(2500);
    await p.screenshot({path:'/tmp/claude-0/-home-user/768a32cc-3996-57d6-b66f-962b94d58f22/scratchpad/'+tag+'-'+file+'.png',fullPage:true});
  }
  if(process.argv[2]==='day'){ /* open first day */
    const day=p.getByRole('button',{name:/День 1/}).first(); if(await day.count()){await day.click();await p.waitForTimeout(1500);await p.screenshot({path:'/tmp/claude-0/-home-user/768a32cc-3996-57d6-b66f-962b94d58f22/scratchpad/'+tag+'-day.png',fullPage:true});}
  }
}
await b.close(); server.close();
