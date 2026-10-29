import {useEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Check,ChevronLeft,ChevronRight,EyeOff,Globe,Heart,KeyRound,LockOpen,MapPin,MessageCircle} from 'lucide-react';
import {Btn,H,IconBtn,plate} from './kit';
import {TermsSheet} from './terms-sheet';

/** V21 A01 «Приветствие» with the prototype's markup (`.welcome.wv`): the hero, six slides that cross-fade as the
 * active bar fills (CSS animation; hover/focus pauses it, reduced motion stops it), swipe and arrow keys, then
 * «Создать аккаунт» / «У меня уже есть аккаунт» → A02 in that mode; «условиями» opens the terms sheet. */

const N=6;
/** `wFit()` — each slide's picture as large as its space allows (up to 1.12 on a desktop), never cut. */
function fit(root:HTMLElement){
 const max=innerWidth>=1024?1.12:1;
 root.querySelectorAll<HTMLElement>('.w-vis').forEach(v=>{const c=v.firstElementChild as HTMLElement|null;if(!c)return;c.style.transform='none';
  const cs=getComputedStyle(v),pw=v.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight),ph=v.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
  const w=c.scrollWidth,h=c.scrollHeight;if(!w||!h)return;const k=Math.min(max,pw/w,ph/h);
  c.style.transformOrigin='50% 0';c.style.transform=`translateY(${Math.max(0,(ph-h*k)/2).toFixed(1)}px) scale(${k.toFixed(3)})`;});
}
const nn=(n:number)=>String(n+1).padStart(2,'0');
/** `av(id,cls)` without a photo: initials on a plate. */
// The prototype's demo people (same photos as its PEOPLE seed).
const PHOTO:Record<string,number>={Sofi:1,Leon:2,Mia:3,Kai:4,Ari:6,Lina:9};
function Ava({name,cls}:{name:string,cls:string}){
 const n=PHOTO[name];
 if(n)return <span className={'av '+cls}><img src={import.meta.env.BASE_URL+'images/profile-'+n+'-45.webp'} alt="" loading="lazy"/></span>;
 return <span className={'av ini '+cls}><div className="plate" style={plate(name)}/><b className="k-anchor">{name[0]}</b></span>;
}

