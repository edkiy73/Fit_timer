import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { Link } from 'react-router';
import { Icon } from './components/Icon';
import { ActionButton, AppDialog, HintChip } from './components/primitives';
import { useQueryOverlay } from './navigation';
import './dating-design.css';

// Owner-approved prelaunch DESIGN FIXTURES, not discovery DTOs. No account,
// network write, consent, grant, match or messages are created by this component.
const DESIGN_PROFILES = [
 {id:'maya',name:'Майя',age:29,city:'Бали',photos:[5,6],about:'Люблю долгие разговоры, путешествия и людей, которые не боятся быть собой. Исследую новые темы без спешки.',interests:['Доверие','Исследование себя','Путешествия'],looking:'Общение и единомышленники',quote:'Хороший разговор — уже маленькое приключение.'},
 {id:'alex',name:'Алекс',age:32,city:'Берлин',photos:[3,4],about:'Сначала хороший разговор, потом всё остальное. Уважаю личное пространство и люблю открытые вопросы.',interests:['Свидания','Открытость','Культура'],looking:'Новые знакомства',quote:'Мне интересно, что заставляет тебя забыть о времени.'},
 {id:'nika',name:'Ника',age:27,city:'Амстердам',photos:[1,2],about:'Искренность, самоирония, музыка и любопытство к миру. Люблю узнавать людей через их истории.',interests:['Музыка','Близость','Дружба'],looking:'Друзья и знакомства',quote:'Быть собой гораздо интереснее, чем казаться идеальным.'}
] as const;
type DesignProfile = typeof DESIGN_PROFILES[number];
type Filters = {city:string;age:'all'|'under30'|'30plus'};
type Decision = {id:string;kind:'like'|'pass'};
const INITIAL_FILTERS:Filters={city:'all',age:'all'};

