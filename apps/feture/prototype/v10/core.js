/* ============ CORE: helpers, i18n, icons, router, sheets, toasts, network ============ */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
let S=null;
/** Prototype only: a new document resets seeds, drafts, timers and media together.
 * Production must use AppBase sign-out; this helper is not an auth adapter. */
function restartPrototype(){
 const url=new URL(location.href);
 url.searchParams.set('persona','new');url.searchParams.set('lang',S.lang);
 // A changed query forces a new document even on the second restart (hash alone doesn't).
 const restart=Number(url.searchParams.get('restart'));
 url.searchParams.set('restart',String(Number.isSafeInteger(restart)&&restart>=0?restart+1:1));
 url.hash='A01';location.replace(url.href);
}
const QA={offline:false,frame:'auto',seen:{},datingLive:true,autoApprove:true,maintenance:false};
/* QA «Мои запросы → Одобрять сразу»: whatever the user asks for or sends to review is answered yes after a short pause
   (qaApproveAll in qa.js). On by default in the prototype; can be turned off to inspect waiting states. */
function autoResolve(){if(!QA.autoApprove)return;const owner=S;setTimeout(()=>{if(S===owner)qaApproveAll();},1200);}
const L=(ru,en)=>S&&S.lang==='en'?en:ru;
const T=o=>o==null?'':typeof o==='string'?o:(o[S.lang]??o.ru??'');
/** Text that people type or that arrives from the server: drop control characters and invisible bidi overrides (U+202A–202E, 2066–2069, 200B/200E/200F, 2060–2064, FEFF —
 *  ZWJ/ZWNJ stay for emoji and Persian/Indic text) and cap runs of combining marks at 4 («Zalgo» stacks overlap neighbouring lines). The server must do the same — see
 *  docs/design-reference/V10-HOSTILE-INPUT-AUDIT-2026-10-16.md §6. */
