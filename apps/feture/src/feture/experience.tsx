import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router';
import { LazyMotion, domAnimation, MotionConfig, m, useReducedMotion } from 'motion/react';
import { Icon, type IconName } from './components/Icon';
import { SectionTitle } from './components/SectionTitle';
import { ActionButton, AppDialog, HintChip, Jar, StateCard, StatusToast } from './components/primitives';
import { motionTokens } from './motion';
import { useExperienceNavigation } from './navigation';
import { apiUrl } from '../api-url';
import fallbackCatalog from '../../data/concept-catalog.json';
import { catalogSchema, categoryProgress, hasIntensity, matchesCategory, matchesCategoryName, matchesInterest, STANCES, EXPERIENCES, BOUNDARIES, isExplored, interestSummary, type Catalog, type InterestRecord, type InterestStance, type Experience, type Boundary, type Visibility } from './model';
import { useInterestMap } from './use-interest-map';

type Tab = 'world'|'explore'|'community'|'dating';
const NAV:{id:Tab;title:string;icon:IconName}[]=[
  {id:'world',title:'Мой мир',icon:'world'}, {id:'explore',title:'Исследовать',icon:'compass'},
  {id:'community',title:'Сообщество',icon:'users'}, {id:'dating',title:'Знакомства',icon:'heart'}
];
const VIEWS:{id:Visibility;label:string}[]=[{id:'private',label:'Только мне'},{id:'granted',label:'По разрешению'},{id:'public',label:'Открыто'}];
type Edit = {id:string; title:string;category:string;definition:string;synonyms:string[];relatedTitles:string[]};
function useCatalog(){
 const [data,setData]=useState<Catalog>(()=>catalogSchema.parse(fallbackCatalog));
 const [source,setSource]=useState<'live'|'offline'|'loading'>('loading');
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
   const controller=new AbortController();
   fetch(apiUrl('/api/catalog'),{signal:controller.signal})
    .then(async response=>{if(!response.ok)throw new Error('catalog_unavailable');return catalogSchema.parse(await response.json());})
    .then(json=>{if(!controller.signal.aborted){setData(json);setSource('live');}})
    .catch(()=>{if(!controller.signal.aborted)setSource('offline');});
   return ()=>controller.abort();
 },[refresh]);
 return {data,source,retry:()=>{setSource('loading');setRefresh(n=>n+1);}};
}
const DEMO_POSTS=[
 {name:'Лена',handle:'@lenexplores',place:'Вопрос сообществу',time:'2 часа назад',photo:1,
  text:'Как вы понимаете, что новый интерес — действительно ваш, а не навязанный окружающими? Мне помогает записывать мысли и возвращаться к ним через несколько дней.',tags:['Самопознание','Личный опыт'],reactions:48},
 {name:'Алекс',handle:'@alex.notes',place:'Разговор о границах',time:'Сегодня',photo:3,
  text:'Умение сказать «нет» — такой же важный навык, как способность честно рассказать о том, что тебе нравится.',tags:['Доверие','Границы'],reactions:71},
 {name:'Майя',handle:'@maya.open',place:'Исследуем вместе',time:'Вчера',photo:5,
  text:'Составила список вопросов, которые помогают знакомиться с собой без спешки. Какие вопросы добавили бы вы?',tags:['Тесты','Разговор'],reactions:36}
];
const PROFILES=[
 {name:'Майя',age:29,city:'Бали',handle:'@maya.open',photos:[5,6],about:'Люблю долгие разговоры, путешествия и людей, которые не боятся быть собой. Исследую новые темы без спешки.',interests:['Доверие','Исследование себя','Путешествия'],looking:'Общение и единомышленники'},
 {name:'Алекс',age:32,city:'Берлин',handle:'@alex.notes',photos:[3,4],about:'Сначала хороший разговор, потом всё остальное. Уважаю личное пространство и люблю открытые вопросы.',interests:['Свидания','Открытость','Культура'],looking:'Новые знакомства'},
 {name:'Ника',age:27,city:'Амстердам',handle:'@nika.day',photos:[1,2],about:'Искренность, самоирония, музыка и любопытство к миру. Люблю узнавать людей через их истории.',interests:['Музыка','Близость','Дружба'],looking:'Друзья и знакомства'}
];
function Photo({n,alt,style}:{n:number;alt:string;style?:CSSProperties}){
 return <img src={`/images/profile-${n}.webp`} alt={alt} loading="lazy" style={style}/>;
}
export function FetureExperience(){
 const {tab,selected,interestId,query,go,openCategory,openInterest,closeInterest,setQuery,rememberScroll,restoreScroll}=useExperienceNavigation();
 const location=useLocation();
 const reduceMotion=useReducedMotion();
 const [person,setPerson]=useState(0);
 const [photo,setPhoto]=useState(0);
 const [datingEnabled,setDatingEnabled]=useState(false);
 const area=useRef<HTMLElement|null>(null);
 const touch=useRef({x:0,y:0});
 const profileRef=useRef<HTMLDivElement|null>(null);
 const {data,source,retry}=useCatalog();
 const {map,loading:mapLoading,error:mapError,saving,save}=useInterestMap();
 const allIds=useMemo(()=>data.categories.flatMap(c=>c.interests.map(i=>i.id)),[data]);
 const overall=categoryProgress(allIds,map);
 const selectedCategory=data.categories.find(c=>c.id===selected);
 const selectedInterest=selectedCategory?.interests.find(i=>i.id===interestId);
 const edit:Edit|null=selectedInterest&&selectedCategory?{...selectedInterest,category:selectedCategory.title,
  relatedTitles:selectedInterest.relatedIds.flatMap(id=>data.categories.flatMap(c=>c.interests).filter(i=>i.id===id).map(i=>i.title))}:null;
 useEffect(()=>{restoreScroll(area.current);},[location.pathname,restoreScroll]);
 return <LazyMotion features={domAnimation}><MotionConfig reducedMotion="user" transition={motionTokens.panel}><div className="ft-shell">
  <a className="ft-skip-link" href="#ft-main" onClick={e=>{e.preventDefault();area.current?.focus()}}>К содержимому</a>
  <aside className="ft-rail">
    <button className="ft-brand" onClick={()=>go('world')} aria-label="На главную"><span>Fet</span>Ure<span className="ft-brand-dot">.</span></button>
    <p className="ft-rail-caption">Пространство, где интересно быть собой.</p>
    <nav className="ft-rail-links" aria-label="Основная навигация">{NAV.map(item=><Link key={item.id} className={`ft-navlink ${tab===item.id?'active':''}`} aria-current={tab===item.id?'page':undefined} to={item.id==='world'?'/':'/'+item.id}><Icon name={item.icon}/>{item.title}</Link>)}</nav>
    <div className="ft-rail-bottom"><p>Твой путь, твои правила</p><Link to="/account"><Icon name="settings" size={18}/> Аккаунт и настройки</Link></div>
  </aside>
  <div className="ft-frame">
    <header className="ft-topbar"><button className="ft-toplogo" onClick={()=>go('world')}>Fet<span>Ure</span></button>
      <span className="ft-topline">Открывай себя. Исследуй других.</span>
      <Link className="ft-account" to="/account" aria-label="Аккаунт"><Icon name="settings" size={19}/></Link>
    </header>
    <nav className="ft-tablet-nav" aria-label="Основные разделы FetUre">
      {NAV.map(item=><Link key={item.id} className={tab===item.id?'active':''}
        aria-current={tab===item.id?'page':undefined}
        to={item.id==='world'?'/':'/'+item.id}><Icon name={item.icon} size={19}/>{item.title}</Link>)}
    </nav>
    <main className="ft-main" id="ft-main" tabIndex={-1} ref={area} onScroll={e=>rememberScroll(e.currentTarget.scrollTop)}>
      <m.div className="ft-content" key={location.pathname} initial={reduceMotion?false:{opacity:0,y:6}} animate={{opacity:1,y:0}}>
        {source!=='live'&&<div className="ft-network-hint" role="status"><Icon name={source==='loading'?'clock':'shield'} size={16}/>{source==='loading'?'Подключаем каталог…':'Нет соединения. Можно продолжить исследование.'}{source==='offline'&&<button onClick={retry}>Обновить</button>}</div>}
        {tab==='world'&&<>
          <div className="ft-hero">
            <div><p className="ft-hero-kicker">Личное пространство</p><h1>Твой мир.<br/><span>Твои грани.</span></h1>
             <p>Здесь можно исследовать желания, интересы и границы — в собственном темпе. Ничего не нужно публиковать.</p>
             <button className="ft-primary ft-hero-cta" onClick={()=>go('explore')}>Продолжить исследование <Icon name="arrow" size={18}/></button></div>
            <div className="ft-hero-art" aria-hidden="true"><span className="ft-orbit one"/><span className="ft-orbit two"/><span className="ft-orbit three"/><span className="ft-orb-center"><Icon name="spark" size={32}/></span></div>
          </div>
          <div className="ft-statbar"><div><strong>{overall.known}<span> / {overall.total}</span></strong><small>тем исследовано</small></div>
             <div><strong>{overall.interests}</strong><small>отмечено интересов</small></div>
             <div><strong>{overall.boundaries}</strong><small>жёстких границ</small></div></div>
          <div className="ft-section-head"><div><h2>Карта моего мира</h2><p>12 направлений. Каждое раскрывается постепенно.</p></div><button className="ft-textbtn" onClick={()=>go('explore')}>Все темы <Icon name="arrow" size={17}/></button></div>
          {mapLoading?<StateCard tone="loading" title="Загружаем личную карту…"/>:<div className="ft-jars">
            {data.categories.map(category=>{
              const progress=categoryProgress(category.interests.map(i=>i.id),map);
              return <button key={category.id} className="ft-jar-card" onClick={()=>openCategory(category.id)} aria-label={`${category.title}, исследовано ${progress.known} из ${progress.total}`}>
                <Jar color={category.color} percent={progress.percent} known={progress.known} total={progress.total}/>
                <strong>{category.short}</strong>
                <span>{progress.boundaries? `${progress.boundaries} границ${progress.boundaries===1?'а':''}` : progress.known ? `${progress.known} тем`:'Не исследовано'}</span>
              </button>;
            })}
          </div>}
          <div className="ft-note"><Icon name="lock" size={18}/><div><strong>Только для тебя</strong><p>По умолчанию карта приватна. Твои отметки сохраняются на этом устройстве.</p></div></div>
          <div className="ft-section-head"><div><h2>Продолжить знакомство с собой</h2><p>Необязательно проходить всё сразу.</p></div></div>
          <div className="ft-recommend">{data.categories.slice(0,3).map((c,i)=><button onClick={()=>openCategory(c.id)} key={c.id} className="ft-recommend-card" style={{'--accent':c.color} as CSSProperties}><span className="ft-recommend-index">0{i+1}</span><strong>{c.title}</strong><small>{c.interests.length} тем для исследования</small><Icon name="arrow" size={17}/></button>)}</div>
        </>}
        {tab==='explore'&&<>
          {selected&&!selectedCategory?<StateCard title="Направление не найдено" description="Вернись к карте и выбери другую тему." action={<ActionButton onClick={()=>go('explore')}>Все направления</ActionButton>}/>:selectedCategory?<><button className="ft-back" onClick={()=>go('explore')}><Icon name="back" size={18}/> Все направления</button>
            <div className="ft-category-banner" style={{'--accent':selectedCategory.color} as CSSProperties}>
              <p>Направление / {selectedCategory.short}</p><h1>{selectedCategory.title}</h1>
              <span>{categoryProgress(selectedCategory.interests.map(i=>i.id),map).known} из {selectedCategory.interests.length} исследовано</span>
            </div><div className="ft-section-head"><div><h2>Темы направления</h2><p>Нажми на интерес, чтобы сохранить своё отношение и видимость.</p></div></div>
            {query.trim()&&<p className="ft-muted">Поиск: «{query.trim()}» <button type="button" className="ft-back" onClick={()=>setQuery('')}>Показать все темы</button></p>}
            <div className="ft-topic-list">{selectedCategory.interests.filter(i=>matchesInterest(i,query)||matchesCategoryName(selectedCategory,query)).map(i=>{
              const state=map[i.id];return <button key={i.id} className="ft-topic" onClick={()=>openInterest(i.id)}>
                <span className={`ft-topic-dot ${state?.boundary==='hard'?'boundary':''}`} style={{background:!isExplored(state)?'#e2dbe1':state?.boundary==='hard'?'#f4dbe2':selectedCategory.color}}>
                  {isExplored(state)?<Icon name={state?.boundary==='hard'?'shield':'check'} size={15}/>:<Icon name="plus" size={15}/>}
                </span><span><strong>{i.title}</strong><small>{interestSummary(state)}{state?.visibility==='public'?' · открыто':state?.visibility==='granted'?' · по разрешению':''}</small></span>
                <Icon name="arrow" size={17}/></button>})}</div>
          </>:<><SectionTitle eyebrow="Исследование" title="Открой новые грани" description="Большая карта интересов, границ и вопросов. Здесь нет правильных или неправильных ответов."/>
          <div className="ft-explore-art"><Icon name="compass" size={36}/><div><strong>Начни с любопытства</strong><p>{allIds.length} темы в {data.categories.length} направлениях. Отмечай только то, что считаешь своим.</p></div></div>
          <label className="ft-search"><Icon name="search" size={20}/><input placeholder="Найти интерес или направление" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Поиск интересов"/></label>
          <div className="ft-section-head"><div><h2>Направления</h2><p>У каждого своя карта и история.</p></div></div>
          {query&&!data.categories.some(c=>matchesCategory(c,query))&&<StateCard title="Ничего не найдено" description="Попробуй другое название или более короткий запрос."/>}
          <div className="ft-category-grid">{data.categories.filter(c=>matchesCategory(c,query)).map(c=>{
            const p=categoryProgress(c.interests.map(i=>i.id),map);
            return <button key={c.id} className="ft-category-card" onClick={()=>openCategory(c.id)}>
              <span className="ft-category-symbol" style={{background:`${c.color}20`,color:c.color}}><Icon name="spark" size={23}/></span>
              <strong>{c.title}</strong><small>{p.known} / {p.total} исследовано</small><div className="ft-mini-progress"><span style={{width:`${p.percent}%`,background:c.color}}/></div></button>;
          })}</div>
          </>}
        </>}
        {tab==='community'&&<><SectionTitle eyebrow="Люди и истории" title="Сообщество" description="Исследовать себя интереснее, когда можно услышать разные взгляды."/>
          <div className="ft-posts">{DEMO_POSTS.map(post=><article className="ft-post" key={post.handle}>
            <div className="ft-post-author"><Photo n={post.photo} alt="" /><div><strong>{post.name} <small>{post.handle}</small></strong><p>{post.place} · {post.time}</p></div></div>
            <p className="ft-post-copy">{post.text}</p><div className="ft-post-tags">{post.tags.map(tag=><HintChip key={tag} title={tag} description="Объединяет публикации по теме. Можно исследовать её, не раскрывая свои личные ответы.">#{tag}</HintChip>)}</div>
          </article>)}</div>
          <div className="ft-section-head"><div><h2>Тематические пространства</h2><p>Разговоры о том, что тебе близко.</p></div></div>
          <div className="ft-group-grid">{['Знакомство с собой','Границы и доверие','Истории и опыт','Вопросы новичков'].map((g,i)=><article className="ft-group" key={g}><span className="ft-group-emoji"><Icon name={i===1?'shield':i===2?'book':i===3?'message':'spark'} size={23}/></span><strong>{g}</strong><small>Тематическое пространство</small></article>)}</div>
        </>}
        {tab==='dating'&&<><SectionTitle eyebrow="Необязательная часть FetUre" title="Знакомства" description="Ты решаешь, когда хочешь знакомиться, а когда — побыть в своём мире."/>
           {!datingEnabled?<div className="ft-dating-off"><div className="ft-dating-halo"><Icon name="heart" size={38}/></div><h2>Только если захочешь</h2>
             <p>Исследуй себя и общайся в сообществе без обязательного поиска партнёров. Смотри профили и узнавай людей в своём темпе.</p>
             <button className="ft-primary" onClick={()=>setDatingEnabled(true)}>Смотреть профили <Icon name="arrow" size={18}/></button>
             </div>:<>
             <div className="ft-dating-container"><div className="ft-dating-card">
               <div className="ft-dating-scroll" key={person} onTouchStart={e=>{touch.current={x:(e.touches[0]?.clientX ?? 0),y:(e.touches[0]?.clientY ?? 0)}}} onTouchEnd={e=>{
                 const dx=(e.changedTouches[0]?.clientX ?? 0)-touch.current.x,dy=(e.changedTouches[0]?.clientY ?? 0)-touch.current.y;
                 if(Math.abs(dx)>90&&Math.abs(dx)>Math.abs(dy)*1.5)nextPerson();
               }}>
                 <div className="ft-dating-photo" style={{backgroundImage:`linear-gradient(180deg, transparent 55%,rgba(24,12,28,.9) 100%),url(/images/profile-${PROFILES[person]!.photos[photo]}.webp)`}}>
                   <div className="ft-photo-dots">{PROFILES[person]!.photos.map((n,i)=><button key={n} className={photo===i?'selected':''} aria-pressed={photo===i} onClick={()=>setPhoto(i)} aria-label={`Фото ${i+1}`}/>)}</div>
                   <div className="ft-photo-caption"><span>{PROFILES[person]!.city}</span><h2>{PROFILES[person]!.name}, {PROFILES[person]!.age}</h2><p>{PROFILES[person]!.handle}</p><button onClick={()=>profileRef.current?.scrollIntoView({behavior:reduceMotion?'instant':'smooth',block:'start'})}>Подробнее о человеке ↓</button></div>
                 </div>
                 <div className="ft-dating-info" ref={profileRef}><p className="ft-eyebrow">О человеке</p><h3>Моя история</h3><p>{PROFILES[person]!.about}</p><h3>Что интересно</h3><div className="ft-post-tags">{PROFILES[person]!.interests.map(t=><HintChip key={t} title={t} description="Интерес помогает начать разговор. Отметка в профиле не означает согласие — желания и границы всегда обсуждаются отдельно.">{t}</HintChip>)}</div><h3>Намерения</h3><p>{PROFILES[person]!.looking}</p><div className="ft-note"><Icon name="shield" size={18}/><p>Личные интересы и границы доступны только с разрешения владельца.</p></div></div>
               </div>
               <div className="ft-dating-actions"><button onClick={nextPerson} aria-label="Следующий профиль"><Icon name="arrow" size={23}/></button></div>
             </div></div>
             <div className="ft-dating-links"><button onClick={()=>setDatingEnabled(false)}>Вернуться</button></div>
           </>}
        </>}

      </m.div>
    </main>
    <nav className="ft-mobile-nav" aria-label="Основная навигация">{NAV.map(x=><Link key={x.id} className={tab===x.id?'active':''} aria-current={tab===x.id?'page':undefined} to={x.id==='world'?'/':'/'+x.id}><Icon name={x.icon} size={22}/><span>{x.title}</span></Link>)}</nav>
  </div>
  {mapError&&<StatusToast tone="error" title="Не удалось прочитать или сохранить карту" description="Проверь свободное место и повтори действие."/>}
  {saving&&<StatusToast tone="loading" title="Сохраняем изменения…"/>}
  {edit&&<InterestDialog key={edit.id} interest={edit} current={map[edit.id]} onClose={closeInterest} onSave={v=>{save(edit.id,v);closeInterest()}}/>}
 </div></MotionConfig></LazyMotion>;
 function nextPerson(){setPerson((person+1)%PROFILES.length);setPhoto(0)}
}
function InterestDialog({interest,current,onClose,onSave}:{interest:Edit;current:InterestRecord|undefined;onClose:()=>void;onSave:(v:Omit<InterestRecord,'at'>)=>void}){
 const [stance,setStance]=useState<InterestStance>(current?.stance||'unknown');
 const [experience,setExperience]=useState<Experience>(current?.experience||'unspecified');
 const [boundary,setBoundary]=useState<Boundary>(current?.boundary||'none');
 const [boundaryNote,setBoundaryNote]=useState(current?.boundaryNote??'');
 const [intensity,setIntensity]=useState<number|null>(current?.intensity??null);
 const [visibility,setVisibility]=useState<Visibility>(current?.visibility||'private');
 const canScore=hasIntensity(stance,boundary);
 return <AppDialog title={interest.title} eyebrow={interest.category} onClose={onClose}>
  <p className="ft-muted">{interest.definition}</p>
  {interest.synonyms.length>0&&<p className="ft-muted"><small>Также ищут: {interest.synonyms.join(', ')}.</small></p>}
  {interest.relatedTitles.length>0&&<p className="ft-muted"><small>Связанные темы: {interest.relatedTitles.join(', ')}.</small></p>}
  <fieldset className="ft-editor-group"><legend>Моё желание</legend><div className="ft-statuses">{STANCES.map(item=><button type="button" key={item.id} className={`ft-status ${stance===item.id?'active':''}`} aria-pressed={stance===item.id} onClick={()=>{setStance(item.id);if(!hasIntensity(item.id,boundary))setIntensity(null);}}><span>{item.label}<small>{item.description}</small></span>{stance===item.id&&<Icon name="check" size={18}/>}</button>)}</div></fieldset>
  {canScore&&<div className="ft-intensity"><label htmlFor={intensity===null?undefined:'ft-intensity'}>Сила интереса <strong>{intensity===null?'Не указана':`${intensity}/5`}</strong></label>
   <button type="button" className="ft-textbtn" onClick={()=>setIntensity(intensity===null?3:null)}>{intensity===null?'Указать силу':'Оставить без оценки'}</button>
   {intensity!==null&&<input id="ft-intensity" type="range" min="1" max="5" step="1" value={intensity} onChange={e=>setIntensity(Number(e.target.value))}/>}
   <small>1 — слабый интерес, 5 — сильный. Оценка не означает согласие.</small></div>}
  <fieldset className="ft-editor-group"><legend>Мой опыт</legend><div className="ft-visibility-options">{EXPERIENCES.map(item=><button type="button" key={item.id} className={experience===item.id?'active':''} aria-pressed={experience===item.id} onClick={()=>setExperience(item.id)}>{item.label}</button>)}</div><p className="ft-muted">Прошлый опыт не означает желание повторить.</p></fieldset>
  <fieldset className="ft-editor-group"><legend>Моя граница</legend><div className="ft-statuses">{BOUNDARIES.map(item=><button type="button" key={item.id} className={`ft-status ${boundary===item.id?'active':''} ${item.id==='hard'?'ft-hard':''}`} aria-pressed={boundary===item.id} onClick={()=>{setBoundary(item.id);if(item.id==='hard')setIntensity(null);if(item.id!=='conditional')setBoundaryNote('');}}><span>{item.label}</span>{boundary===item.id&&<Icon name="check" size={18}/>}</button>)}</div>
   <p className="ft-muted">Жёсткая граница означает «нет», независимо от желания и опыта. Неотмеченная граница не означает согласие.</p>
   {boundary==='conditional'&&<div className="ft-conditions"><label htmlFor="ft-boundary-note">Условия — только для меня</label><textarea id="ft-boundary-note" maxLength={1000} rows={3} value={boundaryNote} onChange={e=>setBoundaryNote(e.target.value)} placeholder="Что важно для моего комфорта?"/><small>{boundaryNote.length}/1000 · Текст условий не публикуется.</small></div>}
  </fieldset>
  <div className="ft-visibility"><strong>Кто может видеть отметку?</strong><div className="ft-visibility-options">{VIEWS.map(v=><button type="button" key={v.id} className={visibility===v.id?'active':''} aria-pressed={visibility===v.id} onClick={()=>setVisibility(v.id)}>{v.label}</button>)}</div><small>Пока отметки хранятся локально и никому не передаются. Выбранная видимость пригодится для будущего профиля. Условия всегда остаются приватными.</small></div>
  <ActionButton className="ft-save" onClick={()=>onSave({stance,experience,boundary,boundaryNote:boundary==='conditional'?(boundaryNote||null):null,intensity:canScore?intensity:null,visibility,useForDiscovery:current?.useForDiscovery??false})}>Сохранить <Icon name="check" size={18}/></ActionButton>
 </AppDialog>;
}
