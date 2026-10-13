/* ============ CORE: helpers, i18n, icons, router, sheets, toasts, network ============ */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
let S=null;
const QA={offline:false,frame:'auto',seen:{}};
const L=(ru,en)=>S&&S.lang==='en'?en:ru;
const T=o=>o==null?'':typeof o==='string'?o:(o[S.lang]??o.ru??'');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const loc=()=>S.lang==='en'?'en-GB':'ru-RU';
/** pl(5,['событие','события','событий'],['event','events']) → "5 событий" */
function pl(n,ru,en,bare){
 let w;
 if(S.lang==='en') w=n===1?en[0]:en[1];
 else{const a=Math.abs(n)%100,b=a%10;w=a>10&&a<20?ru[2]:b>1&&b<5?ru[1]:b===1?ru[0]:ru[2];}
 return bare?w:`${n} ${w}`;
}
const opt=(group,id)=>{const o=(OPT[group]||[]).find(x=>x[0]===id);return o?(S.lang==='en'?o[2]:o[1]):'';};
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
 x:sv('<path d="M6 6l12 12M18 6L6 18"/>',2.6), undo:sv('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',2.2),
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
 spark:sv('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>'),
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
const IMG=n=>typeof n==='string'&&/^(blob:|data:image\/)/.test(n)?n:(window.FT_IMG&&window.FT_IMG[n])||`images/profile-${n}.webp`;
/* V7: the test mark is gone. Three vector options for the owner (QA drawer → Логотип); A is the default. */
const LOGOS={
 a:`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><defs><linearGradient id='a' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#FF4F6D'/><stop offset='1' stop-color='#C2134A'/></linearGradient><linearGradient id='b' x1='0' y1='1' x2='1' y2='0'><stop offset='0' stop-color='#6A52F0'/><stop offset='1' stop-color='#C3B3FF'/></linearGradient></defs><rect width='120' height='120' rx='32' fill='#1E1219'/><circle cx='47' cy='60' r='23' fill='none' stroke='url(#a)' stroke-width='12'/><circle cx='73' cy='60' r='23' fill='none' stroke='url(#b)' stroke-width='12'/><path d='M51 37.4A23 23 0 0 1 65.6 45.2' fill='none' stroke='#1E1219' stroke-width='17'/><path d='M51 37.4A23 23 0 0 1 65.6 45.2' fill='none' stroke='url(#a)' stroke-width='12'/></svg>`,
 b:`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#FF3355'/><stop offset='1' stop-color='#7A1236'/></linearGradient></defs><rect width='120' height='120' rx='32' fill='url(#g)'/><path d='M38 30h44v15H54v12h24v15H54v18H38z' fill='#fff'/><circle cx='82' cy='84' r='9' fill='#B9A6FF'/></svg>`,
 c:`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' rx='32' fill='#F6EDF3'/><circle cx='48' cy='60' r='28' fill='#FF3355' fill-opacity='.9'/><circle cx='72' cy='60' r='28' fill='#5C47D6' fill-opacity='.85'/><path d='M60 74c-7-5-11-9-11-14a5.5 5.5 0 0 1 11-1 5.5 5.5 0 0 1 11 1c0 5-4 9-11 14z' fill='#fff'/></svg>`};