const cleanText=s=>String(s??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]/g,'').replace(/(\p{M}{4})\p{M}+/gu,'$1');
const esc=s=>cleanText(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Last line of defence for HTML slots that are meant to hold inline text (sheet/dialog titles, bar titles, row labels, empty states).
 *  Callers must still esc() user text; this strips anything active that slips through: scripts, frames, styles, meta/base, forms,
 *  on* handlers, javascript:/data: URLs, fixed/absolute-positioned styles. The string is parsed in an inert <template>, so nothing runs
 *  while sanitising and stray closing tags («</h2>») cannot escape the slot. Real FetUre markup (icons, <b>, avatars, one <input>) is kept.
 *  QA can switch it off (FT_QA.sanitize(false)) to prove that callers escape by themselves. */
const SAFE_TAGS=new Set('B I STRONG EM U S SMALL MARK CODE SPAN BR P DIV LABEL INPUT SVG PATH CIRCLE RECT G LINE POLYLINE POLYGON ELLIPSE IMG A'.split(' '));
const SAFE_ATTR=/^(class|role|aria-[a-z-]+|type|inputmode|placeholder|value|name|autofocus|maxlength|autocomplete|enterkeyhint|viewbox|d|fill|stroke|stroke-[a-z]+|fill-rule|clip-rule|cx|cy|r|x|y|x1|x2|y1|y2|rx|ry|width|height|points|transform|opacity|alt|draggable|loading|lang|dir)$/i;
function safeInline(html){
 if(window.__NO_SANITIZE__||html==null||html==='')return html;
 html=String(html);if(html.indexOf('<')<0)return html;
 const t=document.createElement('template');t.innerHTML=html;
 const walk=n=>{[...n.children].forEach(e=>{
  const tag=e.tagName.toUpperCase();
  if(!SAFE_TAGS.has(tag)){if(/^(SCRIPT|STYLE|IFRAME|FRAME|OBJECT|EMBED|META|BASE|LINK|FORM|TEMPLATE|NOSCRIPT|TEXTAREA|SELECT|VIDEO|AUDIO|SOURCE|DETAILS|DIALOG|MATH)$/.test(tag)){e.remove();return;}walk(e);e.replaceWith(...e.childNodes);return;}
  for(const a of [...e.attributes]){const nm=a.name.toLowerCase(),v=a.value;
   if(nm==='id'&&tag==='INPUT'&&/^[\w-]{1,40}$/.test(v))continue;
   if(nm==='style'){if(/url\(|expression|@import|behavior|position\s*:\s*(fixed|absolute|sticky)|z-index|inset|-moz-binding/i.test(v))e.removeAttribute(a.name);continue;}
   if(nm==='src'&&tag==='IMG'){if(!/^(data:image\/|blob:|\/?images\/|\/images\/)/i.test(v))e.remove();continue;}
   if(nm==='href'&&tag==='A'){if(!/^(https?:\/\/|#)/i.test(v))e.removeAttribute(a.name);continue;}
   if(!SAFE_ATTR.test(nm))e.removeAttribute(a.name);}
  if(!e.isConnected&&!e.parentNode)return;
  if(tag==='INPUT'&&!/^(text|url|search|email)$/i.test(e.getAttribute('type')||'text'))e.setAttribute('type','text');
  if(tag==='IMG'&&!e.getAttribute('src'))e.remove();
  walk(e);});};
 walk(t.content);return t.innerHTML;}

const loc=()=>S.lang==='en'?'en-GB':'ru-RU';
/** pl(5,['событие','события','событий'],['event','events']) → "5 событий" */
function pl(n,ru,en,bare){
 let w;
 if(S.lang==='en') w=n===1?en[0]:en[1];
 else{const a=Math.abs(n)%100,b=a%10;w=a>10&&a<20?ru[2]:b>1&&b<5?ru[1]:b===1?ru[0]:ru[2];}
 return bare?w:`${n} ${w}`;
}
const opt=(group,id)=>{if(Array.isArray(id))return id.map(v=>opt(group,v)).filter(Boolean).join(', ');const o=(OPT[group]||[]).find(x=>x[0]===id);return o?(S.lang==='en'?o[2]:o[1]):'';};
const topic=id=>T(TOPICS[id])||id;
/** V7: relationship format is a multi-select; older single values still read fine */
const fmtList=x=>Array.isArray(x)?x:x?[x]:[];
const fmtText=(x,n=99)=>fmtList(x).slice(0,n).map(v=>opt('format',v)).filter(Boolean).join(', ');
const city=id=>T(CITY[id])||'';

/* ---------- icons (24px grid, one stroke family) ---------- */
const sv=(d,w)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w||2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I={at:sv('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M15.5 8v7h2"/>'),
 back:sv('<path d="M15 18l-6-6 6-6"/>',2.4), chev:sv('<path d="M9 6l6 6-6 6"/>',2.2), down:sv('<path d="M6 9l6 6 6-6"/>',2.2), close:sv('<path d="M6 6l12 12M18 6L6 18"/>',2.4),
 feed:sv('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M3.5 14l4.5-4 5 4.5 3-2.5 4.5 3.5"/>'),
 people:sv('<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.4 3.4 0 0 1 0 6.8M18 14.2c2.2.6 3.5 2.6 3.5 5.8"/>'),
 groups:sv('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.7 2.6 14.3 0 17M12 3.5c-2.6 2.7-2.6 14.3 0 17"/>'),
 chat:sv('<path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.2-4A8 8 0 1 1 20 11.5z"/>'),
 me:sv('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7"/>'),
 heart:sv('<path d="M12 20s-7.5-4.6-7.5-10.4A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.3C19.5 15.4 12 20 12 20z"/>',2.1),
 heartf:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.4A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.3C19.5 15.4 12 20 12 20z" fill="currentColor"/></svg>',
 x:sv('<path d="M6 6l12 12M18 6L6 18"/>',2.6), undo:sv('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',2.2),redo:sv('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',2.2),
 fbold:sv('<path d="M7 5h5.5a3.5 3.5 0 0 1 0 7H7zM7 12h6.5a3.5 3.5 0 0 1 0 7H7z"/>',2.4),fital:sv('<path d="M10 5h8M6 19h8M14 5l-4 14"/>'),
 fstrike:sv('<path d="M4 12h16M16.5 7.6C16 6 14.3 5 12 5c-2.8 0-4.5 1.4-4.5 3.3 0 .9.4 1.7 1.2 2.2M8 16.2C8.6 18 10.2 19 12.3 19c2.8 0 4.7-1.4 4.7-3.5 0-.7-.2-1.3-.6-1.8"/>'),
 fhead:sv('<path d="M4 7V5h10v2M9 5v14M7 19h4M14 12v-1.5h7V12M17.5 10.5V19M16 19h3"/>'),
 flist:sv('<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',2.2),
 folist:sv('<path d="M10 6h10M10 12h10M10 18h10M4 4.5h1.5V9M4 9h3M4 14.6c.4-.6 1-1 1.7-1 .9 0 1.5.6 1.5 1.3 0 1.2-3.2 2-3.2 4.1h3.3"/>',1.8),
 fquote:sv('<path d="M6 17c2-1 3-2.7 3-5V7H4.5v5H9M15 17c2-1 3-2.7 3-5V7h-4.5v5H18"/>'),
 lock:sv('<rect x="5" y="10.5" width="14" height="10.5" rx="3"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',2.1),
 unlock:sv('<rect x="5" y="10.5" width="14" height="10.5" rx="3"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.8-1.2"/>',2.1),
 eye:sv('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
 eyeoff:sv('<path d="M4 4l16 16M9.9 5.7A9.6 9.6 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-3 3.8M6.3 7.4A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
 globe:sv('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.7 2.6 14.3 0 17M12 3.5c-2.6 2.7-2.6 14.3 0 17"/>'),
 check:sv('<path d="M5 12.5l4.5 4.5L19 7.5"/>',2.6), warn:sv('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',2.1),
 info:sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v6M12 8h.01"/>',2.2), alert:sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v6.5M12 16.5h.01"/>',2.2),
 okc:sv('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/>',2.2),
 filter:sv('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>',2.1),
 bell:sv('<path d="M6 16v-5a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
 belloff:sv('<path d="M4 4l16 16M8.2 5.5A6 6 0 0 1 18 11v3.5M6 11v6l-1.5 2h12"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
 gear:sv('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',1.8),
 plus:sv('<path d="M12 5v14M5 12h14"/>',2.4), send:sv('<path d="M4.5 12l15-7.5-5.5 15-2.5-6z"/>',2.1),
 search:sv('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',2.2),
 pin:sv('<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
 verified:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9L3.2 15.8l.9-2.9-.9-2.9 2.5-1.7.9-2.9 3 .2z" fill="currentColor"/><path d="M8.5 12.2l2.3 2.3 4.7-4.7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
 share:sv('<path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5"/>'),
 bolt:sv('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),spark:sv('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>'),
 couple:sv('<circle cx="8.5" cy="9" r="3"/><circle cx="15.5" cy="9" r="3"/><path d="M3 19c.5-3 2.7-5 5.5-5 1.4 0 2.6.5 3.5 1.3.9-.8 2.1-1.3 3.5-1.3 2.8 0 5 2 5.5 5"/>'),
 image:sv('<rect x="3.5" y="4.5" width="17" height="15" rx="4"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 15.5l-5-4.5-8 8"/>'),
 book:sv('<path d="M5 4.5h10a4 4 0 0 1 4 4v11H9a4 4 0 0 1-4-4z"/><path d="M5 15.5a4 4 0 0 1 4-4h10"/>'),
 test:sv('<rect x="5" y="3.5" width="14" height="17" rx="3"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
 shield:sv('<path d="M12 3l8 3v6c0 4.6-3.4 8-8 9-4.6-1-8-4.4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
 crown:sv('<path d="M4 18h16M4.5 15L3 7l5 3.5L12 5l4 5.5L21 7l-1.5 8z"/>'),
 moon:sv('<path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a7 7 0 0 0 10 10z"/>'), sun:sv('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
 clock:sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'), timer:sv('<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M9.5 2.5h5"/>'),
 flag:sv('<path d="M5 21V4.5M5 4.5h11l-2 4 2 4H5"/>'), more:sv('<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',2.2),
 cal:sv('<rect x="3.5" y="5" width="17" height="15.5" rx="4"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
 calplus:sv('<rect x="3.5" y="5" width="17" height="15.5" rx="4"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v6M9.5 15.5h5"/>'),
 bookmark:sv('<path d="M6.5 4h11v16.5l-5.5-4-5.5 4z"/>'), bookmarkf:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4h11v16.5l-5.5-4-5.5 4z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
 edit:sv('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'), trash:sv('<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5l1-12.5M9.5 7V4.5h5V7"/>'),
 archive:sv('<rect x="3.5" y="4" width="17" height="5" rx="1.5"/><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4"/>'),
 block:sv('<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>'), logout:sv('<path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4M10 16l-4-4 4-4M6 12h10"/>'),
 camera:sv('<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.5"/>'),
 doc:sv('<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 12h6M9 16h6"/>'),
 link:sv('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
 ticket:sv('<path d="M3.5 8.5V7a1.5 1.5 0 0 1 1.5-1.5h14A1.5 1.5 0 0 1 20.5 7v1.5a2.5 2.5 0 0 0 0 5V15a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 15v-1.5a2.5 2.5 0 0 0 0-5z"/><path d="M14 6v10" stroke-dasharray="2 2.5"/>'),
 video:sv('<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10.5l5-3v9l-5-3"/>'),
 mic:sv('<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3"/>'),
 poll:sv('<path d="M5 20V11M12 20V4M19 20v-6"/>',2.4), tag:sv('<path d="M3.5 12.5V6a1.5 1.5 0 0 1 1.5-1.5h7.5l8 8-9 9z"/><circle cx="8" cy="8" r="1.4"/>'),
 wifioff:sv('<path d="M4 4l16 16M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4.3-2.4M19 13a10 10 0 0 0-2.7-1.9M2 9.5a15 15 0 0 1 4.6-2.9M22 9.5A15 15 0 0 0 11 5.6"/><path d="M12 20h.01"/>'),
 compass:sv('<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'), map:sv('<path d="M3.5 6.5l5.5-2.5 6 2.5 5.5-2.5v13.5l-5.5 2.5-6-2.5-5.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>'),
 users3:sv('<circle cx="12" cy="8" r="3"/><circle cx="5" cy="10" r="2.2"/><circle cx="19" cy="10" r="2.2"/><path d="M7 19.5c0-2.9 2.2-5 5-5s5 2.1 5 5M1.8 18c.3-1.9 1.6-3.2 3.2-3.2M22.2 18c-.3-1.9-1.6-3.2-3.2-3.2"/>'),
 key:sv('<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16.5 6.5l2 2M14.5 8.5l2 2"/>'),
 mail:sv('<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="M4 7l8 6 8-6"/>'), phone:sv('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
 download:sv('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>'), help:sv('<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2.2-2.4 3.7M12 17h.01"/>'),
 attach:sv('<path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4l7.5-7.5"/>'),
 hist:sv('<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5"/><path d="M3.5 4v4.5H8M12 8v4.5l3 2"/>'),
 ext:sv('<path d="M14 4.5h5.5V10M19.5 4.5L11 13M17 14v4.5A1.5 1.5 0 0 1 15.5 20h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10"/>'),
 google:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>',
 apple:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.4.8 2.2-1.3 3.1-2.5c1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM13.9 5c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5z"/></svg>',
};
const ic=(n,s)=>s?I[n].replace('<svg',`<svg style="width:${s}px;height:${s}px"`):I[n];

/* ---------- media ---------- */
const IMG=n=>typeof n==='string'&&/^(blob:|data:image\/|\/images\/)/.test(n)?n:(window.FT_IMG&&window.FT_IMG[n])||`images/profile-${n}-45.webp`;
/* V7: the test mark is gone. Three vector options for the owner (QA drawer → Логотип); A is the default. */
const LOGOS={
 a:`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><defs><linearGradient id='a' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#FF4F6D'/><stop offset='1' stop-color='#C2134A'/></linearGradient><linearGradient id='b' x1='0' y1='1' x2='1' y2='0'><stop offset='0' stop-color='#6A52F0'/><stop offset='1' stop-color='#C3B3FF'/></linearGradient></defs><rect width='120' height='120' rx='32' fill='#1E1219'/><circle cx='47' cy='60' r='23' fill='none' stroke='url(#a)' stroke-width='12'/><circle cx='73' cy='60' r='23' fill='none' stroke='url(#b)' stroke-width='12'/><path d='M51 37.4A23 23 0 0 1 65.6 45.2' fill='none' stroke='#1E1219' stroke-width='17'/><path d='M51 37.4A23 23 0 0 1 65.6 45.2' fill='none' stroke='url(#a)' stroke-width='12'/></svg>`,
 b:`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#FF3355'/><stop offset='1' stop-color='#7A1236'/></linearGradient></defs><rect width='120' height='120' rx='32' fill='url(#g)'/><path d='M38 30h44v15H54v12h24v15H54v18H38z' fill='#fff'/><circle cx='82' cy='84' r='9' fill='#B9A6FF'/></svg>`,
 c:`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' rx='32' fill='#F6EDF3'/><circle cx='48' cy='60' r='28' fill='#FF3355' fill-opacity='.9'/><circle cx='72' cy='60' r='28' fill='#5C47D6' fill-opacity='.85'/><path d='M60 74c-7-5-11-9-11-14a5.5 5.5 0 0 1 11-1 5.5 5.5 0 0 1 11 1c0 5-4 9-11 14z' fill='#fff'/></svg>`};
const LOGO=()=>'data:image/svg+xml,'+encodeURIComponent(LOGOS[QA.logo||'a']);
const plate=(key,icon)=>`<div class="plate" style="${PL[key]||PL.rose};position:absolute;inset:0">${icon?`<span class="pi">${I[icon]}</span>`:''}</div>`;
function person(id){if(id==='couple')return S.pair?.status==='active'?ownedAsPerson(S.ui.couplePreview||coupleProfile()):S.pair?{name:T(S.pair.name),pair:true,members:['me',S.pair.with],jars:[],photo:null}:null;if(id==='me')return meAsPerson();return PEOPLE[id];}
/* one public identity — the nickname (no separate display name) */
function pname(id){if(id==='couple'&&!activePair())return T(S.pair?.name)||L('Совместный профиль недоступен','Couple profile unavailable');if(id==='couple')return T(S.ui.couplePreview?.name||S.pair?.profile?.name||S.pair?.name)||L('Пара','Couple');if(id==='me')return S.me.nick||L('Ты','You');const p=PEOPLE[id];if(!p)return L('Участник','Member');return p.pair&&S.lang!=='en'?p.nameRu:p.name;}
const PUBLIC_VIS={pron:'public',seek:'public',gender:'public',orient:'public',format:'public',status:'public',role:'granted'};
const requiresDiscoveryPhoto=m=>!!m.dating&&m.datingVisible!==false;
/** a profile field as another member sees it; S.ui.viewGrant = rendering for someone with private-profile access */
/** the main profile shows only what is placed in it; data placed in the private part is shown there (privFieldRows), never in both */
function publicField(m,k){const v=m.vis?.[k]??PUBLIC_VIS[k]??'public';return v==='public'?m[k]:Array.isArray(m[k])?[]:null;}
const fieldLayer=(m,k)=>m.vis?.[k]??PUBLIC_VIS[k]??'public';
function ownedAsPerson(m){return{photo:m.photo,bio:m.bio,city:m.city,dating:!!m.dating,socialLikes:!!m.socialLikes,pair:!!m.pair,members:m.pair?[...m.members]:undefined,pv:m.photoCheck==='ok',premium:!!m.premium,name:m.pair?T(m.name):m.nick,age:m.showAge===false?null:ageOf(m.dob),location:m.location?.coords,pron:publicField(m,'pron'),gender:publicField(m,'gender'),orient:publicField(m,'orient'),format:publicField(m,'format'),status:publicField(m,'status'),role:publicField(m,'role'),seek:publicField(m,'seek')||[],verified:m.ageCheck==='ok',online:true,jars:(m.jars||[]).filter(j=>j.vis==='public')};}
function meAsPerson(){return ownedAsPerson(S.ui.profilePreview||S.me);}
function coupleProfile(){const P=S.pair;if(P?.status!=='active')return null;P.id??='pair_'+P.with+'_'+P.since;if(!P.profile)P.profile={pair:true,members:['me',P.with],name:{...P.name},nick:'couple',bio:P.desc||{ru:'',en:''},privText:{ru:'',en:''},photos:[],photo:null,city:null,pron:null,gender:[],orient:[],role:[],status:'couple',format:[],seek:[],vis:{...PUBLIC_VIS},jars:[],history:[],media:[],requestsFrom:'all',socialLikes:false,dating:false,datingVisible:false,showAge:false};return P.profile;}
const pairMember=()=>S.pairMember==='partner'?(S.pair?.with||S.pairInvite?.nick):'me';
function editableProfile(r=cur()){if(r.p?.owner!=='couple')return S.me;const P=S.pair;if(P?.status!=='active')return null;coupleProfile();P.revision??=0;P.draftBase??=P.revision;if(!P.draft){P.draft=structuredClone(P.profile);P.draftBy=pairMember();P.draftLease=(P.draftLease||0)+1;}return P.draftBy&&P.draftBy!==pairMember()?structuredClone(P.draft):P.draft;}
function coupleWritable(lease){const P=S.pair;const ok=activePair()&&(!P.draftBy||P.draftBy===pairMember())&&(lease==null||lease===(P.draftLease||0));if(!ok)toast(L('Черновик занят другим участником или изменился. Вернись в профиль пары. Введённые данные остаются здесь.','The draft belongs to the other partner or changed. Return to the couple profile. Your input stays here.'),{type:'warn'});return ok;}
function markCoupleDraft(fromEditor=false){const P=S.pair;if(!P?.draft||!coupleWritable())return;P.draftVersion=(P.draftVersion||0)+1;if(P.proposal?.status==='pending')P.proposal.status='superseded';if(!fromEditor)for(const parent of stack())if(parent.p.owner==='couple'&&parent.pairLease===(P.draftLease||0))parent.pairVersion=P.draftVersion;}
/* Compare user-editable content, with defaults and stable object/set ordering. */
function normalizedCouple(p){if(!p)return null;const n=structuredClone(p);delete n.history;delete n.photo;delete n.requests;for(const k of ['gender','orient','role','format','seek'])n[k]=[...(n[k]||[])].sort();n.privOn=n.privOn??(!!T(n.privText)||privMedia(n).length>0);n.dating=!!n.dating;n.datingVisible=!!n.datingVisible;n.socialLikes=n.socialLikes!==false;n.showAge=n.showAge!==false;n.requestsFrom=n.requestsFrom||'all';n.city=n.city||null;n.pron=n.pron||null;for(const k of ['photos','media','jars'])n[k]??=[];const norm=v=>typeof v==='string'?v.trim().normalize('NFC'):Array.isArray(v)?v.map(norm):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,norm(v[k])])):v;return norm(n);}
const coupleDraftChanged=()=>!!S.pair?.draft&&JSON.stringify(normalizedCouple(S.pair.draft))!==JSON.stringify(normalizedCouple(S.pair.profile));
const editedText=(prior,value)=>T(prior).trim()===value.trim()?structuredClone(prior):{ru:value.trim(),en:value.trim()};
function submitCoupleDraft(){const P=S.pair;if(P?.status!=='active'||!P.draft||P.proposal?.status==='pending')return false;if(!coupleWritable())return false;if(!coupleDraftChanged()){toast(L('Нет изменений для согласования','No changes to approve'));return false;}const by=pairMember();P.revision??=0;
 if(P.draftBase!==P.revision){toast(L('Профиль уже изменился. Открой актуальную версию перед отправкой.','The profile changed. Open the current version before submitting.'),{type:'warn'});return false;}
 const q=P.proposal={id:'pv'+Date.now()+'_'+(P.draftVersion||0),by,field:'profile',text:structuredClone(P.draft),base:P.revision,draftVersion:P.draftVersion||0,status:'pending',t:Date.now()};
 if(pairTrusted())return commitCoupleProposal(P,by,q.id,true);pairNotify('proposal',q.id,{go:['Q01']});return true;}
function commitCoupleProposal(P,reviewer=pairMember(),expected=P?.proposal?.id,delegated=false){if(P!==S.pair||P?.status!=='active'||!P.proposal)return false;const q=P.proposal;
 if(!q.id||(!realMembers('couple').includes(reviewer)||(q.status!=='pending')||q.id!==expected||(q.by===reviewer&&!(delegated&&pairTrusted()&&reviewer===pairMember()))||q.base!==(P.revision||0)||q.draftVersion!==(P.draftVersion||0)))return false;
 if(q.field==='profile'){P.profile=structuredClone(q.text);P.name={...P.profile.name};P.desc=P.profile.bio;P.revision=(P.revision||0)+1;P.draftLease=(P.draftLease||0)+1;if((P.draftVersion||0)===(q.draftVersion||0))delete P.draft;P.draftBase=P.revision;}else P[q.field||'desc']=q.text;
 P.proposal=null;pairNotify('profileApproved',q.id||String(q.t),{go:['Q01']});return true;}
function pairNotify(type,key,extra={}){const P=S.pair;if(!P)return;P.notifications??={};for(const recipient of ['me',P.with]){const list=P.notifications[recipient]??=[];const id='pair_'+type+'_'+key+'_'+recipient;if(list.some(n=>n.id===id))continue;const n={id,type:'pair',pairEvent:type,pairName:T(P.name),to:recipient,t:Date.now(),read:false,...extra};list.unshift(n);if(recipient===pairMember())S.notifs.unshift(n);}}

/* Social author: one session choice; owned couple state extends the existing pair. */
const authorId=()=> 'me';
const datingActor=()=>S.datingActor==='couple'&&activePair()?'couple':'me';
const accessActor=()=>cur()?.id==='P01'?(cur().p.actor||'me'):actionAuthor();
const composeActor=()=>cur()?.id==='F09'?(cur().p.draft?.author||'me'):(cur()?.author||'me');
const activePair=()=>S.pair?.status==='active';
// Explicit surface contexts; the social network always acts as the signed-in person.
const actionAuthor=()=>{if(S.ui?.actOverride)return S.ui.actOverride;const r=cur();if(!r)return 'me';if(['F07','F09'].includes(r.id))return composeActor();if(['D03','D04','D09','D12'].includes(r.id))return datingActor();if(r.id==='Q05'||r.id==='P07'&&r.p.owner==='couple')return 'couple';if(['H02','H03','H04','H05','P08','P05'].includes(r.id))return r.p.actor||'me';return 'me';};
/* explicit acting identity for one call (a like sent from a profile page uses the remembered dating mode, not the route) */
function withActor(a,fn){S.ui||(S.ui={});const prev=S.ui.actOverride;S.ui.actOverride=a;try{return fn();}finally{S.ui.actOverride=prev;}}
const canAct=(operation,actor='me')=>authorAllowed(actor)&&(['react','comment','follow','community','event'].includes(operation)?actor==='me':operation==='dating'?actor!=='couple'||!!coupleProfile()?.dating:true);
const authorProfile=(id=actionAuthor())=>id==='couple'?coupleProfile():S.me;
function social(id=actionAuthor()){
 if(id==='me')return S;
 const p=S.pair;if(!p)return null;
 return p.social??={follows:new Set(),likesIn:[],likesOut:[],matches:[],reqIn:[],reqOut:[],sharedByMe:[],threads:{},archived:new Set(),muted:new Set(),decided:{},history:[],filters:{dating:structuredClone(S.filters.dating)}};
}
const realMembers=id=>id==='me'?['me']:id==='couple'?(S.pair?['me',S.pair.with]:[]):PEOPLE[id]?.pair?[...(PEOPLE[id].members||[])]:[id];
const relatedIdentity=id=>realMembers(authorId()).some(m=>realMembers(id).includes(m));
const ownedIdentity=id=>id==='me'||id==='couple'&&activePair();
function authorAllowed(id=actionAuthor()){return !!S.session&&(id==='me'&&pairMember()==='me'||id==='couple'&&activePair());}
function authorGuard(id=actionAuthor()){if(authorAllowed(id))return true;toast(L('Совместный профиль отключён. Выбери личный профиль — черновик сохранён.','The couple profile is inactive. Choose your personal profile — your draft is kept.'),{type:'warn'});return false;}
const authorTicket=(id=actionAuthor())=>({id,state:S,session:S.session,member:pairMember(),pair:S.pair,safety:S.pair?.safetyEpoch||0,datingEpoch:S.datingEpoch||0,dating:cur()?.id==='D03'});
const validAuthor=t=>S===t.state&&S.session===t.session&&pairMember()===t.member&&(!t.dating||(S.datingEpoch||0)===t.datingEpoch)&&authorAllowed(t.id)&&(t.id!=='couple'||S.pair===t.pair&&(S.pair.safetyEpoch||0)===t.safety);
function authorKind(){const r=cur();return ['F07','F09'].includes(r?.id)?'compose':'dating';}
const kindActor=k=>k==='compose'?composeActor():datingActor();
/** the other identity's unseen likes/requests: the lists stay separate, so a dot tells you something waits there */
function otherActorWaiting(){if(!activePair())return 0;const o=datingActor()==='couple'?'me':'couple',d=social(o);return d?(d.likesIn.length+d.reqIn.filter(x=>x.status==='new').length):0;}
function authorPicker(fixed){const r=cur(),dating=r?.id==='D03',compose=['F07','F09'].includes(r?.id);if(!dating&&!compose)return '';if(!activePair()&&!fixed)return '';const id=fixed||(dating?datingActor():composeActor());const immutable=!!fixed||r.id==='F09';const w=dating&&!immutable?otherActorWaiting():0;return `<span class="author-picker" data-author-picker><button type="button" class="author-trigger" ${immutable?'disabled':`data-act="authorMenu" data-k="${dating?'dating':'compose'}"`} aria-label="${dating?L('Знакомиться как','Meet as'):L('Опубликовать как','Post as')}: ${esc(pname(id))}${w?`. ${L('Ждёт у другого профиля','Waiting on the other profile')}: ${w}`:''}" ${immutable?'':'aria-haspopup="menu"'}>${av(id,'xs')}<span>${esc(pname(id))}</span>${w?`<i class="ap-dot">${w}</i>`:''}${immutable?'':I.down}</button></span>`;}
/** one line under a profile's actions: who sends the like, and what the other identity has already done */
function profileActorLine(id,act){if(!activePair()||id==='me'||id==='couple')return '';const other=act.a==='me'?'couple':'me',os=withActor(other,()=>({liked:social(other)?.likesOut.some(l=>l.p===id),match:isMatch(id,other)}));
 const oname=pname(other);
 const main=act.why==='coupleOff'?L('Анкета пары выключена — отправится от тебя','The couple profile is off — sent as you'):act.why==='solo'?L('Парой — только в знакомствах — отправится от тебя','Couples like in Discover only — sent as you'):act.a==='couple'?L(`От пары ${esc(pname('couple'))}`,`As ${esc(pname('couple'))}`):'';
 const done=os.match?L(`${esc(oname)}: совпадение`,`${esc(oname)}: matched`):os.liked?L(`${esc(oname)}: симпатия отправлена`,`${esc(oname)}: like sent`):'';
 if(!main&&!done)return '';
 return `<p class="actor-line">${main?`<span>${main}</span> <button type="button" class="linkbtn" data-act="authorMenu" data-k="dating">${L('Изменить','Change')}</button>`:''}${done?`<small>${done}</small>`:''}</p>`;}
/** who sends a like from this profile: the remembered dating mode, narrowed by what the target and the couple allow */
function likeActor(id){const t=PEOPLE[id],want=datingActor();if(want==='couple'){if(!canAct('dating','couple')||!authorProfile('couple')?.dating)return{a:'me',why:'coupleOff'};if(!t?.dating||relatedFor('couple',id))return{a:'me',why:'solo'};return{a:'couple'};}return{a:'me'};}
function canLikeFrom(actor,id){const t=PEOPLE[id];if(!t)return false;if(actor==='couple')return !!t.dating;if(t.pair)return !!t.dating;return !!(t.dating||t.socialLikes);}

let authorMenuAction=null,authorMenuOpener=null;
function closeAuthorMenu(){authorMenuAction=null;const menu=$('#authorMenu');if(!menu?.remove)return false;menu.remove();$$('[data-act="authorMenu"]').forEach(el=>el.setAttribute('aria-expanded','false'));syncModal();if(authorMenuOpener?.isConnected)authorMenuOpener.focus({preventScroll:true});authorMenuOpener=null;return true;}

/* Patch only author controls and action labels: keep editors, media, sheets and the deck DOM alive. */
function paintAuthor(){
 $$('[data-author-picker]:not([data-fixed-author])').forEach(el=>el.outerHTML=authorPicker());
 $$('[data-act="follow"],[data-act="flwToggle"]').forEach(el=>{const on=social()?.follows.has(el.dataset.v);el.setAttribute('aria-pressed',!!on);el.innerHTML=on?L('Отписаться','Unfollow'):L('Подписаться','Follow');});
 $$('.p-acts [data-act="likeProfile"],.p-acts [data-act="unlikeP"],.p-acts [data-act="openChat"]').forEach(el=>{const id=el.dataset.v,on=social()?.likesOut.some(l=>l.p===id),match=isMatch(id);el.dataset.act=match?'openChat':on?'unlikeP':'likeProfile';el.setAttribute('aria-pressed',!!on);el.innerHTML=match?I.chat+L('Написать','Message'):on?I.heartf+L('Симпатия','Liked'):I.heart+L('Нравится','Like');});
 $$('[data-couple-request]').forEach(el=>el.hidden=actionAuthor()!=='couple');
 $$('[data-act="reqAccess"]').forEach(el=>{const pending=social()?.reqOut.some(x=>x.p===el.dataset.v&&x.status==='pending');el.setAttribute('aria-label',pending?L('Запрос отправлен','Request sent'):L('Запросить доступ','Request access'));if(el.classList.contains('ibtn'))el.innerHTML=pending?I.clock:I.key;});
 $$('[data-private-context]').forEach(el=>el.innerHTML=privSection(el.dataset.privateContext));
 $$('[data-deck-private]').forEach(el=>el.innerHTML=veilBlock(el.dataset.deckPrivate));
 $$('#deck [data-act="decide"][data-v="1"]').forEach(el=>{const id=$('#deck .pc.top')?.dataset.id;el.setAttribute('aria-pressed',!!id&&social().likesOut.some(l=>l.p===id));});
 $$('[data-author-reason]').forEach(el=>{const reason=cur().p.id&&['C06','C07','C03'].includes(cur().id)?communityAuthorReason(cur().id==='C06'?S.discussions.find(d=>d.id===cur().p.id)?.c:cur().p.id):'';el.innerHTML=esc(reason);el.hidden=!reason;$$('[data-act="shareCommunityPartner"]').forEach(b=>b.hidden=!activePair()||actionAuthor()!=='couple'||!reason);});
 if(cur().id==='P08'&&!receivedGrant(cur().p.id))refresh();
 $$('[data-dating-author-reason]').forEach(el=>{el.hidden=actionAuthor()!=='couple'||!!authorProfile().dating;el.innerHTML=el.hidden?'':`${L('Знакомства пары выключены.','Couple dating is off.')} <button class="btn text auto" data-go="P02" data-p='{"owner":"couple"}'>${L('Настроить','Edit profile')}</button>`;});
 if(cur().id==='D03'&&(cur().p.sub||'discover')==='discover'&&!$('#deck')){refresh();return;}
 if(['P07','P10'].includes(cur().id)||cur().id==='D03'&&['likes','requests'].includes(cur().p.sub))refresh();
}

/** avatar: photo → img; pair → two plates; else initials plate */
function av(id,cls='',variant=0){
 const p=person(id);let inner,st='',k='';
 if(!p)inner=plate('night');
 else if(p.pair){/* a pair is always two overlapping circles — member photo, else its initial on the member's plate (never one shared monogram) */
  const nm=(p.name||'').split(/\s*(?:&|и|and)\s*/).filter(Boolean);
  const half=i=>{const m=p.members?.[i],q=m&&person(m),ph=q?.photo||(!q?p.photo:null);
   if(ph)return `<span class="avh"><img src="${IMG(ph)}" alt="" loading="lazy" draggable="false" ${!q?`style="transform:scale(1.7);transform-origin:${i?'72% 40%':'28% 40%'}"`:''}></span>`;
   const pl=q?.plate||(i?p.plate2||p.plate:p.plate)||'night',nameI=q?.name||nm[i]||'?';
   return `<span class="avh ini">${plate(pl)}<b>${esc([...String(nameI)][0]||'?')}</b></span>`;};
  return `<span class="av pair ${cls}">${half(0)}${half(1)}</span>`;}
 else if(p.photo)inner=`<img src="${IMG(p.photo)}" alt="" loading="lazy" draggable="false" style="${variant?'transform:scale(1.35);object-position:50% 25%':''}">`;
 else{k='ini';inner=`${plate(p.plate||'night')}<b style="position:relative">${esc((p.name||'?')[0])}</b>`;}
 // online: the dot sits on the circle's edge, so the picture is clipped by an inner circle, not by the avatar itself
 if(/(^|\s)on(\s|$)/.test(cls))return `<span class="av ${k} ${cls}"><span class="av-in ${k}" ${st?`style="${st}"`:''}>${inner}</span></span>`;
 return `<span class="av ${k} ${cls}" ${st?`style="${st}"`:''}>${inner}</span>`;
}
/** Photos of a person. Prototype people have one licensed image each, so extra photos are distinct crops of it
 *  (stand-ins for a real 2–6 photo gallery). My own photos are real local files. */
const CROPS=['','transform:scale(1.45);transform-origin:50% 28%','transform:scale(1.2) translateX(-7%);filter:saturate(1.15) hue-rotate(-8deg)','transform:scale(1.7);transform-origin:40% 60%','transform:scale(1.3) translateX(6%);filter:contrast(1.08) saturate(.9)','transform:scale(2);transform-origin:55% 35%'];
function photoCount(id){if(id==='me'||id==='couple'){const m=id==='couple'?(S.ui.couplePreview||coupleProfile()):(S.ui.profilePreview||S.me);return Math.max(1,(m.photos||[]).length);}const p=person(id);return p?.photo?Math.min(6,p.nph||1):1;}
function photoItems(id){if(id==='me'||id==='couple'){const m=id==='couple'?(S.ui.couplePreview||coupleProfile()):(S.ui.profilePreview||S.me);return (m.photos||[]).map(ph=>({type:'image',src:IMG(ph)}));}const p=person(id);if(!p?.photo)return [];return Array.from({length:photoCount(id)},(_,i)=>({type:'image',src:IMG(p.photo),style:CROPS[i%6]}));}
function photoBars(id,ix){const n=photoCount(id);return n>1?`<div class="pc-bars" aria-label="${L(`Фото ${ix+1} из ${n}`,`Photo ${ix+1} of ${n}`)}">${Array.from({length:n},(_,i)=>`<i class="${i===ix?'on':''}"></i>`).join('')}</div>`:'';}
/** step through photos; returns false at the first/last photo (caller can nudge) */
function stepPhoto(id,d){S.ui.ph=S.ui.ph||{};const n=photoCount(id),i=(S.ui.ph[id]||0)+d;if(i<0||i>=n)return false;S.ui.ph[id]=i;return true;}
/** blurred backdrop for a whole-photo frame (profile hero): same picture, no framing transform */
function photoBg(id,v=0){let src=null;if(id==='me'||id==='couple'){const m=id==='couple'?(S.ui.couplePreview||coupleProfile()):(S.ui.profilePreview||S.me);const ph=(m.photos||[])[v]??m.photo;if(ph!=null)src=IMG(ph);}else{const p=person(id);if(p?.photo)src=IMG(p.photo);}return src?`<img class="mbg" src="${src}" alt="" aria-hidden="true" draggable="false">`:'';}
function bigPhoto(id,v=0){
 const p=person(id);
 if(id==='me'||id==='couple'){const m=id==='couple'?(S.ui.couplePreview||coupleProfile()):(S.ui.profilePreview||S.me);const ph=(m.photos||[])[v]??m.photo;if(ph!=null)return `<img src="${IMG(ph)}" alt="${esc(pname(id))}" draggable="false">`;return plate('rose','me');}
 if(p&&p.photo)return `<img src="${IMG(p.photo)}" alt="${esc(pname(id))}" draggable="false" style="${CROPS[v%6]}">`;
 const key=p&&p.pair?[p.plate,p.plate2,p.plate][v%3]:(p&&p.plate)||'rose';
 return plate(key);
}
function ageOf(dob){if(!dob)return null;const d=new Date(dob+'T00:00:00');const n=new Date(NOW);let a=n.getFullYear()-d.getFullYear();const m=n.getMonth()-d.getMonth();if(m<0||(m===0&&n.getDate()<d.getDate()))a--;return a;}

/* ---------- time formatting ---------- */
const USER_TZ=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
const F={
 date:(ts,o={})=>new Intl.DateTimeFormat(loc(),{day:'numeric',month:'short',timeZone:o.tz||USER_TZ,...o.x}).format(ts).replace('.',''),
 day:(ts,tz)=>new Intl.DateTimeFormat(loc(),{weekday:'short',day:'numeric',month:'long',timeZone:tz||USER_TZ}).format(ts),
 time:(ts,tz)=>new Intl.DateTimeFormat(loc(),{hour:'2-digit',minute:'2-digit',timeZone:tz||USER_TZ}).format(ts),
 dnum:(ts,tz)=>new Intl.DateTimeFormat(loc(),{day:'numeric',timeZone:tz||USER_TZ}).format(ts),
 mon:(ts,tz)=>new Intl.DateTimeFormat(loc(),{month:'short',timeZone:tz||USER_TZ}).format(ts).replace('.',''),
 rel(ts){const d=(Date.now()-ts)/1000;
  if(d<60)return L('только что','just now');
  if(d<3600){const m=Math.round(d/60);return S.lang==='en'?`${m} min ago`:`${m} мин назад`;}
  if(d<86400){const h=Math.round(d/3600);return S.lang==='en'?`${h} h ago`:`${h} ч назад`;}
  const days=Math.round(d/86400);if(days===1)return L('вчера','yesterday');
  if(days<7)return S.lang==='en'?`${days} days ago`:pl(days,['день','дня','дней'],[])+' назад';
  return F.date(ts);},
 short(ts){const d=(Date.now()-ts)/1000;if(d<3600)return Math.max(1,Math.round(d/60))+L(' мин',' min');if(d<86400)return Math.round(d/3600)+L(' ч',' h');if(d<172800)return L('вчера','yest.');return F.date(ts);},
 left(ts){if(ts===null)return L('без срока','no expiry');const d=(ts-Date.now())/1000;if(d<=0)return L('истёк','expired');if(d<86400){const h=Math.ceil(d/3600);return S.lang==='en'?`${h} h left`:`ещё ${h} ч`;}const days=Math.ceil(d/86400);return S.lang==='en'?`${days} days left`:`ещё ${pl(days,['день','дня','дней'],[])}`;},
 tzName:tz=>({ 'Europe/Berlin':L('по Берлину','Berlin time'),'Europe/Moscow':L('по Москве','Moscow time')}[tz]||tz),
};

/* ---------- network simulation (QA toggle) ---------- */
const net=(ms=520)=>new Promise((res,rej)=>setTimeout(()=>QA.offline?rej(new Error('offline')):res(),QA.reduced?60:ms));
const NETFAIL=()=>L('Нет соединения. Ничего не отправлено — попробуй ещё раз','No connection. Nothing was sent — try again');
/** run a server-like action: spinner on button, honest failure toast with retry, success only after "server" */
function run(btn,work,o={}){
 if(btn&&btn.classList.contains('busy'))return Promise.resolve();
 btn&&btn.classList.add('busy');
 const owner=S,session=S?.session,route=cur();return net(o.ms).then(()=>{if(QA.maintenance||S!==owner||S?.session!==session||cur()!==route)return;btn&&btn.isConnected&&btn.classList.remove('busy');const r=work();const msg=typeof o.ok==='function'?o.ok():o.ok;if(msg)toast(msg,{type:'ok',action:o.undo?{label:L('Отменить','Undo'),fn:()=>{if(S===owner&&S.session===session)o.undo();}}:null});return r;})
  .catch(e=>{if(QA.maintenance||S!==owner||S?.session!==session||cur()!==route)return;btn&&btn.isConnected&&btn.classList.remove('busy');if(e&&e.message!=='offline'){console.error(e);}toast(o.fail||NETFAIL(),{type:'err',action:{label:L('Повторить','Retry'),fn:()=>{if(S===owner&&S.session===session&&cur()===route)run(null,work,o);}}});});
}

/* ---------- toasts ---------- */
function toast(msg,o={}){
 const box=$('#toasts');if(!box)return;
 const el=document.createElement('div');el.className='toast '+(o.type||'');el.setAttribute('role',o.type==='err'?'alert':'status');
 const icn={ok:I.okc,err:I.alert,warn:I.warn,info:I.info}[o.type]||'';
 el.innerHTML=`${icn}<span class="tx">${esc(msg)}</span>${o.action?`<button class="tb">${esc(o.action.label)}</button>`:''}`;
 if(o.action)el.querySelector('.tb').onclick=()=>{dismiss();o.action.fn();};
 [...box.children].forEach(c=>c.remove());box.appendChild(el);
 const dismiss=()=>{el.classList.add('out');setTimeout(()=>el.remove(),260);};
 setTimeout(dismiss,o.ms||(o.type==='err'?5200:o.action?4200:2400));
}

/* ---------- sheets & dialogs ---------- */
let sheetOpener=null;
/** build() → {title, body, foot, head}; rebuilt by resheet() so sheet state stays in S */
function sheet(build,o={}){
 sheetOpener=document.activeElement;$('#sheet').inert=false;S.ui.shq='';
 S.ui.sheet={build,o};drawSheet();
 requestAnimationFrame(()=>{$('#scrim').classList.add('on');$('#sheet').classList.add('on');syncModal();const sh=$('#sheet');const f=$('#sheet [autofocus]');if(f)f.focus({preventScroll:true});else{sh.tabIndex=-1;sh.focus({preventScroll:true});}});
}
function drawSheet(){
 const s=S.ui.sheet;if(!s)return;const b=s.build();const el=$('#sheet');const bodyEl=$('.sh-b',el);const st=bodyEl?bodyEl.scrollTop:0;
 el.className='sheet'+(s.o.full?' full':'')+(el.classList.contains('on')?' on':'');
 el.setAttribute('aria-label',b.title||'');
 el.innerHTML=`<div class="grab"></div>${b.title!==false?`<div class="sh-h">${safeInline(b.lead)||''}<div class="sh-ht"><h2>${safeInline(b.title)||''}</h2>${b.sub?`<p>${safeInline(b.sub)}</p>`:''}</div>${b.head||''}<button class="ibtn ghost sm" data-act="closeSheet" aria-label="${L('Закрыть','Close')}">${I.close}</button></div>`:''}${b.search?`<div class="sh-search"><div class="inwrap">${I.search}<input class="inp" type="search" data-in="shq" value="${esc(S.ui.shq||'')}" placeholder="${esc(b.searchPh||L('Найти','Search'))}" aria-label="${esc(b.searchPh||L('Найти','Search'))}" enterkeyhint="search"></div></div>`:''}<div class="sh-b">${b.body||''}</div>${b.foot?`<div class="sh-f">${b.foot}</div>`:''}`;
 const nb=$('.sh-b',el);if(nb){if(b.search&&S.ui.shq)filterSections(nb,S.ui.shq);nb.scrollTop=st;}
}
const resheet=()=>drawSheet();
/** V8: closing a sheet by the user (×, scrim, Back, Esc) asks first when its guard says input would be lost */
function userCloseSheet(){const owner=S,session=S?.session,s=S&&S.ui.sheet;if(!s)return;if(s.o.back&&s.o.back())return;if(s.o.guard&&s.o.guard()){ask({icon:'warn',tone:'a',title:L('Закрыть без сохранения?','Close without saving?'),text:L('Выбранное здесь пропадёт.','What you picked here will be lost.'),ok:L('Закрыть','Close'),cancel:L('Остаться','Stay'),danger:true}).then(ok=>{if(ok&&S===owner&&S.session===session&&S.ui.sheet===s)closeSheet();});return;}closeSheet();}
function closeSheet(instant){
 const s=S&&S.ui.sheet;if(!s)return;S.ui.sheet=null;
 $('#scrim').classList.remove('on');const el=$('#sheet');el.classList.remove('on');el.inert=true;
 s.o.onClose&&s.o.onClose();
 syncModal();if(!instant&&sheetOpener&&sheetOpener.isConnected)sheetOpener.focus({preventScroll:true});
}
function ask(o){return new Promise(res=>{
 let resolved=false;const opener=document.activeElement;const d=$('#dialog');const sc=$('#dscrim');
 d.innerHTML=`${o.icon?`<div class="ico ${o.tone||''}">${I[o.icon]}</div>`:''}<h2>${safeInline(o.title)}</h2>${o.text?`<p>${safeInline(o.text)}</p>`:''}<div class="btns"><button class="btn ${o.danger?'danger':'primary'}" data-r="1">${o.ok||L('Продолжить','Continue')}</button><button class="btn soft" data-r="0">${o.cancel||L('Отмена','Cancel')}</button></div>`;
 d.setAttribute('role','alertdialog');d.style.display='block';sc.style.zIndex=3;
 requestAnimationFrame(()=>{if(resolved)return;sc.classList.add('on');d.classList.add('on');syncModal();$('[data-r="0"]',d).focus();});
 const done=v=>{if(resolved)return;resolved=true;d.classList.remove('on');sc.classList.remove('on');setTimeout(()=>{if(!d.classList.contains('on'))d.style.display='none'},220);S.ui.ask=null;syncModal();if(opener?.isConnected)opener.focus({preventScroll:true});res(v);};
 S.ui.ask=()=>done(false);
 d.onclick=e=>{const b=e.target.closest('[data-r]');if(b)done(b.dataset.r==='1');};
 sc.onclick=()=>done(false);
});}

/* ---------- router ---------- */
const SC={};             // screen registry: id → {tab, root, title(), render(p,r), after(p,r), valid(p), dock, auth}
const ACT={}, IN={}, CH={};
const ROOTS={feed:'F01',people:'D03',groups:'C01',chats:'H01',me:'X01'};
const ROOT_TAB=Object.fromEntries(Object.entries(ROOTS).map(([t,id])=>[id,t]));
// spec IDs that are sub-tabs of a root screen
const ALIAS={M01:['P04',{add:1}],M03:['P04',{}],F03:['F01',{sub:'following'}],E01:['C01',{sub:'events'}],E00:['C01',{sub:'events'}],D06:['D03',{sub:'likes'}],D07:['H01',{sub:'chats'}],C02:['C01',{sub:'joined'}],H06:['H01',{sub:'updates'}]};
/** open a section of «Я» from anywhere: the hub stays underneath, Back returns to it */
function openMe(id,p={}){if(S.ui.sheet)closeSheet(true);saveScroll();S.nav.tab='me';S.nav.stacks.me.length=1;if(id==='X01'){render('fade');return;}S.nav.stacks.me.push({id,p:{...p},f:{}});render('fwd');}
function initNav(){S.nav={tab:'feed',stacks:Object.fromEntries(Object.entries(ROOTS).map(([t,id])=>[t,[{id,p:{}}]])),auth:[{id:'A01',p:{}}]};}
const stack=()=>S.session?S.nav.stacks[S.nav.tab]:S.nav.auth;
const cur=()=>{const s=stack();return s[s.length-1];};
function saveScroll(){const v=$('#main .view');if(v&&cur())cur().scroll=v.scrollTop;}
/** V7: ask only when unsaved input is really thrown away (back, replace, tab reset).
 *  Moving forward (preview, picker, related screen) or switching tabs keeps the draft on its route entry. */
function confirmLeave(proceed,routes){if(!S.session)return false;const list=(routes||[cur()]).filter(r=>r&&r.dirty&&!r.leaveOk);if(!list.length)return false;ask({icon:'warn',tone:'a',title:L('Выйти без сохранения?','Leave without saving?'),text:L('Изменения в форме будут потеряны.','Changes in this form will be discarded.'),ok:L('Выйти','Leave'),cancel:L('Остаться','Stay'),danger:true}).then(ok=>{if(ok){list.forEach(r=>r.dirty=false);proceed();}});return true;}
function go(id,p={},o={}){
 if(o.replace&&confirmLeave(()=>go(id,p,{...o,replace:true})))return;
 if(ALIAS[id]){const [rid,rp]=ALIAS[id];return go(rid,{...rp,...p},o);}
 if(!SC[id]){toast(L('Экран не найден','Screen not found'),{type:'warn'});return;}
 S.ui.chipShown={};
 if(S.ui.sheet)closeSheet(true);
 if(S.session&&SC[id].auth&&!o.force){return;}
 if(S.session&&ROOT_TAB[id]){return tab(ROOT_TAB[id],p);}
 saveScroll();
 const st=stack();if(o.replace){navNextReplace=true;st.pop();}
 st.push({id,p:{...p},f:{}});
 render(o.dir||'fwd');
}
function back(){
 if(S.ui.sheet){userCloseSheet();return;}
 const st=stack();
 const r=cur();if(r&&r.dirty&&!r.leaveOk){ask({icon:'warn',tone:'a',title:L('Выйти без сохранения?','Leave without saving?'),text:L('Изменения на этом экране пропадут.','Changes on this screen will be lost.'),ok:L('Выйти','Leave'),cancel:L('Остаться','Stay'),danger:true}).then(ok=>{if(ok){r.leaveOk=true;back();}});return;}
 if(st.length>1){st.pop();render('back');}
 else if(S.session&&S.nav.tab!=='feed')tab('feed');
}
function tab(t,p){
 if(t==='events'){t='groups';p={...p,sub:'events'};}/* events live inside the Community tab */
 if(S.ui.sheet)closeSheet(true);
 const st=S.nav.stacks[t];
 if(S.nav.tab===t&&st.length>1&&confirmLeave(()=>tab(t,p),st.slice(1)))return;
 if(S.nav.tab===t){
  if(st.length>1){saveScroll();st.length=1;if(p)Object.assign(st[0].p,p);render('back');return;}
  if(p){Object.assign(st[0].p,p);render('fade');return;}
  const v=$('#main .view');v&&v.scrollTo({top:0,behavior:'smooth'});return;
 }
 saveScroll();S.nav.tab=t;if(p)Object.assign(st[0].p,p);render('tab');
}
/** re-render current screen in place (state changed), keeping scroll */
function refresh(){saveScroll();render(null,true);}
/* switching a tab or a filter inside a screen replaces the history entry: Back leaves the screen, it does not walk through the tabs */
function setP(k,v){cur().p[k]=v;navNextReplace=true;refresh();}
/** switch a root sub-tab: resets that sub-tab's scroll */
function setSub(v){const r=cur();if(r.p.sub===v)return;r.p.sub=v;r.scroll=0;navNextReplace=true;render('fade');}

// Ordinary routes keep global navigation; focused tasks opt out explicitly.
const DOCKLESS=new Set(['A07','V01','MAINT','H02','F07','F09','E06','E11','P02','P04','Q04','C07','C08','X08','X11']);
const screenHasDock=(id,sc=SC[id])=>!!S.session&&!QA.maintenance&&!sc?.auth&&!DOCKLESS.has(id)&&sc?.dock!==false;
const main=()=>$('#main');
function render(dir,keep){
 closeAuthorMenu();
 const r=cur();const sc=QA.maintenance?SC.MAINT:SC[r.id];document.body.classList.toggle('maintenance',!!QA.maintenance);
 let html;
 try{html=(sc.valid&&!sc.valid(r.p))?unavailable():sc.render(r.p,r);}
 catch(e){console.error(e);html=`${bar(L('Ошибка','Error'),{back:1})}<div class="view nodock">${empty('alert',L('Экран не загрузился','The screen did not load'),L('Попробуй открыть его ещё раз.','Try opening it again.'),`<button class="btn primary" data-act="reload">${L('Обновить','Reload')}</button>`)}</div>`;}
 const dock=screenHasDock(r.id,sc);
 const m=main();
 m.classList.toggle('has-dock',dock);m.classList.toggle('replying',!!keep&&m.classList.contains('replying'));
 m.innerHTML=(QA.offline?`<div class="netbar" role="status">${I.wifioff}${L('Нет соединения — показываем сохранённое','Offline — showing what’s loaded')}</div>`:'')+html+(dock?dockHTML():'');
 if(dir&&!keep&&dir!=='fade-keep')$$('#toasts .toast:not(.keep)').forEach(t=>t.remove());
 m.dataset.screen=QA.maintenance?'MAINT':r.id;
 const reply=dock&&$(':scope>.inputbar',m);
 m.classList.toggle('has-reply',!!reply);
 if(reply)reply.insertAdjacentHTML('beforebegin',`<div class="ctabar reply-launch"><div class="wrap"><button class="btn soft" data-act="dockReply">${I.chat}${L('Написать ответ','Write a reply')}</button></div></div>`);
 const v=$('.view',m);
 if(v){
  if(dock)v.classList.remove('nodock');
  if(keep||dir==='back'||dir==='tab')v.scrollTop=r.scroll||0;
  if(dir&&!keep){v.classList.add(dir==='back'?'enter-back':(dir==='fade'||dir==='tab')?'enter-fade':'enter');}
 }
 const tb=$('#toasts');tb.className='toasts'+($('.ctabar,.inputbar',m)?' cta':dock?'':' nodock');
 renderSide();renderCtx();
 syncChrome();
 sc.after&&sc.after(r.p,r);
 window.QA_SYNC&&QA_SYNC();
 document.title=`FetUre · ${sc.title?sc.title(r.p):r.id}`;
 if(dir&&!keep){const h=$('h1,h2',m);/* keep focus predictable for screen readers */ if(h&&document.activeElement===document.body){h.setAttribute('tabindex','-1');}}
}
function unavailable(){return `${bar('',{back:1})}<div class="view nodock">${empty('lock',L('Это недоступно','This isn’t available'),L('Возможно, ссылка устарела, доступ отозван или материал удалён.','The link may be outdated, access revoked or the item removed.'),`<button class="btn soft" data-back>${L('Назад','Back')}</button>`)}</div>`;}

/* ---------- counters: always derived from state, never hard-coded ---------- */
const isMatch=(id,actor=actionAuthor())=>authorAllowed(actor)&&!relatedFor(actor,id)&&social(actor)?.matches.some(m=>m.p===id);
const isBlocked=id=>S.blocked.some(b=>b.p===id||realMembers(id).includes(b.p));
const relatedFor=(actor,id)=>realMembers(actor).some(m=>realMembers(id).includes(m));
// Access is derived from consent, scopes and current time, never from visiting a screen.
const grantTimeActive=until=>until===null||(typeof until==='number'&&Number.isFinite(until)&&until>Date.now());
const effectiveRequestStatus=r=>['open','partial','granted'].includes(r.status)&&!grantTimeActive(r.until)?'expired':r.status;
const receivedGrant=(id,actor=accessActor())=>authorAllowed(actor)&&!relatedFor(actor,id)&&!isBlocked(id)&&social(actor)?.reqOut.find(r=>r.p===id&&(!r.viewers||r.viewers.includes(pairMember()))&&(actor!=='couple'||r.actor==='couple'&&r.pairId===S.pair?.id)&&['partial','granted'].includes(r.status)&&r.granted?.length&&grantTimeActive(r.until));
const givenGrant=id=>authorAllowed(actionAuthor())&&!isBlocked(id)&&social()?.sharedByMe.find(r=>r.p===id&&(actionAuthor()!=='couple'||r.pairId===S.pair?.id&&r.profileRevision===(S.pair.revision||0))&&r.scopes?.length&&grantTimeActive(r.until));
const givenGrantEntries=()=>social().sharedByMe.filter(r=>givenGrant(r.p)===r);

function communityHostIds(id){const c=COMMUNITIES[id];return c?[...c.mods,...(ownsCommunity(id)&&!c.mods.includes('me')?['me']:[])]:[];}
function ownsCommunity(id){return !!S?.session&&!!COMMUNITIES[id]&&!!S.managedCommunities?.has(id);}
const C={
 likesIn:()=>social().likesIn.filter(l=>!isMatch(l.p)&&!isBlocked(l.p)&&!l.passed).length,
 newMatches:()=>social().matches.filter(m=>(!social().threads[m.p]||!social().threads[m.p].msgs.length)&&!isBlocked(m.p)).length,
 unreadChats:()=>['me',...(activePair()?['couple']:[])].reduce((n,a)=>n+Object.entries(social(a).threads).filter(([k,t])=>chatUnread(t)&&!social(a).archived.has(k)&&!isBlocked(k)).length,0),
 notif:()=>currentNotifications().filter(n=>!n.read&&!(n.p&&isBlocked(n.p))).length,
 updates:()=>S.updates.filter(u=>!u.read).length,
 reqIn:()=>social().reqIn.filter(r=>r.status==='new'&&!isBlocked(r.p)).length,
 quotaLeft:()=>Math.max(0,S.quota.max-[...S.reqOut,...(S.pair?.social?.reqOut||[])].filter(x=>Date.now()-x.t<DAY).length),
 joined:()=>S.joined.size,
 members:id=>COMMUNITIES[id].members+((S.joined.has(id)||ownsCommunity(id))?1:0)+(S.communityMembers[id]?.size||0), // base count excludes the viewer
};

/* ---------- shared chrome ---------- */
function bar(title,o={}){
 return `<header class="bar ${o.cls||''}">${o.back?`<button class="ibtn ghost" data-back aria-label="${L('Назад','Back')}">${I.back}</button>`:''}${o.lead||''}<h1 class="${o.sm?'sm':''}">${safeInline(title)}${o.sub?`<span class="sub">${safeInline(o.sub)}</span>`:''}</h1>${o.actions||''}</header>`;
}
/** bell badge: unread notifications that are not decisions + decisions that wait on me (a request notification and its card are one item) */
const bellCount=()=>currentNotifications().filter(n=>!n.read&&n.type!=='req'&&!(n.p&&isBlocked(n.p))).length+(typeof todoCount==='function'?todoCount():0);
const bellBtn=()=>{const n=bellCount();return `<button class="ibtn" data-go="N01" aria-label="${L('Уведомления','Notifications')}${n?`: ${n}`:''}">${I.bell}${n?`<sup>${n}</sup>`:''}</button>`;};
const searchBtn=(scope)=>`<button class="ibtn" data-go="G01" data-p='${esc(JSON.stringify({scope:scope||'all'}))}' aria-label="${L('Поиск','Search')}">${I.search}</button>`;
/* V8: community first — Events get their own tab; People appear only once dating is switched on in the admin */
const TABDEF=()=>[['feed',I.feed,L('Лента','Feed'),0],...(window.DATING_ON&&DATING_ON()?[['people',I.people,L('Люди','People'),C.likesIn()]]:[]),['groups',I.groups,L('Комьюнити','Community'),0],['chats',I.chat,L('Чаты','Chats'),C.unreadChats()||(C.newMatches()?'dot':0)],['me',I.me,L('Я','Me'),C.reqIn()]];
function dockHTML(){
 const td=TABDEF();return `<nav class="dock" style="grid-template-columns:repeat(${td.length},1fr)" aria-label="${L('Разделы','Sections')}">${td.map(([t,icn,l,n])=>`<button class="${S.nav.tab===t?'on':''}" data-tab="${t}" aria-label="${l}${n&&n!=='dot'?`, ${n}`:''}" ${S.nav.tab===t?'aria-current="page"':''}>${icn}<span>${l}</span>${n==='dot'?'<em class="dot"></em>':n?`<em>${n}</em>`:''}</button>`).join('')}</nav>`;
}
function renderSide(){
 const s=$('#side');if(!s)return;
 if(!S.session){s.innerHTML='';return;}
 s.innerHTML=`<div class="brand"><img src="${LOGO()}" alt=""><b>Fet<i>Ure</i></b></div><nav aria-label="${L('Разделы','Sections')}">${TABDEF().map(([t,icn,l,n])=>`<button class="navb ${S.nav.tab===t?'on':''}" data-tab="${t}">${icn}<span>${l}</span>${n==='dot'?'<em style="min-width:9px;width:9px;height:9px;padding:0"></em>':n?`<em>${n}</em>`:''}</button>`).join('')}</nav>
 <button class="btn primary create" data-act="create" aria-label="${L('Создать','Create')}">${I.plus}<span>${L('Создать','Create')}</span></button><div class="sp"></div>
 <button class="mebtn" data-tab="me">${av('me','')}<span>${esc(pname('me'))}</span></button>`;
}
function renderCtx(){const c=$('#ctx');if(!c)return;c.innerHTML=S.session&&window.CTX?CTX(S.nav.tab):'';}

/* ---------- small UI builders ---------- */
function seg(items,active,act,cls=''){
 const i=Math.max(0,items.findIndex(x=>x[0]===active));
 return `<div class="seg ${cls}" role="tablist"><span class="knob" style="width:calc((100% - 8px)/${items.length});transform:translateX(${i*100}%)"></span>${items.map(([id,l,n])=>`<button role="tab" aria-selected="${id===active}" class="${id===active?'on':''}" data-act="${act}" data-v="${id}"><span>${l}</span>${n?`<em>${n}</em>`:''}</button>`).join('')}</div>`;
}
function tabsRow(items,active,act,cls=''){return seg(items,active,act,cls||'sm');}
/** V8: everything that belongs together lives in one card with a small title above it */
function grp(title,html,o={}){return `<section class="grp ${o.cls||''}" ${o.id?`id="${o.id}"`:''}>${title?`<div class="grp-t"><span>${title}</span>${o.right||''}</div>`:''}<div class="card ${o.list?'list':''} ${o.flat?'flat':''} ${o.inner||''}">${html}</div>${o.foot?`<p class="grp-n">${o.foot}</p>`:''}</section>`;}
/** one way to pick a value: a native select with its current text (single choice) or chips (several). No big option blocks. */
function selectRow(act,label,items,value,o={}){return `<label class="selrow ${label?'':'solo'}">${label?`<span>${label}</span>`:''}<select data-ch="sel" data-act="${act}" ${o.k?`data-k="${o.k}"`:''} aria-label="${esc(label||o.aria||'')}">${items.map(([k,t,,dis])=>`<option value="${esc(k)}" ${String(k)===String(value)?'selected':''} ${dis?'disabled':''}>${esc(t)}</option>`).join('')}</select></label>`;}
CH.sel=el=>{el.dataset.v=el.value;const fn=ACT[el.dataset.act];if(fn)fn(el);};
function choices(items,sel,act,o={}){if(!o.multi)return selectRow(act,o.label||'',items,[].concat(sel)[0],o);const set=new Set([].concat(sel).filter(x=>x!=null));return `<div class="chips" role="group">${items.map(([k,t,,dis])=>`<button class="chip ${set.has(k)?'on':''}" data-act="${act}" data-v="${esc(k)}" ${o.k?`data-k="${o.k}"`:''} aria-pressed="${set.has(k)}" ${dis?'disabled':''}>${t}</button>`).join('')}</div>`;}
function empty(icon,title,text,btns=''){return `<div class="empty"><div class="em-ic">${I[icon]}</div><h3>${safeInline(title)}</h3>${text?`<p>${safeInline(text)}</p>`:''}${btns?`<div class="btns">${btns}</div>`:''}</div>`;}
function sw(on){return `<span class="sw ${on?'on':''}" aria-hidden="true"></span>`;}
function toggleRow(act,title,sub,on,extra=''){return `<button class="li" data-act="${act}" ${extra} role="switch" aria-checked="${!!on}"><span class="tx"><b>${title}</b>${sub?`<small>${sub}</small>`:''}</span>${sw(on)}</button>`;}
function linkRow(o){return `<button class="li ${o.cls||''}" ${o.go?`data-go="${esc(o.go)}"`:''} ${o.p?`data-p='${esc(JSON.stringify(o.p))}'`:''} ${o.act?`data-act="${esc(o.act)}"`:''} ${o.v?`data-v="${esc(o.v)}"`:''}>${o.icon?`<span class="ico ${o.tone||''}">${I[o.icon]}</span>`:''}${o.av||''}<span class="tx"><b>${safeInline(o.title)}</b>${o.sub?`<small>${safeInline(o.sub)}</small>`:''}</span>${o.val?`<span class="val">${safeInline(o.val)}</span>`:''}${o.badge?`<span class="pill hot">${safeInline(o.badge)}</span>`:''}${o.noChev?'':I.chev}</button>`;}
/** form field bound to route form state (r.f) so language switch / back keeps input */
function field(o){
 const r=cur();const v=r.f[o.name]??o.value??'';const err=r.err&&r.err[o.name];
 const input=o.textarea?`<textarea class="inp" name="${o.name}" data-in="f" ${o.max?`maxlength="${o.max+50}"`:''} placeholder="${esc(o.ph||'')}" ${o.attrs||''}>${esc(v)}</textarea>`
  :`<input class="inp" name="${o.name}" data-in="f" type="${o.type||'text'}" value="${esc(v)}" placeholder="${esc(o.ph||'')}" ${o.attrs||''} ${err?'aria-invalid="true"':''}>`;
 return `<label class="field ${err?'err':''}" data-field="${o.name}"><span>${o.label}${o.opt?`<i>${L('необязательно','optional')}</i>`:''}</span>${o.icon?`<div class="inwrap">${I[o.icon]}${input}</div>`:input}${err?`<div class="ferr">${I.alert}${err}</div>`:o.hint?`<div class="fhint">${o.hint}</div>`:''}${o.max?`<div class="counter" data-count="${o.name}">${String(v).length} / ${o.max}</div>`:''}</label>`;
}
function setErr(name,msg){
 const r=cur();r.err=r.err||{};if(msg)r.err[name]=msg;else delete r.err[name];
 const f=$(`[data-field="${name}"]`);if(!f)return;
 f.classList.toggle('err',!!msg);$('.ferr',f)?.remove();
 const h=$('.fhint',f);if(h)h.style.display=msg?'none':'';
 const inp=$('.inp',f);inp&&inp.setAttribute('aria-invalid',msg?'true':'false');
 if(msg){const d=document.createElement('div');d.className='ferr';d.innerHTML=I.alert+esc(msg);const anchor=$('.counter',f)||null;f.insertBefore(d,anchor);}
}
function shakeFirstErr(){const e=$('.field.err, .check.err, .code.err');if(e){e.classList.remove('shake');void e.offsetWidth;e.classList.add('shake');const i=$('.inp,input',e);i&&i.focus();e.scrollIntoView({block:'center',behavior:'smooth'});}}
const fv=n=>(cur().f[n]??'').toString();

/* ---------- validators ---------- */
const TAKEN=['alex','admin','feture','mia','maya','support','moderator'];
const V={
 email(v){v=v.trim();if(!v)return L('Введи почту','Enter your email');if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v))return L('Похоже, в адресе ошибка. Пример: name@mail.com','That doesn’t look like an email. Example: name@mail.com');return '';},
 nick(v){v=v.trim();if(!v)return L('Придумай ник — по нему тебя найдут','Pick a nickname — people find you by it');if(v.length<3)return L('Минимум 3 символа','At least 3 characters');if(v.length>20)return L('Максимум 20 символов','At most 20 characters');if(!/^[a-zA-Z0-9_.]+$/.test(v))return L('Только латиница, цифры, точка и _','Latin letters, digits, dot and _ only');if(TAKEN.includes(v.toLowerCase()))return L('Этот ник уже занят','This nickname is taken');return '';},
 dob(d,m,y){
  if(!d||!m||!y)return L('Укажи дату рождения полностью','Enter your full date of birth');
  const dt=new Date(+y,+m-1,+d);if(!Number.isInteger(+d)||!Number.isInteger(+m)||!Number.isInteger(+y)||dt.getFullYear()!==+y||dt.getMonth()!==+m-1||dt.getDate()!==+d)return L('Такой даты нет — проверь день и месяц','That date doesn’t exist — check day and month');
  const a=ageOf(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  if(a<0||+y>new Date(NOW).getFullYear())return L('Дата из будущего','That date is in the future');
  if(a>110)return L('Проверь год рождения','Check the year');
  if(a<18)return 'U18';return '';},
};

/* ---------- global event delegation ---------- */
function parseP(el){if(el.dataset.p){try{return JSON.parse(el.dataset.p)}catch(e){}}return el.dataset.id?{id:el.dataset.id}:{};}
document.addEventListener('click',e=>{
 const t=e.target;
 if(QA.maintenance&&!t.closest('#qa,#qaFab,#qaScrim')&&t.closest('[data-act]')?.dataset.act!=='maintenanceRetry'){e.preventDefault();return;}
 if(t.closest('[data-back]')){e.preventDefault();back();return;}
 const tb=t.closest('[data-tab]');if(tb){e.preventDefault();tab(tb.dataset.tab);return;}
 const g=t.closest('[data-go]'),a=t.closest('[data-act]');
 // the innermost interactive element wins (a like button inside a clickable post card)
 if(g&&!g.disabled&&!(a&&g.contains(a))){e.preventDefault();go(g.dataset.go,parseP(g));return;}
 if(a&&!a.disabled&&!a.classList.contains('busy')){const fn=ACT[a.dataset.act];if(fn){e.preventDefault();fn(a,e);}else console.warn('no action',a.dataset.act);}
 if(t.id==='scrim')userCloseSheet();
});
/* typed or pasted text is cleaned before any handler sees it (the same rules the server must enforce) */
document.addEventListener('input',e=>{const t=e.target;if(!t)return;
 if(t.matches?.('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),textarea')){const v=t.value;if(typeof v==='string'&&v){const c=cleanText(v);if(c!==v){const p=t.selectionStart;t.value=c;try{t.setSelectionRange(Math.min(p,c.length),Math.min(p,c.length));}catch(_){}}}}
 else if(t.isContentEditable&&t.classList?.contains('rte-ed')){const w=document.createTreeWalker(t,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){const c=cleanText(n.nodeValue);if(c!==n.nodeValue)n.nodeValue=c;}}
},true);
document.addEventListener('input',e=>{const el=e.target.closest('[data-in]');if(!el)return;const fn=IN[el.dataset.in];fn&&fn(el,e);});
document.addEventListener('change',e=>{const el=e.target.closest('[data-ch]');if(!el)return;const fn=CH[el.dataset.ch];fn&&fn(el,e);});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){if(closeAuthorMenu()){e.preventDefault();return;}if($('#matchLayer .match')){ACT.matchClose();return;}if(S.ui.ask){S.ui.ask();return;}if($('#qa.open')){window.QA_CLOSE&&QA_CLOSE();return;}if(S.ui.sheet){userCloseSheet();return;}if(stack().length>1)back();}
 if(e.key==='Enter'&&e.target.dataset&&e.target.dataset.enter&&!e.shiftKey&&!e.isComposing&&!(e.target.tagName==='TEXTAREA'&&matchMedia('(pointer:coarse)').matches)){e.preventDefault();ACT[e.target.dataset.enter]?.(e.target,e);}
});
// generic form memory: value lives on the route entry, errors clear while typing
IN.f=el=>{const r=cur();r.f[el.name]=el.value;r.dirty=true;if(r.err&&r.err[el.name])setErr(el.name,'');const c=$(`[data-count="${el.name}"]`);if(c){const max=+c.textContent.split('/')[1];c.textContent=`${el.value.length} / ${max}`;c.classList.toggle('over',el.value.length>max);}};
ACT.closeSheet=()=>userCloseSheet();
ACT.reload=()=>refresh();
ACT.go=(a)=>go(a.dataset.v,parseP(a));


function modalScope(){return $('#authorMenu')||$('#dialog.on')||$('#viewer.on')||$('#matchLayer .match')||$('#qa.open')||$('#sheet.on');}
function syncModal(){const modal=modalScope();for(const x of [$('#main'),$('#side'),$('#ctx')])if(x)x.inert=!!modal;$('#qaFab').inert=!!modal;$('#sheet').inert=!!modal&&modal!==$('#sheet');$('#sheet').setAttribute('aria-hidden',String(!S?.ui.sheet));$('#qa').inert=!$('#qa.open');if(modal&&modal!==$('#sheet')&&S?.ui.sheet)$('#sheet').inert=true;}
new MutationObserver(syncModal).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','style']});
document.addEventListener('keydown',e=>{const modal=modalScope();if(!modal||e.key!=='Tab')return;const nodes=[...modal.querySelectorAll('button,a[href],input,textarea,select,[tabindex="0"]')].filter(x=>!x.disabled&&!x.inert&&x.getClientRects().length);if(!nodes.length){e.preventDefault();modal.tabIndex=-1;modal.focus();return;}const a=nodes[0],z=nodes.at(-1);if(e.shiftKey&&(document.activeElement===a||!modal.contains(document.activeElement))){e.preventDefault();z.focus();}else if(!e.shiftKey&&(document.activeElement===z||!modal.contains(document.activeElement))){e.preventDefault();a.focus();}},true);
window.addEventListener('beforeunload',e=>{if(cur()?.dirty){e.preventDefault();e.returnValue='';}});

/* V7 chrome: the header floats over content (no background, glass icons), its title fades on scroll.
   Footers (.ctabar/.inputbar) are flex items, so the keyboard shrinks the view instead of covering them. */
const barObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>measureBar()):null;
function measureBar(){const m=main(),b=$(':scope>.bar',m);m.style.setProperty('--barh',b?b.getBoundingClientRect().height+'px':'0px');}
function syncChrome(){const m=main();if(cur()?.fq)filterSections($(':scope>.view',m)||m,cur().fq);const b=$(':scope>.bar',m),ft=$(':scope>.ctabar,:scope>.inputbar',m);m.classList.toggle('hasbar',!!b&&!b.classList.contains('overlay'));m.classList.toggle('hascta',!!ft);if(ft)requestAnimationFrame(()=>{const visible=$$(':scope>.ctabar,:scope>.inputbar',m).find(el=>el.getClientRects().length);if(visible)$('#root').style.setProperty('--ctah',(visible.getBoundingClientRect().height+(parseFloat(getComputedStyle(visible).marginBottom)||0))+'px');});measureBar();barObserver?.disconnect();if(b)barObserver?.observe(b);
 const v=$(':scope>.view',m);m.style.setProperty('--sc',0);if(v){const on=()=>{const k=Math.min(1,v.scrollTop/48);m.style.setProperty('--sc',k.toFixed(3));m.classList.toggle('scrolled',v.scrollTop>4);};v.addEventListener('scroll',on,{passive:true});on();}}
// keep the focused field visible above the keyboard
document.addEventListener('focusin',e=>{const el=e.target;if(!el.matches?.('input:not([type=checkbox]):not([type=radio]),textarea,select,[contenteditable]')||!el.closest('#main .view'))return;setTimeout(()=>{if(document.activeElement===el)el.scrollIntoView({block:'center',behavior:'smooth'});},320);});


function communityMemberCanWrite(id,member,kind='post'){const c=COMMUNITIES[id];if(!c||isBlocked(member)||S.communityRestrictions?.[id]?.[member])return false;if(kind==='comment'&&c.commentPolicy==='public'&&c.privacy==='open')return true;if(member==='me')return S.joined.has(id)||ownsCommunity(id);if(S.pair?.memberCommunities&&Object.hasOwn(S.pair.memberCommunities,member))return S.pair.memberCommunities[member].includes(id);return !!c.mods?.includes(member)||!!c.seedMembers?.includes(member)||!!S.communityMembers[id]?.has(member)||!!S.pair?.memberCommunities?.[member]?.includes(id);}
function communityAuthorReason(id,actor='me',kind='post'){if(actor!=='me')return L('В сообществах публикуют лично','Community posts are personal');if(!authorAllowed(actor))return !S.session?L('Войди, чтобы участвовать в обсуждении','Sign in to join the discussion'):L('Для личных действий выбери Alex в панели V10','For personal actions, select Alex in the V10 panel');const members=realMembers(actor);return members.every(m=>communityMemberCanWrite(id,m,kind))?'':actor==='couple'?L('Чтобы писать от пары, оба должны состоять в этом сообществе и иметь право публикации.','To write as a couple, both partners must belong to this community and have permission to post.'):L('Для публикации нужно право участника сообщества.','Posting requires community member permission.');}
const communityAuthorAllowed=(id,actor=actionAuthor(),kind='post')=>!communityAuthorReason(id,actor,kind);
function requestReason(id,actor=actionAuthor()){if(!authorAllowed(actor)||!PEOPLE[id]||isBlocked(id)||relatedFor(actor,id))return L('Этот профиль недоступен для выбранного автора','This profile is unavailable to the selected author');const policy=PEOPLE[id].requestsFrom||'all';if(policy==='none'||policy==='matches'&&!isMatch(id,actor))return L('Этот профиль не принимает запросы от выбранного автора','This profile does not accept requests from the selected author');const st=social(actor);if(st.reqOut.some(x=>x.p===id&&x.status==='pending'))return L('Запрос уже отправлен','Request already sent');if(st.reqOut.some(x=>x.p===id&&x.status==='declined'&&Date.now()-x.t<7*DAY))return L('После отказа нужно подождать 7 дней','Wait 7 days after a decline');if(C.quotaLeft()<=0)return L('Запросы на сегодня закончились','No requests left today');return '';}

function currentNotifications(){const member=pairMember();const personal=member==='me'?S.notifs.filter(n=>n.type!=='pair'):[];const shared=S.pair?.notifications?.[member]||[];const updates=(S.updates||[]).map(u=>({...u,type:u.e?'event':'group',go:u.e?['E03',{id:u.e}]:['C03',{id:u.c}]}));const covered=new Set(updates.map(u=>u.e||u.c));/* an organiser's update already says what changed: no second row for the same event/community */return [...personal.filter(n=>!((n.type==='event'||n.type==='group')&&covered.has(n.e||n.c))),...shared,...updates].sort((a,b)=>b.t-a.t);}
function dissolvePair(){if(typeof invalidateViewer==='function')invalidateViewer();const P=S.pair;if(!activePair())return;coupleProfile();P.safetyEpoch=(P.safetyEpoch||0)+1;P.status='dissolved';P.endedAt=Date.now();P.restoreUntil=P.endedAt+30*DAY;P.recovery=[];P.trust=null;P.proposal=null;P.grants=[];if(P.social){P.social.sharedByMe=[];P.social.reqOut.forEach(x=>{x.status='revoked';x.granted=[];});P.social.reqIn.forEach(x=>{x.status='no';x.granted=[];});}S.datingActor='me';S.datingEpoch=(S.datingEpoch||0)+1;for(const t of Object.values(P.social?.threads||{})){t.ended=true;for(const m of t.msgs)if(m.media)m.media.url=null;}for(const q of Object.values(P.postProposals||{}))q.status='cancelled';for(const p of S.myPosts)if(p.author==='couple')p.hiddenByPair=true;pairNotify('dissolved',String(P.endedAt),{go:['Q07']});}
function expirePair(now=Date.now()){const P=S.pair;if(!P||P.status!=='dissolved'||now<P.restoreUntil)return false;
 P.status='deleted';P.retainedThreads=Object.fromEntries(Object.entries(P.social?.threads||{}).map(([id,t])=>[id,{target:id,msgs:t.msgs.filter(m=>!m.me).map(m=>structuredClone(m)),ended:true}]));delete P.profile;delete P.draft;delete P.social;delete P.desc;delete P.rules;P.name={ru:'Удалённый совместный профиль',en:'Deleted couple profile'};P.grants=[];
 for(const post of S.myPosts)if(post.author==='couple'){post.hiddenByPair=true;post.media=[];}for(const post of [...S.posts,...S.myPosts])for(const c of post.comments||[])if(c.a==='couple'){c.deleted=true;c.text={ru:'',en:''};delete c.media;}
 for(const d of S.discussions){if(d.author==='couple'){d.text={ru:'Публикация удалена',en:'Post removed'};d.title={ru:'Совместный профиль удалён',en:'Couple profile deleted'};d.media=[];}for(const c of d.replies||[])if(c.a==='couple'){c.deleted=true;c.text={ru:'',en:''};delete c.media;}}
 S.pairMember='me';return true;
}
function requestPairRestore(){const P=S.pair;if(P?.status!=='dissolved'||expirePair())return false;const member=pairMember();if(!['me',P.with].includes(member))return false;if(!P.recovery.includes(member))P.recovery.push(member);if(P.recovery.length===2){P.status='active';P.profile.dating=false;P.profile.datingVisible=false;P.recovery=[];pairNotify('restored',String(Date.now()),{go:['Q01']});return true;}pairNotify('restoreRequested',String(P.endedAt),{go:['Q07']});return false;}
function socialDelivery(identity,type,key,extra={}){if(identity==='couple'){pairNotify(type,key,extra);return;}S.socialDeliveries??={};for(const recipient of realMembers(identity)){const list=S.socialDeliveries[recipient]??=[];const id=type+'_'+key+'_'+recipient;if(!list.some(x=>x.id===id))list.push({id,type,to:recipient,read:false,t:Date.now(),...extra});}}

// Collapse reply entry while browsing; give the composer the full bottom area on focus.
ACT.dockReply=()=>{main().classList.add('replying');$('.inputbar textarea',main())?.focus();syncChrome();};
document.addEventListener('focusout',()=>{const m=main();if(m?.classList.contains('replying'))requestAnimationFrame(()=>{if(!$('.inputbar',m)?.contains(document.activeElement)){m.classList.remove('replying');syncChrome();}});});



/* Joint work has an explicit pair, creator, version and second-person approval. */
function jointQueue(){return S.pair?(S.pair.postProposals??={}):{};}
function submitJointPost(d,id,existing){if(!canAct('publish','couple')||d.pairId!==S.pair.id)return false;const queue=jointQueue(),prior=queue[id];const version=(prior?.version||existing?.version||0)+1;const q={id,version,pairId:S.pair.id,by:pairMember(),status:'pending',kind:'post',draft:structuredClone(d),base:existing?.version||0,t:Date.now()};queue[id]=q;if(pairTrusted())return commitJointPost(q,pairMember(),true);pairNotify('postApproval',id+'_'+version,{go:['Q01']});return true;}
function approveJointWork(id,version,reviewer=pairMember()){
 const q=jointQueue()[id];if(!activePair()||!q||q.status!=='pending'||q.pairId!==S.pair.id||q.version!==Number(version)||q.by===reviewer||!realMembers('couple').includes(reviewer))return false;
 if(q.kind==='grant'){const st=social('couple'),r=st.reqIn.find(x=>x.id===q.request);if(!r||r.status!=='new'||isBlocked(r.p)||q.safety!==(S.pair.safetyEpoch||0)||q.profileRevision!==(S.pair.revision||0))return false;r.status='open';r.granted=[...q.scopes];r.until=q.until;st.sharedByMe=st.sharedByMe.filter(x=>x.p!==r.p);st.sharedByMe.push({p:r.p,owner:S.pair.id,viewers:[...q.viewers],pairId:S.pair.id,profileRevision:q.profileRevision,scopes:[...q.scopes],until:q.until,t:Date.now()});}
 else return commitJointPost(q,reviewer);
 q.status='approved';pairNotify('workApproved',id+'_'+version,{go:['Q01']});return true;
}
function queueJointGrant(r,o,until){if(!activePair())return false;const id='grant_'+r.id,old=jointQueue()[id];jointQueue()[id]={id,kind:'grant',version:(old?.version||0)+1,pairId:S.pair.id,request:r.id,by:pairMember(),status:'pending',scopes:[...o.sel],viewers:[...realMembers(r.p)],until,profileRevision:S.pair.revision||0,safety:S.pair.safetyEpoch||0,t:Date.now()};pairNotify('grantApproval',id,{go:['Q01']});return true;}


function chatReadable(id,actor='me'){if(authorAllowed(actor))return actor!=='me'||pairMember()==='me';const t=social(actor)?.threads[id];return !!S.session&&actor==='couple'&&S.pair?.status==='dissolved'&&!!t?.ended&&t.members?.includes(pairMember());}

// Mutual delegation is limited to future shared content; access grants always need explicit approval.
function pairTrusted(){const P=S.pair;return !!S.session&&activePair()&&!!P.id&&P.trust?.pairId===P.id&&realMembers('couple').every(id=>P.trust.consents?.includes(id));}
function setPairTrust(enable,P=S.pair){if(!S.session||!activePair()||P!==S.pair||!realMembers('couple').includes(pairMember()))return false;coupleProfile();
 if(!enable){P.trust=null;P.safetyEpoch=(P.safetyEpoch||0)+1;return true;}
 if(P.trust?.pairId!==P.id)P.trust={pairId:P.id,consents:[]};if(!P.trust.consents.includes(pairMember())){P.trust.consents.push(pairMember());P.safetyEpoch=(P.safetyEpoch||0)+1;}return true;
}
function commitJointPost(q,reviewer,delegated=false){
 if(!S.session||!activePair()||jointQueue()[q?.id]!==q||q.status!=='pending'||q.kind!=='post'||q.pairId!==S.pair.id||!realMembers('couple').includes(reviewer)||!realMembers('couple').includes(q.by))return false;
 if(q.by===reviewer&&!(delegated&&pairTrusted()&&reviewer===pairMember()))return false;
 if(!postResultReady(q.draft))return false;const existing=S.myPosts.find(x=>x.id===q.id);if((existing?.version||0)!==q.base)return false;
 const obj={...postFromDraft(q.draft,q.id,existing),version:q.version,creator:existing?.creator||q.by,approvedBy:delegated?[...realMembers('couple')]:[q.by,reviewer],delegated:!!delegated,status:q.draft.media.length?'review':'published'};
 existing?Object.assign(existing,obj):S.myPosts.unshift(obj);delete S.postEdits[q.id];q.status='approved';pairNotify('workApproved',q.id+'_'+q.version,{go:['Q01']});if(obj.status==='review')autoResolve();return true;
}
