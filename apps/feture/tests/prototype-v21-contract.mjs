/* V21 keeps every V20 rule (and through it V13, V14, V18, V19): the V20 contract runs against the V21 file.
   Rules that V21 changes on purpose are swapped below with the reason, then the V21 checks run. */
import fs from 'node:fs';import { fileURLToPath, pathToFileURL } from 'node:url';
const base=fs.readFileSync(new URL('./prototype-v20-contract.mjs',import.meta.url),'utf8');
const swap=(s,a,b)=>{if(!s.includes(a))throw new Error('V20 contract changed: '+a);return s.replace(a,b);};
/* rules inside the older contracts the V20 one reads at run time (V13 via V14): swapped as those files are read */
const deepSwaps=[];const readFile=fs.readFileSync;fs.readFileSync=function(f,...r){let t=readFile.call(this,f,...r);const n=String(f?.href||f);if(typeof t==='string')for(const [file,x,y] of deepSwaps)if(n.endsWith('/'+file))t=swap(t,x,y);return t;};
/* V21 (PRF-001): a block belongs to the profile that made it — the couple loses the person (and the partner is told) only when the block is made as «Мы» */
deepSwaps.push(['prototype-v13-contract.mjs',`run("coupleProfile();S.pair.notifications={};social('couple').likesIn=[{p:'ari',t:1}];doBlock('ari')")`,`run("coupleProfile();S.pair.notifications={};social('couple').likesIn=[{p:'ari',t:1}];withActor('couple',()=>doBlock('ari'))")`]);
/* V21 (PPL-009): Q01 no longer has its own on/off switch — it links to the three-way mode in the couple's «Я → Видимость» (ACT.pairDating stays and is still checked) */
deepSwaps.push(['prototype-v13-contract.mjs',`prepare('Q01');run("coupleProfile()");assert.ok(run("SC.Q01.render({},cur())").includes('data-act="pairDating"'));`,`prepare('Q01');run("coupleProfile()");assert.ok(run("SC.Q01.render({},cur())").includes('data-act="pairVisOpen"'));`]);
let src=swap(base,"new URL('../public/prototype-v20.html',import.meta.url).href","new URL('../public/prototype-v21.html',import.meta.url).href");
/* V21 (SET-013) + V20 #1277: the gift term is three priced cards (not a select row); for a couple each card shows the price for two and «Цена за двоих» */
src=swap(src,`assert.ok(run("giftSheet().body").includes('<div class="li"><label class="selrow'),'the gift term is the shared select row inside a list row, like every other select');`,`{const b=run("giftSheet().body");assert.ok(b.includes('gift-plans')&&b.includes('data-act="giftPlan"')&&b.includes('23,98 €')&&text(b).includes('Цена за двоих'),'the gift term is priced cards; a couple pays for two');}`);
/* V21 (SET-013): «Подарить» first opens the same confirmation step as an own purchase; the charge runs on «Оплатить» (giftPayDo) */
src=swap(src,`await finish(run("ACT.giftPay(document.querySelector('test'))"));assert.ok(run("hasPremium('eva')&&hasPremium('tom')")`,`run("ACT.giftPay(document.querySelector('test'))");assert.ok(text(run("document.querySelector('#sheet')?.innerHTML||''")).includes('Получат оба'),'the confirmation names both partners');await finish(run("ACT.giftPayDo(document.querySelector('test'))"));assert.ok(run("hasPremium('eva')&&hasPremium('tom')")`);
/* V21 (FEED-007, FEED-006): the couple's empty post list has its own wording («У пары пока нет публикаций» + «Создать публикацию от пары»); V21 seeds demo posts into the couple's gallery, so the check clears them first */
src=swap(src,`prepare('F10',{owner:'couple'});run("coupleProfile();S.actor='couple'");{const h=text(run("SC.F10.render({owner:'couple'},cur())"));assert.ok(h.includes('Публикации пары')&&h.includes('Публикаций пока нет'),'an empty couple post list says so');}`,`prepare('F10',{owner:'couple'});run("coupleProfile();S.actor='couple';(S.galSeeded??=new Set()).add('own:couple');S.myPosts=S.myPosts.filter(x=>x.author!=='couple')");{const h=text(run("SC.F10.render({owner:'couple'},cur())"));assert.ok(h.includes('Публикации пары')&&h.includes('У пары пока нет публикаций'),'an empty couple post list says so');}`);
// the derived contract lives next to the others for one run, so its relative imports keep working
const tmp=new URL(`./.v21-run-${process.pid}.mjs`,import.meta.url);
fs.writeFileSync(tmp,src);
try{await import(tmp.href);}finally{fs.rmSync(fileURLToPath(tmp),{force:true});}
console.log('PASS V20 rules in V21');
