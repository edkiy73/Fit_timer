/* V17 keeps every V14 rule: the V14 contract (which itself runs the V13 contract) runs against the V17 file,
   then the V17 checks — the «Профиль» tab is one page: your profile as others see it, with owner controls in place. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import { pathToFileURL } from 'node:url';
const base=fs.readFileSync(new URL('./prototype-v14-contract.mjs',import.meta.url),'utf8');
const swap=(s,a,b)=>{if(!s.includes(a))throw new Error('V14 contract changed: '+a);return s.replace(a,b);};
let src=swap(base,"new URL('../public/prototype-v14.html',import.meta.url).href",JSON.stringify(new URL('../public/prototype-v17.html',import.meta.url).href));
src=swap(src,"new URL('./prototype-v13-contract.mjs',import.meta.url)",'new URL('+JSON.stringify(new URL('./prototype-v13-contract.mjs',import.meta.url).href)+')');
src=swap(src,"src+=`\n// ---- V14 ----","src=swap(src,\"assert.ok(run(\\\"profGo('couple')\\\").includes('data-go=\\\"P03\\\"'))\",\"assert.ok(run(\\\"profGo('couple')\\\").includes('data-v=\\\"couple\\\"'),'V17: my couple opens the profile tab, not a preview')\");\nsrc+=`\n// ---- V14 ----");
src=swap(src,'`\n// ---- V14 ----',`\`
// ---- V17 ----
// the tab is the profile page itself, with no copies of it
prepare('X01');let x01=run("SC.X01.render(cur().p,cur())");
assert.ok(x01.includes('profile-page')&&x01.includes('class="pc-name"'),'the tab shows the profile itself, hero first');
assert.ok(!x01.includes('me-card')&&!x01.includes('data-go="P03"'),'no profile card linking to a preview screen');
assert.ok(!x01.includes('Мои интересы')&&(x01.match(/data-act="myJarsAll"/g)||[]).length===2,'public interests appear once (one shelf: its «Все» and its «Ещё»)');assert.equal((x01.match(/<span>Галерея</g)||[]).length,1,'the gallery appears once');
assert.equal((x01.match(/data-act="privLens"/g)||[]).length,2,'one audience lens, on the private part only');
assert.ok(x01.includes('data-act="meOwner" data-v="couple"'),'with a couple, one switch «Я / Мы» instead of a second card');
assert.ok(text(x01).includes('Видишь только ты'),'owner-only list at the end');
assert.ok(!x01.includes('data-act="demoNote"')&&!x01.includes('data-act="likeProfile"'),'no demo buttons on your own page');
run("ACT.meOwner({dataset:{v:'couple'}})");assert.equal(run("cur().p.owner"),'couple');x01=run("SC.X01.render(cur().p,cur())");
assert.ok(x01.includes('data-go="Q01"')&&run("editableProfile()!==S.me"),'«Мы» is the couple page and edits the couple profile');
run("ACT.privLens({dataset:{v:'closed'}})");assert.ok(run("SC.X01.render(cur().p,cur())").includes('vault closed')||text(run("SC.X01.render(cur().p,cur())")).includes('без доступа её просто не видно'),'the lens shows what a person without access sees');
run("ACT.meOwner({dataset:{v:'me'}})");assert.equal(run("cur().p.owner"),undefined);
// links to «me» open the tab; P03 is only a preview of a draft or a proposal
assert.ok(run("profGo('me')").includes('openOwn')&&run("profGo('couple')").includes('data-v="couple"'));
prepare('P03',{});assert.ok(!run("SC.P03.render(cur().p,cur())").includes('demoNote'),'P03 without a draft is your page, not a demo');
prepare('P02');const pe=run("SC.P02.render(cur().p,cur())");assert.ok(!pe.includes('previewDraft'),'the editor has no second preview');assert.ok(!pe.includes('data-act="editJar"'),'interests are edited on the profile, not copied into the editor');
console.log('PASS V17: one profile page — the tab is the profile, one editor, one lens, «Я / Мы» switch');
\n// ---- V14 ----`);
src=src.replace("const tmp=path.join(os.tmpdir(),'feture-v14-contract-'","const tmp=path.join(os.tmpdir(),'feture-v14in17-contract-'");
const tmp=path.join(os.tmpdir(),'feture-v17-contract-'+process.pid+'.mjs');fs.writeFileSync(tmp,src);
try{await import(pathToFileURL(tmp).href);}finally{fs.rmSync(tmp,{force:true});}
