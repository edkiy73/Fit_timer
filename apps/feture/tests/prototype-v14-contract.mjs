/* V14 keeps every V13 rule: the V13 contract runs against the V14 file (only the V13 «author is an avatar» look is replaced),
   then a few V14 checks — the author in words, one access summary, consent to a photo mark only after seeing it. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import { pathToFileURL } from 'node:url';
const base=fs.readFileSync(new URL('./prototype-v13-contract.mjs',import.meta.url),'utf8');
const swap=(s,a,b)=>{if(!s.includes(a))throw new Error('V13 contract changed: '+a);return s.replace(a,b);};
let src=swap(base,"new URL('../public/prototype-v13.html',import.meta.url)",`new URL(${JSON.stringify(new URL('../public/prototype-v14.html',import.meta.url).href)})`);
src=swap(src,"includes('author-picker av-only'),'the author is an avatar in the header'","includes('author-picker v14 full'),'V14: the author is named in words above the text'");
src+=`
// ---- V14 ----
prepare('F07');run("coupleProfile();S.composeActor='couple';setPairTrust(true)");const f07=run("SC.F07.render({},cur())");
assert.ok(text(f07).includes('Опубликовать как')&&text(f07).includes('Мы'),'the composer names the author in words');assert.ok(f07.includes('cmp-who'),'one sentence says who sees it');
prepare('P01',{id:'mia'});run("coupleProfile()");assert.ok(run("SC.P01.render(cur().p,cur())").includes('class="p-author"'),'profile actions say who acts');
run("S=freshState('full');S.session={};initNav();S.nav.stacks.feed=[{id:'P01',p:{id:'mia'},f:{}}]");assert.ok(!run("SC.P01.render(cur().p,cur())").includes('author-picker'),'no author switch without a couple');
const sum=text(run("accessSummary('mia',['info'],null,{allowed:['info','photos','video']})"));
assert.ok(sum.includes('без срока')&&sum.includes('останутся закрытыми')&&sum.includes('Чат и симпатию это не открывает'),'one access summary: what, how long, what stays closed, no chat');
prepare('N01');run("S.lang='ru'");const inbox=run("SC.N01.render(cur().p,cur())");
if(inbox.includes('data-act="tagReview"'))assert.ok(!/data-act="tagAnswer" data-v="[^"]*\\|yes"/.test(inbox),'a photo mark is allowed only from the review that shows the photo and audience');
assert.ok(run("compatWords({few:false,rows:{match:[1],complement:[],try:[],discuss:[],bound:[]}})").includes('не согласие'),'compatibility is never framed as consent');
console.log('PASS V14: author in words, one access summary, photo-mark review, compatibility is not consent');
`;
const tmp=path.join(os.tmpdir(),'feture-v14-contract-'+process.pid+'.mjs');fs.writeFileSync(tmp,src);
try{await import(pathToFileURL(tmp).href);}finally{fs.rmSync(tmp,{force:true});}
