/* ============ BOOT ============ */
S=freshState((p=>p==='new'||p==='full'?p:'pair')(new URLSearchParams(location.search).get('persona')));
S.lang=(()=>{try{const l=new URLSearchParams(location.search).get('lang');if(l==='en'||l==='ru')return l;}catch(e){}return 'ru';})();
document.documentElement.lang=S.lang;
applyTheme(themePref());
initNav();
// keep auth layout single-column; root class follows the session
const _render=render;render=function(dir,keep){$('#root').classList.toggle('auth',!S.session);_render(dir,keep);};
// deep link: #D03 or #P01:mia opens a screen directly (review convenience)
const h=decodeURIComponent((location.hash||'').slice(1));
if(h){const [head,...tabs]=h.split(';'),[id,arg]=head.split(':');const tp={};tabs.forEach(x=>{const [k,v]=x.split('=');if(TAB_KEYS.includes(k)&&v)tp[k]=v;});
 if(SC[id]){if(SC[id].auth)qaGo(id,{});else qaGo(id,{...(arg?{id:arg}:{}),...tp});}else render('fade');}else render('fade');
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(themePref()==='auto')refresh();});

startNavHistory();
// ?long=1 — review with worst-case text lengths (same as «Длина текстов → Длинные» in the V10 panel)
try{if(new URLSearchParams(location.search).get('long')==='1')qaLong(true);}catch(e){}

try{if(new URLSearchParams(location.search).get('nospace')==='1')qaNosp(true);}catch(e){}
try{if(new URLSearchParams(location.search).get('hostile')==='1')qaNosp(true,'xss');}catch(e){}

// Best-effort web capture protection: print output, PrintScreen and background previews.
let captureShieldTimer;
function captureShield(on){document.body.classList.toggle('capture-shield',on);}
document.addEventListener('visibilitychange',()=>{clearTimeout(captureShieldTimer);captureShield(document.hidden);});
for(const type of ['keydown','keyup'])document.addEventListener(type,e=>{if(e.key!=='PrintScreen')return;e.preventDefault();clearTimeout(captureShieldTimer);captureShield(true);captureShieldTimer=setTimeout(()=>captureShield(document.hidden),1800);},true);