export function DatingDesign(){
 const reduced=useReducedMotion();
 const overlay=useQueryOverlay('datingPanel');
 const [started,setStarted]=useState(false);
 const [filters,setFilters]=useState<Filters>(INITIAL_FILTERS);
 const [draft,setDraft]=useState<Filters>(INITIAL_FILTERS);
 const [history,setHistory]=useState<Decision[]>([]);
 const [direction,setDirection]=useState(1);
 const [transitioning,setTransitioning]=useState(false);
 const transitionLock=useRef(false);
 const releaseTransition=()=>{transitionLock.current=false;setTransitioning(false)};
 const available=useMemo(()=>DESIGN_PROFILES.filter(p=>(filters.city==='all'||p.city===filters.city)&&(filters.age==='all'||(filters.age==='under30'?p.age<30:p.age>=30))&&!history.some(h=>h.id===p.id)),[filters,history]);
 const current=available[0];
 const likes=history.filter(h=>h.kind==='like').length;
 const close=()=>overlay.close();
 const openFilters=()=>{setDraft(filters);overlay.open('filters')};
 const decide=(kind:Decision['kind'])=>{
  if(!current||transitionLock.current)return;
  transitionLock.current=true;setTransitioning(true);
  setDirection(kind==='like'?1:-1);
  setHistory(old=>old.some(h=>h.id===current.id)?old:[...old,{id:current.id,kind}]);
 };
 const changeSelection=(nextHistory:Decision[],nextFilters:Filters=filters)=>{
  const next=DESIGN_PROFILES.find(p=>(nextFilters.city==='all'||p.city===nextFilters.city)&&(nextFilters.age==='all'||(nextFilters.age==='under30'?p.age<30:p.age>=30))&&!nextHistory.some(h=>h.id===p.id));
  if(started&&next?.id!==current?.id){transitionLock.current=true;setTransitioning(true)}
  setHistory(nextHistory);setFilters(nextFilters);setDirection(0);
 };
 const undo=()=>{if(transitionLock.current)return;changeSelection(history.slice(0,-1))};
 return <section className="ft-connect" aria-labelledby="ft-connect-title">
  <header className="ft-connect-heading"><div><span className="ft-connect-eyebrow">Люди, с которыми можно быть собой</span><h1 id="ft-connect-title">На одной <em>волне.</em></h1></div>
   {started&&<button type="button" className="ft-connect-filter" disabled={transitioning} onClick={openFilters}><Icon name="settings" size={18}/> Фильтры{(filters.city!=='all'||filters.age!=='all')&&<span aria-label="Есть выбранные фильтры"/>}</button>}
  </header>
  {!started?<div className="ft-connect-intro">
   <div className="ft-connect-intro-copy"><span className="ft-connect-pill"><Icon name="heart" size={15}/> Знакомства — по желанию</span><h2>Не искать идеальных.<br/><em>Встречать своих.</em></h2><p>Начни с любопытства. Общие темы помогают заговорить, а уважение к границам — услышать друг друга.</p><ActionButton onClick={()=>setStarted(true)}>Открыть знакомства <Icon name="arrow" size={19}/></ActionButton><Link to="/world">Мне пока хорошо в своём мире <Icon name="arrow" size={16}/></Link></div>
   <div className="ft-connect-intro-art" aria-hidden="true"><img src="/images/profile-5.webp" alt=""/><div><Icon name="spark" size={25}/><strong>Совпасть во взглядах.<br/>Остаться собой.</strong></div></div>
   <div className="ft-connect-principles"><span><Icon name="lock" size={19}/><strong>Личное остаётся личным</strong><small>Ты выбираешь, что раскрыть</small></span><span><Icon name="message" size={19}/><strong>Без спешки и ожиданий</strong><small>Твой темп знакомства</small></span><span><Icon name="shield" size={19}/><strong>Границы важнее симпатии</strong><small>Об интересах можно поговорить</small></span></div>
  </div>:<>
   <div className="ft-connect-toolbar"><span><Icon name="compass" size={16}/>{filters.city==='all'?'Без границ на карте':filters.city}{filters.age!=='all'&&` · ${filters.age==='under30'?'18–29 лет':'От 30 лет'}`}</span><button type="button" onClick={()=>overlay.open('likes')}><Icon name="heart" size={16}/> Мои симпатии{likes>0&&<b>{likes}</b>}</button></div>
   <div className="ft-connect-layout">
    <div className="ft-connect-stage">
     <AnimatePresence mode="wait" initial={false} custom={direction}>
      {current?<m.div key={current.id} className="ft-connect-card" custom={direction} variants={{enter:(d:number)=>({opacity:0,x:reduced?0:d*24,scale:reduced?1:.98}),visible:{opacity:1,x:0,scale:1},exit:(d:number)=>({opacity:0,x:reduced?0:d*55,scale:reduced?1:.98})}} initial="enter" animate="visible" exit="exit" transition={{duration:reduced?0:.22,ease:[.2,.8,.2,1]}} onAnimationComplete={definition=>{if(definition==='visible')releaseTransition()}}>
       <ProfileCard profile={current} onDecision={decide}/>
      </m.div>:<m.div key="empty" className="ft-connect-empty" initial={{opacity:0}} animate={{opacity:1}} onAnimationComplete={releaseTransition}><Icon name="compass" size={38}/><span className="ft-connect-eyebrow">Можно никуда не спешить</span><h2>На сегодня<br/>все знакомства.</h2><p>Измени фильтры или вернись к тем, кто вызвал интерес.</p><ActionButton onClick={openFilters}>Изменить фильтры <Icon name="settings" size={18}/></ActionButton><button type="button" onClick={()=>{changeSelection(history.filter(h=>h.kind==='like'))}}>Посмотреть ещё раз</button></m.div>}
     </AnimatePresence>
     <div className="ft-connect-actions"><button type="button" className="ft-connect-undo" disabled={!history.length||transitioning} onClick={undo} aria-label="Отменить последний выбор"><Icon name="back" size={21}/><small>Отменить</small></button><button type="button" className="ft-connect-pass" disabled={!current||transitioning} onClick={()=>decide('pass')} aria-label="Пропустить профиль"><Icon name="close" size={27}/><small>Пропустить</small></button><button type="button" className="ft-connect-like" disabled={!current||transitioning} onClick={()=>decide('like')} aria-label="Нравится профиль"><Icon name="heart" size={28}/><small>Нравится</small></button></div>
    </div>
    <aside className="ft-connect-companion"><span className="ft-connect-eyebrow">Начни с разговора</span><h2>Интереснее<br/><em>без сценария.</em></h2><p>Не обязательно совпадать во всём. Иногда достаточно одной темы, которую хочется обсудить.</p><div className="ft-connect-conversation"><Icon name="message" size={22}/><span>Вопрос для знакомства</span><strong>«Что ты недавно узнал о себе?»</strong></div><div className="ft-connect-safety"><Icon name="shield" size={21}/><div><strong>Симпатия — не согласие</strong><p>Личные темы и границы обсуждаются отдельно. Закрытые части профиля остаются закрытыми.</p></div></div><Link to="/explore">Найти тему для разговора <Icon name="arrow" size={17}/></Link><button type="button" className="ft-connect-pause" onClick={()=>{releaseTransition();setStarted(false);setHistory([])}}>Вернуться к началу</button></aside>
   </div>
  </>}
  {overlay.value==='filters'&&<AppDialog title="Кого хочется встретить?" eyebrow="Твой круг общения" onClose={close} presentation="adaptive"><form className="ft-connect-filter-form" onSubmit={e=>{e.preventDefault();changeSelection(history.filter(h=>h.kind==='like'),draft);close()}}><fieldset><legend>Где знакомиться</legend><p>Выбери город. Точная геолокация не нужна.</p><div>{['all','Бали','Берлин','Амстердам'].map(city=><button type="button" key={city} aria-pressed={draft.city===city} onClick={()=>setDraft({...draft,city})}>{city==='all'?'Весь мир':city}</button>)}</div></fieldset><fieldset><legend>Возраст</legend><div>{(['all','under30','30plus'] as const).map(age=><button type="button" key={age} aria-pressed={draft.age===age} onClick={()=>setDraft({...draft,age})}>{age==='all'?'Любой, от 18':age==='under30'?'18–29':'От 30'}</button>)}</div></fieldset><div className="ft-connect-filter-footer"><button type="button" onClick={()=>setDraft(INITIAL_FILTERS)}>Сбросить</button><ActionButton type="submit">Показать профили <Icon name="arrow" size={18}/></ActionButton></div></form></AppDialog>}
  {overlay.value==='likes'&&<AppDialog title="Кто вызвал интерес" eyebrow="Мои симпатии" onClose={close} presentation="adaptive"><div className="ft-connect-liked-list">{likes===0?<><Icon name="heart" size={32}/><p>Пока здесь никого. Когда кто-то понравится, можно будет вернуться к его профилю.</p></>:DESIGN_PROFILES.filter(p=>history.some(h=>h.id===p.id&&h.kind==='like')).map(p=><div key={p.id}><img src={`/images/profile-${p.photos[0]}.webp`} alt=""/><span><strong>{p.name}, {p.age}</strong><small>{p.city} · {p.looking}</small></span><button type="button" aria-label={`Вернуть профиль: ${p.name}`} onClick={()=>{changeSelection(history.filter(h=>h.id!==p.id),INITIAL_FILTERS);close()}}><Icon name="arrow" size={20}/></button></div>)}</div></AppDialog>}
 </section>;
}