const LOGO=()=>'data:image/svg+xml,'+encodeURIComponent(LOGOS[QA.logo||'a']);
const plate=(key,icon)=>`<div class="plate" style="${PL[key]||PL.rose};position:absolute;inset:0">${icon?`<span class="pi">${I[icon]}</span>`:''}</div>`;
function person(id){if(id==='me')return meAsPerson();return PEOPLE[id];}
function pname(id){if(id==='me')return S.me.name||S.me.nick||L('Ты','You');const p=PEOPLE[id];if(!p)return L('Участник','Member');return p.pair&&S.lang!=='en'?p.nameRu:p.name;}
const PUBLIC_VIS={gender:'public',orient:'public',format:'public',status:'public',role:'granted'};
function publicField(m,k){return (m.vis?.[k]??PUBLIC_VIS[k]??'public')==='public'?m[k]:Array.isArray(m[k])?[]:null;}
function meAsPerson(){const m=S.ui.profilePreview||S.me;return{name:m.name||m.nick,age:m.showAge===false?null:ageOf(m.dob),photo:m.photo,city:m.city,location:m.location?.coords,pron:m.pron,gender:publicField(m,'gender'),orient:publicField(m,'orient'),format:publicField(m,'format'),status:publicField(m,'status'),role:publicField(m,'role'),seek:m.dating?m.seek:[],bio:m.bio,verified:m.ageCheck==='ok',online:true,dating:m.dating,jars:m.jars.filter(j=>j.vis==='public'&&!j.limit).map(j=>[j.t,j.lv]),langs:m.langs};}
/** avatar: photo → img; pair → two plates; else initials plate */
function av(id,cls='',variant=0){
 const p=person(id);
 if(!p) return `<span class="av ${cls}">${plate('night')}</span>`;
 if(p.photo) return `<span class="av ${cls}"><img src="${IMG(p.photo)}" alt="" loading="lazy" draggable="false" style="${variant?'transform:scale(1.35);object-position:50% 25%':''}"></span>`;
 if(p.pair) return `<span class="av ${cls}" style="display:grid;grid-template-columns:1fr 1fr">${`<span style="position:relative">${plate(p.plate)}</span><span style="position:relative">${plate(p.plate2||p.plate)}</span>`}<b style="position:absolute;inset:0;display:grid;place-items:center;color:#fff;font:800 13px/1 var(--font)">${esc((p.name||'').split(/[ &и]+/).filter(Boolean).map(x=>x[0]).join('+'))}</b></span>`;
 const ini=(p.name||'?')[0];
 return `<span class="av ini ${cls}">${plate(p.plate||'night')}<b style="position:relative">${esc(ini)}</b></span>`;
}
/** Photos of a person. Prototype people have one licensed image each, so extra photos are distinct crops of it
 *  (stand-ins for a real 2–6 photo gallery). My own photos are real local files. */
const CROPS=['','transform:scale(1.45);transform-origin:50% 28%','transform:scale(1.2) translateX(-7%);filter:saturate(1.15) hue-rotate(-8deg)','transform:scale(1.7);transform-origin:40% 60%','transform:scale(1.3) translateX(6%);filter:contrast(1.08) saturate(.9)','transform:scale(2);transform-origin:55% 35%'];
function photoCount(id){if(id==='me'){const m=S.ui.profilePreview||S.me;return Math.max(1,(m.photos||[]).length);}const p=person(id);return p?.photo?Math.min(6,p.nph||1):1;}
function photoItems(id){if(id==='me'){const m=S.ui.profilePreview||S.me;return (m.photos||[]).map(ph=>({type:'image',src:IMG(ph)}));}const p=person(id);if(!p?.photo)return [];return Array.from({length:photoCount(id)},(_,i)=>({type:'image',src:IMG(p.photo),style:CROPS[i%6]}));}
function photoBars(id,ix){const n=photoCount(id);return n>1?`<div class="pc-bars" aria-label="${L(`Фото ${ix+1} из ${n}`,`Photo ${ix+1} of ${n}`)}">${Array.from({length:n},(_,i)=>`<i class="${i===ix?'on':''}"></i>`).join('')}</div>`:'';}
/** step through photos; returns false at the first/last photo (caller can nudge) */
function stepPhoto(id,d){S.ui.ph=S.ui.ph||{};const n=photoCount(id),i=(S.ui.ph[id]||0)+d;if(i<0||i>=n)return false;S.ui.ph[id]=i;return true;}
function bigPhoto(id,v=0){
 const p=person(id);
 if(id==='me'){const m=S.ui.profilePreview||S.me;const ph=(m.photos||[])[v]??m.photo;if(ph!=null)return `<img src="${IMG(ph)}" alt="${esc(pname(id))}" draggable="false">`;return plate('rose','me');}
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
 const owner=S,session=S?.session,route=cur();return net(o.ms).then(()=>{if(S!==owner||S?.session!==session||cur()!==route)return;btn&&btn.isConnected&&btn.classList.remove('busy');const r=work();const msg=typeof o.ok==='function'?o.ok():o.ok;if(msg)toast(msg,{type:'ok',action:o.undo?{label:L('Отменить','Undo'),fn:()=>{if(S===owner&&S.session===session)o.undo();}}:null});return r;})
  .catch(e=>{if(S!==owner||S?.session!==session||cur()!==route)return;btn&&btn.isConnected&&btn.classList.remove('busy');if(e&&e.message!=='offline'){console.error(e);}toast(o.fail||NETFAIL(),{type:'err',action:{label:L('Повторить','Retry'),fn:()=>{if(S===owner&&S.session===session&&cur()===route)run(null,work,o);}}});});
}

