/* V18 keeps every V14 rule: the V14 contract (which itself runs the V13 contract) runs against the V18 file,
   then the V18 checks — «Я» is one screen with three layers: Профиль, Видимость, Моё. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import { pathToFileURL } from 'node:url';
const base=fs.readFileSync(new URL('./prototype-v14-contract.mjs',import.meta.url),'utf8');
const swap=(s,a,b)=>{if(!s.includes(a))throw new Error('V14 contract changed: '+a);return s.replace(a,b);};
let src=swap(base,"new URL('../public/prototype-v14.html',import.meta.url).href",JSON.stringify(new URL('../public/prototype-v18.html',import.meta.url).href));
src=swap(src,"new URL('./prototype-v13-contract.mjs',import.meta.url)",'new URL('+JSON.stringify(new URL('./prototype-v13-contract.mjs',import.meta.url).href)+')');
src=swap(src,"src+=`\n// ---- V14 ----","src=swap(src,\"assert.ok(run(\\\"profGo('couple')\\\").includes('data-go=\\\"P03\\\"'))\",\"assert.ok(run(\\\"profGo('couple')\\\").includes('data-v=\\\"couple\\\"'),'V17: my couple opens the profile tab, not a preview')\");\nsrc+=`\n// ---- V14 ----");
src=swap(src,'`\n// ---- V14 ----',`\`
// ---- V18 ----
assert.equal(run("meTabName()"),'Я','the tab is called «Я»');
prepare('X01');run("S.nav.tab='me';S.nav.stacks.me=[{id:'X01',p:{},f:{}}]");let x=run("SC.X01.render(cur().p,cur())");
assert.ok(x.includes('data-act="meLayer"')&&!x.includes('profile-page'),'«Я» is one screen with three layers, not a copy of the public profile');
for(const k of ['media','basics','details','priv'])assert.ok(x.includes('&quot;only&quot;:&quot;'+k+'&quot;')||x.includes('"only":"'+k+'"'),'block '+k+' opens its own short editor');
assert.ok(!x.includes('shareProfile')&&!x.includes('privLens')&&!x.includes('demoNote'),'no share button, no in-page lens, no demo buttons');
assert.ok(!x.includes('data-go="P07"')&&!x.includes('data-go="Q01"'),'no access or couple-settings shortcuts mixed into the profile layer');
run("ACT.meLayer({dataset:{v:'vis'}})");x=run("SC.X01.render(cur().p,cur())");
assert.ok(x.includes('data-sel="k4mode"')&&x.includes('data-sel="reqFrom"')&&x.includes('lv&quot;:&quot;card')||x.includes('"lv":"card"'),'Visibility holds Discover, who may ask and the Discover card preview');
assert.ok(x.includes('data-act="revoke"'),'who has access is managed in Visibility');
run("ACT.meLayer({dataset:{v:'mine'}})");x=run("SC.X01.render(cur().p,cur())");
assert.ok(x.includes('data-go="F10"')&&x.includes('mine&quot;:1')||x.includes('"mine":1'),'Mine is lists only, incl. what others shared with me');
assert.ok(!x.includes('data-sel=')&&!x.includes('editJar'),'Mine has no settings and no profile content');
run("coupleProfile();ACT.openOwn({dataset:{v:'couple'}})");assert.equal(run("cur().p.owner"),'couple');assert.equal(run("cur().p.layer"),'mine','switching profile keeps the layer');
assert.equal(run("actionAuthor()"),'couple','«Мы» acts as the couple');assert.ok(run("editableProfile()!==S.me"));
run("ACT.meLayer({dataset:{v:'vis'}})");x=run("SC.X01.render(cur().p,cur())");assert.ok(x.includes('data-act="pairDating"')&&x.includes('data-act="pairTrustOpen"'),'couple rules live in the couple’s Visibility');
assert.ok(!run("SC.K01.render({},cur())").includes('data-sel="k4mode"'),'Settings no longer copy dating and privacy switches');
prepare('P03',{lv:'card'});assert.ok(run("SC.P03.render(cur().p,cur())").includes('card18'),'«Как видят» shows the Discover card');
prepare('P03',{});const p3=run("SC.P03.render(cur().p,cur())");assert.ok(!p3.includes('demoNote')&&p3.includes('disabled'),'preview buttons are disabled, never fake');
prepare('P02',{only:'basics'});const pe18=run("SC.P02.render(cur().p,cur())");assert.ok(pe18.includes('name="nick"')&&!pe18.includes('id="peMedia"')&&!pe18.includes('id="privEdit"'),'a block editor shows only its block');
prepare('Q01');run("coupleProfile();S.pair.proposal={id:'d1',by:S.pair.with,status:'pending',text:{...structuredClone(S.pair.profile),bio:{ru:'Новый текст',en:'New text'}}}");assert.ok(text(run("proposalDiff(S.pair.proposal)")).includes('Новый текст'),'a partner’s proposal is reviewed as a difference');
console.log('PASS V18: «Я» — three layers, block editors, one preview with the Discover card, one couple draft');
\n// ---- V14 ----`);
src=src.replace("const tmp=path.join(os.tmpdir(),'feture-v14-contract-'","const tmp=path.join(os.tmpdir(),'feture-v14in18-contract-'");
const tmp=path.join(os.tmpdir(),'feture-v18-contract-'+process.pid+'.mjs');fs.writeFileSync(tmp,src);
try{await import(pathToFileURL(tmp).href);}finally{fs.rmSync(tmp,{force:true});}