function ProfileCard({profile,onDecision}:{profile:DesignProfile;onDecision:(kind:Decision['kind'])=>void}){
 const reduced=useReducedMotion();
 const [photo,setPhoto]=useState(0);
 const [drag,setDrag]=useState(0);
 const scroll=useRef<HTMLDivElement>(null);
 const details=useRef<HTMLDivElement>(null);
 const gesture=useRef<{id:number;x:number;y:number;axis:'x'|'y'|null}|null>(null);
 const pointerDown=(e:PointerEvent<HTMLDivElement>)=>{
  if(e.button!==0||(e.target as HTMLElement).closest('button,a,input'))return;
  gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,axis:null};
 };
 const pointerMove=(e:PointerEvent<HTMLDivElement>)=>{
  const g=gesture.current;if(!g||g.id!==e.pointerId)return;
  const dx=e.clientX-g.x,dy=e.clientY-g.y;
  if(!g.axis&&Math.max(Math.abs(dx),Math.abs(dy))>12){g.axis=Math.abs(dx)>Math.abs(dy)*1.4?'x':'y';if(g.axis==='x')e.currentTarget.setPointerCapture(e.pointerId);}
  if(g.axis==='x')setDrag(Math.max(-150,Math.min(150,dx)));
 };
 const reset=()=>{gesture.current=null;setDrag(0)};
 const pointerUp=(e:PointerEvent<HTMLDivElement>)=>{
  const g=gesture.current;if(!g||g.id!==e.pointerId)return;
  const dx=e.clientX-g.x;const chosen=g.axis==='x'&&Math.abs(dx)>90;
  reset();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  if(chosen)onDecision(dx>0?'like':'pass');
 };
 return <div className="ft-connect-profile" ref={scroll} tabIndex={0} aria-label={`Профиль: ${profile.name}. Прокрути, чтобы узнать больше.`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={reset} onLostPointerCapture={reset} style={reduced?undefined:{transform:`translateX(${drag*.28}px) rotate(${drag*.025}deg)`}}>
  <div className="ft-connect-photo"><img key={photo} src={`/images/profile-${profile.photos[photo]}.webp`} alt={`${profile.name}, фото ${photo+1}`} draggable={false}/><div className="ft-connect-photo-shade"/>
   <div className="ft-connect-gallery" aria-label="Фотографии профиля">{profile.photos.map((n,i)=><button type="button" key={n} aria-label={`Показать фото ${i+1}`} aria-pressed={photo===i} onClick={()=>setPhoto(i)}><span/></button>)}</div>
   <button type="button" className="ft-connect-photo-prev" aria-label="Предыдущее фото" onClick={()=>setPhoto((photo+profile.photos.length-1)%profile.photos.length)}><Icon name="back" size={20}/></button><button type="button" className="ft-connect-photo-next" aria-label="Следующее фото" onClick={()=>setPhoto((photo+1)%profile.photos.length)}><Icon name="arrow" size={20}/></button>
   {Math.abs(drag)>30&&<span className={`ft-connect-stamp ${drag>0?'like':'pass'}`} aria-hidden="true">{drag>0?'Нравится':'Пропустить'}</span>}
   <div className="ft-connect-photo-caption"><span className="ft-connect-location"><Icon name="compass" size={15}/>{profile.city}</span><h2>{profile.name}<span>{profile.age}</span></h2><p>{profile.looking}</p><div>{profile.interests.slice(0,2).map(t=><span key={t}>{t}</span>)}</div><button type="button" onClick={()=>{if(details.current&&scroll.current)scroll.current.scrollTo({top:details.current.offsetTop-scroll.current.offsetTop,behavior:reduced?'instant':'smooth'})}}>Больше о человеке <Icon name="arrow" size={16}/></button></div>
  </div>
  <div className="ft-connect-details" ref={details} tabIndex={0} aria-label={`Подробнее: ${profile.name}`}><span className="ft-connect-eyebrow">Знакомство чуть ближе</span><blockquote>«{profile.quote}»</blockquote><h3>Немного обо мне</h3><p>{profile.about}</p><h3>Можно поговорить об этом</h3><div className="ft-connect-interests">{profile.interests.map(t=><HintChip key={t} title={t} description="Тема помогает начать разговор. Интерес в профиле не означает согласия — желания и границы обсуждаются отдельно.">{t}</HintChip>)}</div><h3>Что я ищу</h3><p>{profile.looking}. Хочется узнавать друг друга без спешки.</p><div className="ft-connect-private"><Icon name="lock" size={21}/><div><strong>Личный мир</strong><p>Закрытые интересы и границы не видны в карточке. Человек сам решает, чем поделиться.</p></div></div></div>
 </div>;
}