/* ---------- toasts ---------- */
function toast(msg,o={}){
 const box=$('#toasts');if(!box)return;
 const el=document.createElement('div');el.className='toast '+(o.type||'');el.setAttribute('role',o.type==='err'?'alert':'status');
 const icn={ok:I.okc,err:I.alert,warn:I.warn,info:I.info}[o.type]||'';
 el.innerHTML=`${icn}<span class="tx">${esc(msg)}</span>${o.action?`<button class="tb">${esc(o.action.label)}</button>`:''}`;
 if(o.action)el.querySelector('.tb').onclick=()=>{dismiss();o.action.fn();};
 box.appendChild(el);while(box.children.length>3)box.firstChild.remove();
 const dismiss=()=>{el.classList.add('out');setTimeout(()=>el.remove(),260);};
 setTimeout(dismiss,o.ms||(o.type==='err'?5200:o.action?4200:2400));
}

/* ---------- sheets & dialogs ---------- */
let sheetOpener=null;
/** build() → {title, body, foot, head}; rebuilt by resheet() so sheet state stays in S */
function sheet(build,o={}){
 sheetOpener=document.activeElement;S.ui.shq='';
 S.ui.sheet={build,o};drawSheet();
 requestAnimationFrame(()=>{$('#scrim').classList.add('on');$('#sheet').classList.add('on');syncModal();const f=$('#sheet [autofocus]')||$('#sheet .sh-b button, #sheet .sh-b input, #sheet .sh-f button');f&&f.focus({preventScroll:true});});
}
function drawSheet(){
 const s=S.ui.sheet;if(!s)return;const b=s.build();const el=$('#sheet');const bodyEl=$('.sh-b',el);const st=bodyEl?bodyEl.scrollTop:0;
 el.className='sheet'+(s.o.full?' full':'')+(el.classList.contains('on')?' on':'');
 el.setAttribute('aria-label',b.title||'');
 el.innerHTML=`<div class="grab"></div>${b.title!==false?`<div class="sh-h">${b.lead||''}<h2>${b.title||''}</h2>${b.head||''}<button class="ibtn ghost sm" data-act="closeSheet" aria-label="${L('Закрыть','Close')}">${I.close}</button></div>`:''}${b.search?`<div class="sh-search"><div class="inwrap">${I.search}<input class="inp" type="search" data-in="shq" value="${esc(S.ui.shq||'')}" placeholder="${esc(b.searchPh||L('Найти','Search'))}" aria-label="${esc(b.searchPh||L('Найти','Search'))}" enterkeyhint="search"></div></div>`:''}<div class="sh-b">${b.body||''}</div>${b.foot?`<div class="sh-f">${b.foot}</div>`:''}`;
 const nb=$('.sh-b',el);if(nb){if(b.search&&S.ui.shq)filterSections(nb,S.ui.shq);nb.scrollTop=st;}
}
const resheet=()=>drawSheet();
function closeSheet(instant){
 const s=S&&S.ui.sheet;if(!s)return;S.ui.sheet=null;
 $('#scrim').classList.remove('on');const el=$('#sheet');el.classList.remove('on');
 s.o.onClose&&s.o.onClose();
 syncModal();if(!instant&&sheetOpener&&sheetOpener.isConnected)sheetOpener.focus({preventScroll:true});
}
function ask(o){return new Promise(res=>{
 let resolved=false;const opener=document.activeElement;const d=$('#dialog');const sc=$('#dscrim');
 d.innerHTML=`${o.icon?`<div class="ico ${o.tone||''}">${I[o.icon]}</div>`:''}<h2>${o.title}</h2>${o.text?`<p>${o.text}</p>`:''}<div class="btns"><button class="btn ${o.danger?'danger':'primary'}" data-r="1">${o.ok||L('Продолжить','Continue')}</button><button class="btn soft" data-r="0">${o.cancel||L('Отмена','Cancel')}</button></div>`;
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
const ALIAS={M01:['P04',{add:1}],M03:['P04',{}],F03:['F01',{sub:'following'}],E01:['F01',{sub:'events'}],D06:['D03',{sub:'likes'}],D07:['H01',{sub:'chats'}],C02:['C01',{sub:'joined'}],H06:['H01',{sub:'updates'}]};
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
 if(S.ui.sheet)closeSheet(true);
 if(S.session&&SC[id].auth&&!o.force){return;}
 if(S.session&&ROOT_TAB[id]){return tab(ROOT_TAB[id],p);}
 saveScroll();
 const st=stack();if(o.replace){navNextReplace=true;st.pop();}
 st.push({id,p:{...p},f:{}});
 render(o.dir||'fwd');
}
function back(){
 if(S.ui.sheet){closeSheet();return;}
 const st=stack();
 const r=cur();if(r&&r.dirty&&!r.leaveOk){ask({icon:'warn',tone:'a',title:L('Выйти без сохранения?','Leave without saving?'),text:L('Изменения на этом экране пропадут.','Changes on this screen will be lost.'),ok:L('Выйти','Leave'),cancel:L('Остаться','Stay'),danger:true}).then(ok=>{if(ok){r.leaveOk=true;back();}});return;}
 if(st.length>1){st.pop();render('back');}
 else if(S.session&&S.nav.tab!=='feed')tab('feed');
}
function tab(t,p){
 if(S.ui.sheet)closeSheet(true);
 const st=S.nav.stacks[t];
 if(S.nav.tab===t&&st.length>1&&confirmLeave(()=>tab(t,p),st.slice(1)))return;
 if(S.nav.tab===t){
  if(st.length>1){saveScroll();st.length=1;if(p)Object.assign(st[0].p,p);render('back');return;}
  if(p){Object.assign(st[0].p,p);render('fade');return;}
  const v=$('#main .view');v&&v.scrollTo({top:0,behavior:'smooth'});return;
 }
 saveScroll();S.nav.tab=t;if(p)Object.assign(st[0].p,p);render('fade');
}
/** re-render current screen in place (state changed), keeping scroll */
function refresh(){saveScroll();render(null,true);}
function setP(k,v){cur().p[k]=v;refresh();}
/** switch a root sub-tab: resets that sub-tab's scroll */
function setSub(v){const r=cur();if(r.p.sub===v)return;r.p.sub=v;r.scroll=0;render('fade');}

const main=()=>$('#main');
function render(dir,keep){
 const r=cur();const sc=SC[r.id];
 let html;
 try{html=(sc.valid&&!sc.valid(r.p))?unavailable():sc.render(r.p,r);}
 catch(e){console.error(e);html=`${bar(L('Ошибка','Error'),{back:1})}<div class="view nodock">${empty('alert',L('Экран не загрузился','The screen did not load'),L('Попробуй открыть его ещё раз.','Try opening it again.'),`<button class="btn primary" data-act="reload">${L('Обновить','Reload')}</button>`)}</div>`;}
 const dock=S.session&&sc.root;
 const m=main();
 m.innerHTML=(QA.offline?`<div class="netbar" role="status">${I.wifioff}${L('Нет соединения — показываем сохранённое','Offline — showing what’s loaded')}</div>`:'')+html+(dock?dockHTML():'');
 m.dataset.screen=r.id;
 const v=$('.view',m);
 if(v){
  if(keep||dir==='back')v.scrollTop=r.scroll||0;
  if(dir&&!keep){v.classList.add(dir==='back'?'enter-back':dir==='fade'?'enter-fade':'enter');}
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
const isMatch=id=>S.matches.some(m=>m.p===id);
const isBlocked=id=>S.blocked.some(b=>b.p===id);
const C={
 likesIn:()=>S.likesIn.filter(l=>!isMatch(l.p)&&!isBlocked(l.p)&&!l.passed).length,
 newMatches:()=>S.matches.filter(m=>(!S.threads[m.p]||!S.threads[m.p].msgs.length)&&!isBlocked(m.p)).length,
 unreadChats:()=>Object.entries(S.threads).filter(([k,t])=>t.unread&&!S.archived.has(k)&&!isBlocked(k)).length,
 notif:()=>S.notifs.filter(n=>!n.read&&!(n.p&&isBlocked(n.p))).length,
 updates:()=>S.updates.filter(u=>!u.read).length,
 reqIn:()=>S.reqIn.filter(r=>r.status==='new').length,
 quotaLeft:()=>Math.max(0,(S.me.premium?15:S.quota.max)-S.reqOut.filter(x=>Date.now()-x.t<DAY).length),
 joined:()=>S.joined.size,
 members:id=>COMMUNITIES[id].members+((S.joined.has(id)||COMMUNITIES[id].mine)?1:0), // base count excludes the viewer
};

/* ---------- shared chrome ---------- */
function bar(title,o={}){
 return `<header class="bar ${o.cls||''}">${o.back?`<button class="ibtn ghost" data-back aria-label="${L('Назад','Back')}">${I.back}</button>`:''}${o.lead||''}<h1 class="${o.sm?'sm':''}">${title}${o.sub?`<span class="sub">${o.sub}</span>`:''}</h1>${o.actions||''}</header>`;
}
const bellBtn=()=>{const n=C.notif();return `<button class="ibtn" data-go="N01" aria-label="${L('Уведомления','Notifications')}${n?`: ${n}`:''}">${I.bell}${n?`<sup>${n}</sup>`:''}</button>`;};
const searchBtn=(scope)=>`<button class="ibtn" data-go="G01" data-p='${JSON.stringify({scope:scope||'all'})}' aria-label="${L('Поиск','Search')}">${I.search}</button>`;
const TABDEF=()=>[['feed',I.feed,L('Лента','Feed'),0],['people',I.people,L('Люди','People'),C.likesIn()],['groups',I.groups,L('Сообщества','Communities'),0],['chats',I.chat,L('Чаты','Chats'),C.unreadChats()||(C.newMatches()?'dot':0)],['me',I.me,L('Я','Me'),C.reqIn()]];
function dockHTML(){
 return `<nav class="dock" aria-label="${L('Разделы','Sections')}">${TABDEF().map(([t,icn,l,n])=>`<button class="${S.nav.tab===t?'on':''}" data-tab="${t}" aria-label="${l}${n&&n!=='dot'?`, ${n}`:''}" ${S.nav.tab===t?'aria-current="page"':''}>${icn}<span>${l}</span>${n==='dot'?'<em class="dot"></em>':n?`<em>${n}</em>`:''}</button>`).join('')}</nav>`;
}
function renderSide(){
 const s=$('#side');if(!s)return;
 if(!S.session){s.innerHTML='';return;}
 s.innerHTML=`<div class="brand"><img src="${LOGO()}" alt=""><b>Fet<i>Ure</i></b></div><nav aria-label="${L('Разделы','Sections')}">${TABDEF().map(([t,icn,l,n])=>`<button class="navb ${S.nav.tab===t?'on':''}" data-tab="${t}">${icn}<span>${l}</span>${n==='dot'?'<em style="min-width:9px;width:9px;height:9px;padding:0"></em>':n?`<em>${n}</em>`:''}</button>`).join('')}</nav>
 <button class="btn primary create" data-act="create">${I.plus}${L('Создать','Create')}</button><div class="sp"></div>
 <button class="mebtn" data-tab="me">${av('me','')}<span>${esc(pname('me'))}<small>@${esc(S.me.nick||'…')}</small></span></button>`;
}
function renderCtx(){const c=$('#ctx');if(!c)return;c.innerHTML=S.session&&window.CTX?CTX(S.nav.tab):'';}

/* ---------- small UI builders ---------- */
function seg(items,active,act,cls=''){
 const i=Math.max(0,items.findIndex(x=>x[0]===active));
 return `<div class="seg ${cls}" role="tablist"><span class="knob" style="width:calc((100% - 8px)/${items.length});transform:translateX(${i*100}%)"></span>${items.map(([id,l,n])=>`<button role="tab" aria-selected="${id===active}" class="${id===active?'on':''}" data-act="${act}" data-v="${id}"><span>${l}</span>${n?`<em>${n}</em>`:''}</button>`).join('')}</div>`;
}
function tabsRow(items,active,act){return `<div class="tabs" role="tablist">${items.map(([id,l,n])=>`<button role="tab" aria-selected="${id===active}" class="${id===active?'on':''}" data-act="${act}" data-v="${id}">${l}${n?`<em>${n}</em>`:''}</button>`).join('')}</div>`;}
function empty(icon,title,text,btns=''){return `<div class="empty"><div class="em-ic">${I[icon]}</div><h3>${title}</h3>${text?`<p>${text}</p>`:''}${btns?`<div class="btns">${btns}</div>`:''}</div>`;}
function sw(on){return `<span class="sw ${on?'on':''}" aria-hidden="true"></span>`;}
function toggleRow(act,title,sub,on,extra=''){return `<button class="li" data-act="${act}" ${extra} role="switch" aria-checked="${!!on}"><span class="tx"><b>${title}</b>${sub?`<small>${sub}</small>`:''}</span>${sw(on)}</button>`;}
function linkRow(o){return `<button class="li ${o.cls||''}" ${o.go?`data-go="${o.go}"`:''} ${o.p?`data-p='${JSON.stringify(o.p)}'`:''} ${o.act?`data-act="${o.act}"`:''} ${o.v?`data-v="${o.v}"`:''}>${o.icon?`<span class="ico ${o.tone||''}">${I[o.icon]}</span>`:''}${o.av||''}<span class="tx"><b>${o.title}</b>${o.sub?`<small>${o.sub}</small>`:''}</span>${o.val?`<span class="val">${o.val}</span>`:''}${o.badge?`<span class="pill hot">${o.badge}</span>`:''}${o.noChev?'':I.chev}</button>`;}
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
 if(t.closest('[data-back]')){e.preventDefault();back();return;}
 const tb=t.closest('[data-tab]');if(tb){e.preventDefault();tab(tb.dataset.tab);return;}
 const g=t.closest('[data-go]'),a=t.closest('[data-act]');
 // the innermost interactive element wins (a like button inside a clickable post card)
 if(g&&!g.disabled&&!(a&&g.contains(a))){e.preventDefault();go(g.dataset.go,parseP(g));return;}
 if(a&&!a.disabled&&!a.classList.contains('busy')){const fn=ACT[a.dataset.act];if(fn){e.preventDefault();fn(a,e);}else console.warn('no action',a.dataset.act);}
 if(t.id==='scrim')closeSheet();
});
document.addEventListener('input',e=>{const el=e.target.closest('[data-in]');if(!el)return;const fn=IN[el.dataset.in];fn&&fn(el,e);});
document.addEventListener('change',e=>{const el=e.target.closest('[data-ch]');if(!el)return;const fn=CH[el.dataset.ch];fn&&fn(el,e);});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){if($('#matchLayer .match')){ACT.matchClose();return;}if(S.ui.ask){S.ui.ask();return;}if($('#qa.open')){window.QA_CLOSE&&QA_CLOSE();return;}if(S.ui.sheet){closeSheet();return;}if(stack().length>1)back();}
 if(e.key==='Enter'&&e.target.dataset&&e.target.dataset.enter&&!e.shiftKey){e.preventDefault();ACT[e.target.dataset.enter]?.(e.target,e);}
});
// generic form memory: value lives on the route entry, errors clear while typing
IN.f=el=>{const r=cur();r.f[el.name]=el.value;r.dirty=true;if(r.err&&r.err[el.name])setErr(el.name,'');const c=$(`[data-count="${el.name}"]`);if(c){const max=+c.textContent.split('/')[1];c.textContent=`${el.value.length} / ${max}`;c.classList.toggle('over',el.value.length>max);}};
ACT.closeSheet=()=>closeSheet();
ACT.reload=()=>refresh();
ACT.go=(a)=>go(a.dataset.v,parseP(a));