export function Welcome({onStart}:{onStart:(mode:'up'|'in')=>void}){
 const {t,locale,canSwitch,setPreference}=useI18n();
 const [cur,setCur]=useState(0);const x0=useRef<{x:number,y:number}|null>(null);const box=useRef<HTMLDivElement>(null);
 useEffect(()=>{const el=box.current;if(!el)return;const go=()=>fit(el);go();addEventListener('resize',go);return ()=>removeEventListener('resize',go);},[locale]);
 const [terms,setTerms]=useState(false);
 const show=(i:number)=>setCur(((i%N)+N)%N);
 const start=(mode:'up'|'in')=>onStart(mode);
 const role=(d:string[])=>d.length===3?t('fe.int.role.all'):d.map(x=>t('fe.int.role.'+x)).join(' · ');
 const jars:[string,number,string[]][]=[['shibari',10,['give']],['aftercare',8,['get']],['roleplay',6,['give','get','watch']],['latex',3,['watch']]];
 const visuals:ReactNode[]=[
  <div className="wf-ev"><div className="wf-date"><small>{t('fe.cw.w.ev.dow')}</small><b>19</b></div><div className="wf-ev-b"><b>{t('fe.cw.w.ev.title')}</b><small><MapPin/>{t('fe.cw.w.ev.place')}</small>
   <div className="wf-ppl">{['Sofi','Mia','Kai','Leon'].map(n=><Ava key={n} name={n} cls="wf-sm"/>)}<em>+38</em></div></div></div>,
  <div className="wf-jars"><div className="jars caps">{jars.map(([k,lv,d],i)=><div key={k} className={'sc'+(lv>=10?' full':'')} style={{'--v':lv,'--lv':lv,'--d':`${i*.04}s`} as CSSProperties}>
   <span className="sc-f"/><span className="sc-l"><span className="sc-n">{t('fe.cw.w.t.'+k)}</span><span className="sc-v"><b>{lv}</b><em>{role(d)}</em></span></span></div>)}</div></div>,
  <div className="wf-layers">{([[Globe,'nick','ok'],[KeyRound,'priv','v'],[EyeOff,'journal','']] as const).map(([Icon,k,c],n)=>
   <div key={k} className="wf-row" style={{'--n':n} as CSSProperties}><span className="wf-ic"><Icon/></span><b>{t('fe.cw.w.l.'+k)}</b><em className={c}>{t('fe.cw.w.l.'+k+'Who')}</em></div>)}</div>,
  <div className="wf-req"><div className="wf-req-h"><Ava name="Mia" cls="wf-av"/><span><b>Mia</b><small>{t('fe.cw.w.r.asks')}</small></span></div>
   <div className="wf-dur">{['d1','d7','d30'].map((d,n)=><span key={d} className={n===1?'on':''}>{t('fe.cw.w.r.'+d)}</span>)}</div>
   <div className="wf-req-f"><LockOpen/><span>{t('fe.cw.w.r.revoke')}</span></div></div>,
  <div className="wf-match"><div className="wf-pair"><Ava name="Lina" cls="wf-big"/><span className="wf-heart"><Heart/></span><Ava name="Ari" cls="wf-big"/></div>
   <div className="wf-bub l">{t('fe.cw.w.m.b1')}</div><div className="wf-bub r">{t('fe.cw.w.m.b2')}</div></div>,
  <div className="wf-cmp"><div className="venn"><i/><i/><b>3<small>{t('fe.cw.w.c.shared')}</small></b></div>
   <div className="wf-facts"><span className="wf-f g"><Check/>{t('fe.cw.w.c.f1')}</span><span className="wf-f a"><MessageCircle/>{t('fe.cw.w.c.f2')}</span></div></div>,
 ];
 const k=(n:number)=>t(`fe.cw.w.s${n}.k`);
 return <div className="stage"><div className="root auth"><main className="main" data-screen="A01">
  <div ref={box} className="welcome wv"><div className="w-aura" aria-hidden="true"><i/><i/><i/></div><div className="w-mark" aria-hidden="true">FetUre</div>
   <header className="w-top"><div className="w-brand"><img className="w-logo" src={import.meta.env.BASE_URL+'fe-logo.svg'} alt=""/><b>Fet<i>Ure</i></b></div>
    {canSwitch&&<div className="langsw" role="group" aria-label="Language">{(['ru','en'] as const).map(l=><button key={l} type="button" className={locale===l?'on':''} aria-pressed={locale===l} onClick={()=>setPreference(l)}>{l.toUpperCase()}</button>)}</div>}
   </header>
   <div className="w-grid">
    <div className="w-head">
     <p className="w-kick"><i/>{t('fe.cw.w.kick')}</p>
     <H level={1} className="w-title">{t('fe.cw.w.title1')} <em>{t('fe.cw.w.titleEm')}</em> {t('fe.cw.w.title2')}</H>
     <p className="w-sub">{t('fe.cw.w.sub')}</p>
     <p className="w-sub-s">{t('fe.cw.w.subShort')}</p>
    </div>
    <section className="w-show" aria-roledescription={t('fe.cw.w.carousel')} aria-label={t('fe.cw.w.highlights')}
     onAnimationEnd={e=>{if((e.target as HTMLElement).matches('.w-pb.on>i'))show(cur+1);}}
     onKeyDown={e=>{if(e.key==='ArrowRight')show(cur+1);else if(e.key==='ArrowLeft')show(cur-1);}}>
     <div className="w-prog">{visuals.map((_,n)=><button key={n} type="button" className={'w-pb'+(n===cur?' on':'')+(n<cur?' done':'')} aria-label={`${nn(n)} · ${k(n)}`} aria-current={n===cur} onClick={()=>show(n)}><i/></button>)}</div>
     <div className="w-stage" onPointerDown={e=>{x0.current={x:e.clientX,y:e.clientY};}} onPointerCancel={()=>{x0.current=null;}}
      onPointerUp={e=>{const s=x0.current;x0.current=null;if(!s)return;const dx=e.clientX-s.x,dy=e.clientY-s.y;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy))show(cur+(dx<0?1:-1));}}>
      {visuals.map((v,n)=><article key={n} className={'w-slide'+(n===cur?' on':'')} aria-hidden={n!==cur}>
       <div className="w-vis" aria-hidden="true">{v}</div>
       <div className="w-txt"><span className="w-k">{nn(n)} · {k(n)}</span><H level={2}>{t(`fe.cw.w.s${n}.h`)}</H><p>{t(`fe.cw.w.s${n}.p`)}</p></div>
      </article>)}
     </div>
     <div className="w-ctrl"><span className="w-count"><b>{nn(cur)}</b> / {nn(N-1)}</span><span className="w-arrows">
      <IconBtn icon={ChevronLeft} label={t('fe.cw.w.prev')} onClick={()=>show(cur-1)}/>
      <IconBtn icon={ChevronRight} label={t('fe.cw.w.next')} onClick={()=>show(cur+1)}/></span></div>
    </section>
    <div className="w-act">
     <div className="w-cta"><Btn onClick={()=>start('up')}>{t('fe.cw.w.create')}</Btn><Btn kind="soft" onClick={()=>start('in')}>{t('fe.cw.w.haveAccount')}</Btn></div>
     <div className="w-age">{t('fe.cw.w.age')} <a href="#" onClick={e=>{e.preventDefault();setTerms(true);}}>{t('fe.cw.w.terms')}</a>.</div>
    </div>
   </div>
  </div>
  {terms&&<TermsSheet onClose={()=>setTerms(false)}/>}
 </main></div></div>;
}
