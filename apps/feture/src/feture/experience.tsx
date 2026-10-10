import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { apiUrl } from '../api-url';
import fallbackCatalog from '../../data/concept-catalog.json';
import { catalogSchema, categoryProgress, hasIntensity, STATUSES, type Catalog, type InterestRecord, type InterestStatus, type Visibility } from './model';
import { useInterestMap } from './use-interest-map';

type Tab = 'world'|'explore'|'community'|'dating';
type IconName = 'world'|'compass'|'users'|'heart'|'arrow'|'back'|'check'|'lock'|'close'|'plus'|'search'|'shield'|'book'|'message'|'spark'|'eye'|'clock'|'settings';
function Icon({name,size=20}:{name:IconName,size?:number}){
  const paths:Record<IconName,ReactNode> = {
    world:<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 4 3 14 0 18M12 3c-3 4-3 14 0 18"/></>,
    compass:<><circle cx="12" cy="12" r="9"/><path d="m16 8-2.8 5.2L8 16l2.8-5.2L16 8Z"/></>,
    users:<><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5"/></>,
    heart:<path d="M20.5 9.2c0 4.7-8.5 10.3-8.5 10.3S3.5 13.9 3.5 9.2a4.7 4.7 0 0 1 8.5-2.7 4.7 4.7 0 0 1 8.5 2.7Z"/>,
    arrow:<path d="M5 12h14m-6-6 6 6-6 6"/>,back:<path d="M19 12H5m6-6-6 6 6 6"/>,
    check:<path d="m4 12 5 5L20 6"/>,lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    close:<path d="M5 5 19 19M19 5 5 19"/>,plus:<path d="M12 5v14M5 12h14"/>,
    search:<><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></>,
    shield:<><path d="m12 2 8 4v6c0 5-3 8-8 10-5-2-8-5-8-10V6l8-4Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></>,
    book:<><path d="M12 5C8 3 5 3 2 4v15c3-1 6-1 10 1 4-2 7-2 10-1V4c-3-1-6-1-10 1Z"/><path d="M12 5v15"/></>,
    message:<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.6-5a8.5 8.5 0 1 1 16.4-4.5Z"/>,
    spark:<path d="m12 2 1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2ZM19 17v5m-2.5-2.5h5"/>,
    eye:<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    settings:<><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></>
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>{paths[name]}</svg>;
}
const NAV:{id:Tab;title:string;icon:IconName}[]=[
  {id:'world',title:'Мой мир',icon:'world'}, {id:'explore',title:'Исследовать',icon:'compass'},
  {id:'community',title:'Сообщество',icon:'users'}, {id:'dating',title:'Знакомства',icon:'heart'}
];
const STATUS_LABEL:Record<InterestStatus,string>=Object.fromEntries(STATUSES.map(s=>[s.id,s.label])) as Record<InterestStatus,string>;
const VIEWS:{id:Visibility;label:string}[]=[{id:'private',label:'Только мне'},{id:'granted',label:'По разрешению'},{id:'public',label:'Открыто'}];
type Edit = {id:string; title:string;category:string};
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
function SectionTitle({eyebrow,title,description}:{eyebrow:string;title:string;description?:string}){
 return <div className="ft-heading"><p className="ft-eyebrow">{eyebrow}</p><h1>{title}</h1>{description&&<p className="ft-muted">{description}</p>}</div>;
}
function Photo({n,alt,style}:{n:number;alt:string;style?:CSSProperties}){
 return <img src={`/images/profile-${n}.webp`} alt={alt} loading="lazy" style={style}/>;
}
export function FetureExperience(){
 const [tab,setTab]=useState<Tab>('world');
 const [selected,setSelected]=useState<string|null>(null);
 const [edit,setEdit]=useState<Edit|null>(null);
 const [query,setQuery]=useState('');
 const [dialog,setDialog]=useState<string|null>(null);
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
 function go(next:Tab){setTab(next);setSelected(null);setEdit(null);setDialog(null);area.current?.scrollTo(0,0);}
 function openCategory(id:string){setTab('explore');setSelected(id);area.current?.scrollTo(0,0);}
 return <div className="ft-shell">
  <aside className="ft-rail">
    <button className="ft-brand" onClick={()=>go('world')} aria-label="На главную"><span>Fet</span>Ure<span className="ft-brand-dot">.</span></button>
    <p className="ft-rail-caption">Пространство, где интересно быть собой.</p>
    <div className="ft-rail-links">{NAV.map(item=><button key={item.id} className={`ft-navlink ${tab===item.id?'active':''}`} onClick={()=>go(item.id)}><Icon name={item.icon}/>{item.title}</button>)}</div>
    <div className="ft-rail-bottom"><p>Твой путь, твои правила</p><Link to="/account"><Icon name="settings" size={18}/> Аккаунт и настройки</Link><a href="/concept.html" target="_blank" rel="noreferrer">Архив концепции 3.1 ↗</a></div>
  </aside>
  <div className="ft-frame">
    <header className="ft-topbar"><button className="ft-toplogo" onClick={()=>go('world')}>Fet<span>Ure</span></button>
      <span className="ft-topline">Открывай себя. Исследуй других.</span>
      <Link className="ft-account" to="/account" aria-label="Аккаунт"><Icon name="settings" size={19}/></Link>
    </header>
    <nav className="ft-tablet-nav" aria-label="Основные разделы FetUre">
      {NAV.map(item=><button key={item.id} className={tab===item.id?'active':''}
        aria-current={tab===item.id?'page':undefined}
        onClick={()=>go(item.id)}><Icon name={item.icon} size={19}/>{item.title}</button>)}
    </nav>
    <main className="ft-main" ref={area}>
      <div className="ft-content">
        {source!=='live'&&<div className="ft-network-hint" role="status"><Icon name={source==='loading'?'clock':'shield'} size={16}/>{source==='loading'?'Подключаем каталог…':'Каталог доступен из локальной копии: сервер временно недоступен.'}{source==='offline'&&<button onClick={retry}>Обновить</button>}</div>}
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
          {mapLoading?<p className="ft-muted">Загружаем личную карту…</p>:<div className="ft-jars">
            {data.categories.map(category=>{
              const progress=categoryProgress(category.interests.map(i=>i.id),map);
              return <button key={category.id} className="ft-jar-card" onClick={()=>openCategory(category.id)} aria-label={`${category.title}, исследовано ${progress.known} из ${progress.total}`}>
                <div className="ft-jar" style={{'--jar-color':category.color} as CSSProperties}>
                  <div className="ft-jar-liquid" style={{height:`${progress.percent}%`}}/><div className="ft-jar-shine"/>
                  <div className="ft-jar-count">{progress.known}<small>/{progress.total}</small></div>
                </div>
                <strong>{category.short}</strong>
                <span>{progress.boundaries? `${progress.boundaries} границ${progress.boundaries===1?'а':''}` : progress.known ? `${progress.known} тем`:'Не исследовано'}</span>
              </button>;
            })}
          </div>}
          <div className="ft-note"><Icon name="lock" size={18}/><div><strong>Только для тебя</strong><p>По умолчанию карта приватна. Пока данные сохраняются на этом устройстве. После настройки синхронизации AppBase они смогут переноситься в аккаунт.</p></div></div>
          <div className="ft-section-head"><div><h2>Продолжить знакомство с собой</h2><p>Необязательно проходить всё сразу.</p></div></div>
          <div className="ft-recommend">{data.categories.slice(0,3).map((c,i)=><button onClick={()=>openCategory(c.id)} key={c.id} className="ft-recommend-card" style={{'--accent':c.color} as CSSProperties}><span className="ft-recommend-index">0{i+1}</span><strong>{c.title}</strong><small>12 тем для исследования</small><Icon name="arrow" size={17}/></button>)}</div>
        </>}
        {tab==='explore'&&<>
          {selectedCategory?<><button className="ft-back" onClick={()=>{setSelected(null);area.current?.scrollTo(0,0)}}><Icon name="back" size={18}/> Все направления</button>
            <div className="ft-category-banner" style={{'--accent':selectedCategory.color} as CSSProperties}>
              <p>Направление / {selectedCategory.short}</p><h1>{selectedCategory.title}</h1>
              <span>{categoryProgress(selectedCategory.interests.map(i=>i.id),map).known} из {selectedCategory.interests.length} исследовано</span>
            </div><div className="ft-section-head"><div><h2>Темы направления</h2><p>Нажми на интерес, чтобы сохранить своё отношение и видимость.</p></div></div>
            <div className="ft-topic-list">{selectedCategory.interests.map(i=>{
              const state=map[i.id];return <button key={i.id} className="ft-topic" onClick={()=>setEdit({id:i.id,title:i.title,category:selectedCategory.title})}>
                <span className={`ft-topic-dot ${state?.status==='hard_limit'?'boundary':''}`} style={{background:!state||state.status==='unknown'?'#e2dbe1':state.status==='hard_limit'?'#f4dbe2':selectedCategory.color}}>
                  {state?.status&&state.status!=='unknown'?<Icon name={state.status==='hard_limit'?'shield':'check'} size={15}/>:<Icon name="plus" size={15}/>}
                </span><span><strong>{i.title}</strong><small>{state&&state.status!=='unknown'?STATUS_LABEL[state.status]:'Не исследовано'}{state?.visibility==='public'?' · открыто':state?.visibility==='granted'?' · по разрешению':''}</small></span>
                <Icon name="arrow" size={17}/></button>})}</div>
          </>:<><SectionTitle eyebrow="Исследование" title="Открой новые грани" description="Большая карта интересов, границ и вопросов. Здесь нет правильных или неправильных ответов."/>
          <div className="ft-explore-art"><Icon name="compass" size={36}/><div><strong>Начни с любопытства</strong><p>144 темы в 12 направлениях. Отмечай только то, что считаешь своим.</p></div></div>
          <label className="ft-search"><Icon name="search" size={20}/><input placeholder="Найти интерес или направление" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Поиск интересов"/></label>
          <div className="ft-section-head"><div><h2>Направления</h2><p>У каждого своя карта и история.</p></div></div>
          <div className="ft-category-grid">{data.categories.filter(c=>!query||`${c.title} ${c.interests.map(i=>i.title).join(' ')}`.toLowerCase().includes(query.toLowerCase())).map(c=>{
            const p=categoryProgress(c.interests.map(i=>i.id),map);
            return <button key={c.id} className="ft-category-card" onClick={()=>openCategory(c.id)}>
              <span className="ft-category-symbol" style={{background:`${c.color}20`,color:c.color}}><Icon name="spark" size={23}/></span>
              <strong>{c.title}</strong><small>{p.known} / {p.total} исследовано</small><div className="ft-mini-progress"><span style={{width:`${p.percent}%`,background:c.color}}/></div></button>;
          })}</div>
          <div className="ft-section-head"><div><h2>Тесты для исследования себя</h2><p>Описания и темы — из базы. Полные методики пока готовятся.</p></div></div>
          <div className="ft-tests">{data.tests.slice(0,8).map((t,i)=><div key={t.id} className="ft-test-card"><span className="ft-test-ico" style={{background:`${data.categories[t.category]?.color||'#7755aa'}18`,color:data.categories[t.category]?.color||'#7755aa'}}><Icon name="book"/></span>
            <div><strong>{t.title}</strong><p>{t.description}</p><small>{t.questions} вопросов в плане · готовится</small></div></div>)}</div>
          </>}
        </>}
        {tab==='community'&&<><SectionTitle eyebrow="Люди и истории" title="Сообщество" description="Исследовать себя интереснее, когда можно услышать разные взгляды."/>
          <div className="ft-preview-badge"><Icon name="eye" size={17}/><span>Пример будущей ленты: публикации и участники вымышлены.</span></div>
          <div className="ft-composer" onClick={()=>setDialog('Публиковать записи станет возможно после запуска аккаунтов и модерации. Пока можно изучить формат сообщества.')} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')setDialog('Публикации пока в разработке')}}>
            <div className="ft-composer-avatar">Я</div><span>О чём хочется поговорить?</span><Icon name="plus" size={18}/></div>
          <div className="ft-posts">{DEMO_POSTS.map(post=><article className="ft-post" key={post.handle}>
            <div className="ft-post-author"><Photo n={post.photo} alt="" /><div><strong>{post.name} <small>{post.handle}</small></strong><p>{post.place} · {post.time}</p></div></div>
            <p className="ft-post-copy">{post.text}</p><div className="ft-post-tags">{post.tags.map(tag=><span key={tag}>#{tag}</span>)}</div>
            <div className="ft-post-actions"><button onClick={()=>setDialog('Это демонстрационная публикация. Реальные реакции будут доступны после запуска сообщества.')}><Icon name="heart" size={18}/> {post.reactions}</button>
              <button onClick={()=>setDialog('Обсуждения будут доступны после запуска сообщества.')}><Icon name="message" size={18}/> Обсудить</button></div></article>)}</div>
          <div className="ft-section-head"><div><h2>Тематические пространства</h2><p>Пока примеры того, какими могут быть группы.</p></div></div>
          <div className="ft-group-grid">{['Знакомство с собой','Границы и доверие','Истории и опыт','Вопросы новичков'].map((g,i)=><button className="ft-group" key={g} onClick={()=>setDialog('Группы пока демонстрационные — реальные участники и обсуждения появятся позже.')}><span className="ft-group-emoji"><Icon name={i===1?'shield':i===2?'book':i===3?'message':'spark'} size={23}/></span><strong>{g}</strong><small>Будущее сообщество <Icon name="arrow" size={14}/></small></button>)}</div>
        </>}
        {tab==='dating'&&<><SectionTitle eyebrow="Необязательная часть FetUre" title="Знакомства" description="Знакомства — не цель для всех. В будущем ты сам решишь, включать их или нет."/>
           {!datingEnabled?<div className="ft-dating-off"><div className="ft-dating-halo"><Icon name="heart" size={38}/></div><h2>Только если захочешь</h2>
             <p>Исследуй себя и общайся в сообществе без обязательного поиска партнёров. Можно открыть демонстрационные карточки знакомств отдельно.</p>
             <button className="ft-primary" onClick={()=>setDatingEnabled(true)}>Посмотреть демо карточек <Icon name="arrow" size={18}/></button>
             <small>Демо не включает профиль в настоящих знакомствах.</small></div>:<>
             <div className="ft-preview-badge"><Icon name="eye" size={17}/> Демо профили: все люди и данные вымышлены. Нет реальных лайков и мэтчей.</div>
             <div className="ft-dating-container"><div className="ft-dating-card">
               <div className="ft-dating-scroll" key={person} onTouchStart={e=>{touch.current={x:(e.touches[0]?.clientX ?? 0),y:(e.touches[0]?.clientY ?? 0)}}} onTouchEnd={e=>{
                 const dx=(e.changedTouches[0]?.clientX ?? 0)-touch.current.x,dy=(e.changedTouches[0]?.clientY ?? 0)-touch.current.y;
                 if(Math.abs(dx)>90&&Math.abs(dx)>Math.abs(dy)*1.5)nextPerson();
               }}>
                 <div className="ft-dating-photo" style={{backgroundImage:`linear-gradient(180deg, transparent 55%,rgba(24,12,28,.9) 100%),url(/images/profile-${PROFILES[person]!.photos[photo]}.webp)`}}>
                   <div className="ft-photo-dots">{PROFILES[person]!.photos.map((n,i)=><button key={n} className={photo===i?'selected':''} onClick={()=>setPhoto(i)} aria-label={`Фото ${i+1}`}/>)}</div>
                   <div className="ft-photo-caption"><span>Демо профиль · {PROFILES[person]!.city}</span><h2>{PROFILES[person]!.name}, {PROFILES[person]!.age}</h2><p>{PROFILES[person]!.handle} <span>· Пример анкеты</span></p><button onClick={()=>profileRef.current?.scrollIntoView({behavior:'smooth',block:'start'})}>Подробнее о человеке ↓</button></div>
                 </div>
                 <div className="ft-dating-info" ref={profileRef}><p className="ft-eyebrow">О человеке</p><h3>Моя история</h3><p>{PROFILES[person]!.about}</p><h3>Что интересно</h3><div className="ft-post-tags">{PROFILES[person]!.interests.map(t=><span key={t}>{t}</span>)}</div><h3>Намерения</h3><p>{PROFILES[person]!.looking}</p><div className="ft-note"><Icon name="shield" size={18}/><p>Личные интересы и границы доступны только с разрешения владельца.</p></div></div>
               </div>
               <div className="ft-dating-actions"><button onClick={nextPerson} aria-label="Следующий профиль"><Icon name="close" size={23}/></button><button className="ft-dating-like" onClick={nextPerson} aria-label="Следующий демонстрационный профиль"><Icon name="heart" size={23}/></button></div>
             </div></div>
             <div className="ft-dating-links"><button onClick={()=>setDatingEnabled(false)}>Отключить демо</button><a href="/concept.html" target="_blank" rel="noreferrer">Открыть исходный прототип ↗</a></div>
           </>}
        </>}
        {mapError&&<p role="alert" className="ft-save-warning">Не удалось сохранить изменения на устройстве. Проверь свободное место и повтори действие.</p>}
        {saving&&<p role="status" className="ft-save-status">Сохраняем изменения…</p>}
      </div>
    </main>
    <nav className="ft-mobile-nav" aria-label="Основная навигация">{NAV.map(x=><button key={x.id} className={tab===x.id?'active':''} aria-current={tab===x.id?'page':undefined} onClick={()=>go(x.id)}><Icon name={x.icon} size={22}/><span>{x.title}</span></button>)}</nav>
  </div>
  {edit&&<InterestDialog key={edit.id} interest={edit} current={map[edit.id]} onClose={()=>setEdit(null)} onSave={v=>{save(edit.id,v);setEdit(null)}}/>}
  {dialog&&<div className="ft-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setDialog(null)}}><div className="ft-dialog ft-message-dialog" role="dialog" aria-modal="true" aria-label="Информация"><button className="ft-dialog-close" onClick={()=>setDialog(null)} aria-label="Закрыть"><Icon name="close"/></button><Icon name="spark" size={27}/><h2>В разработке</h2><p>{dialog}</p><button className="ft-primary" onClick={()=>setDialog(null)}>Понятно</button></div></div>}
 </div>;
 function nextPerson(){setPerson((person+1)%PROFILES.length);setPhoto(0)}
}
function InterestDialog({interest,current,onClose,onSave}:{interest:Edit;current:InterestRecord|undefined;onClose:()=>void;onSave:(v:Omit<InterestRecord,'at'>)=>void}){
 const [status,setStatus]=useState<InterestStatus>(current?.status||'unknown');
 const [intensity,setIntensity]=useState(current?.intensity??50);
 const [visibility,setVisibility]=useState<Visibility>(current?.visibility||'private');
 return <div className="ft-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
 <div role="dialog" aria-modal="true" aria-labelledby="ft-interest-title" className="ft-dialog">
   <button className="ft-dialog-close" aria-label="Закрыть" onClick={onClose}><Icon name="close"/></button>
   <p className="ft-eyebrow">{interest.category}</p><h2 id="ft-interest-title">{interest.title}</h2>
   <p className="ft-muted">Как ты относишься к этой теме прямо сейчас?</p>
   <div className="ft-statuses">{STATUSES.map(item=><button key={item.id} className={`ft-status ${status===item.id?'active':''} ${item.id==='hard_limit'?'ft-hard':''}`} onClick={()=>setStatus(item.id)}><span>{item.label}<small>{item.description}</small></span>{status===item.id&&<Icon name="check" size={18}/>}</button>)}</div>
   {hasIntensity(status)&&<div className="ft-intensity"><label htmlFor="ft-intensity">Насколько тебе интересно? <strong>{intensity}/100</strong></label><input id="ft-intensity" type="range" min="0" max="100" step="5" value={intensity} onChange={e=>setIntensity(Number(e.target.value))}/><small>Это личная оценка, не процент совместимости.</small></div>}
   <div className="ft-visibility"><strong>Кто может видеть отметку?</strong><div className="ft-visibility-options">{VIEWS.map(v=><button key={v.id} className={visibility===v.id?'active':''} onClick={()=>setVisibility(v.id)}>{v.label}</button>)}</div><small>Пока отметки хранятся локально и никому не передаются. Выбранная видимость пригодится для будущего профиля.</small></div>
   <button className="ft-primary ft-save" onClick={()=>onSave({status,intensity,visibility})}>Сохранить <Icon name="check" size={18}/></button>
 </div></div>;
}