function modalScope(){return $('#dialog.on')||$('#viewer.on')||$('#matchLayer .match')||$('#qa.open')||$('#sheet.on');}
function syncModal(){const modal=modalScope();for(const x of [$('#main'),$('#side'),$('#ctx')])if(x)x.inert=!!modal;$('#qaFab').inert=!!modal;$('#sheet').inert=!!modal&&modal!==$('#sheet');$('#sheet').setAttribute('aria-hidden',String(!S?.ui.sheet));$('#qa').inert=!$('#qa.open');if(modal&&modal!==$('#sheet')&&S?.ui.sheet)$('#sheet').inert=true;}
new MutationObserver(syncModal).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','style']});
document.addEventListener('keydown',e=>{const modal=modalScope();if(!modal||e.key!=='Tab')return;const nodes=[...modal.querySelectorAll('button,a[href],input,textarea,select,[tabindex="0"]')].filter(x=>!x.disabled&&!x.inert&&x.getClientRects().length);if(!nodes.length){e.preventDefault();modal.tabIndex=-1;modal.focus();return;}const a=nodes[0],z=nodes.at(-1);if(e.shiftKey&&(document.activeElement===a||!modal.contains(document.activeElement))){e.preventDefault();z.focus();}else if(!e.shiftKey&&(document.activeElement===z||!modal.contains(document.activeElement))){e.preventDefault();a.focus();}},true);
window.addEventListener('beforeunload',e=>{if(cur()?.dirty){e.preventDefault();e.returnValue='';}});

/* V7 chrome: the header floats over content (no background, glass icons), its title fades on scroll.
   Footers (.ctabar/.inputbar) are flex items, so the keyboard shrinks the view instead of covering them. */
const barObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>measureBar()):null;
function measureBar(){const m=main(),b=$(':scope>.bar',m);m.style.setProperty('--barh',b?b.getBoundingClientRect().height+'px':'0px');}
function syncChrome(){const m=main();if(cur()?.fq)filterSections($(':scope>.view',m)||m,cur().fq);const b=$(':scope>.bar',m),ft=$(':scope>.ctabar,:scope>.inputbar',m);m.classList.toggle('hasbar',!!b&&!b.classList.contains('overlay'));m.classList.toggle('hascta',!!ft);if(ft)requestAnimationFrame(()=>$('#root').style.setProperty('--ctah',ft.getBoundingClientRect().height+'px'));measureBar();barObserver?.disconnect();if(b)barObserver?.observe(b);
 const v=$(':scope>.view',m);m.style.setProperty('--sc',0);if(v){const on=()=>{const k=Math.min(1,v.scrollTop/48);m.style.setProperty('--sc',k.toFixed(3));m.classList.toggle('scrolled',v.scrollTop>4);};v.addEventListener('scroll',on,{passive:true});on();}}
// keep the focused field visible above the keyboard
document.addEventListener('focusin',e=>{const el=e.target;if(!el.matches?.('input:not([type=checkbox]):not([type=radio]),textarea,select')||!el.closest('#main .view'))return;setTimeout(()=>{if(document.activeElement===el)el.scrollIntoView({block:'center',behavior:'smooth'});},320);});
