import type {Meta,StoryObj} from '@storybook/react-vite';
import {useRef,useState} from 'react';
import {fn} from 'storybook/test';
import {AtSign,Calendar,ChartColumn,Image as ImageIcon,Sparkles} from 'lucide-react';
import {ActionLine,ActivityCard,ActivityItem,ActivityTile,type ActThumb,ArticleCard,ArticleImage,Av,Card,EventTile,FeedEvents,IconBtn,LikesLine,plate,QuickStart,RichEditor,type RichEditorHandle} from './index';

/** A picture drawn in place (no network): a soft gradient with a word. */
const pic=(word:string,w=1200,h=675)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d')!;
 const gr=g.createLinearGradient(0,0,w,h);gr.addColorStop(0,'#DF234A');gr.addColorStop(1,'#5B3DF5');g.fillStyle=gr;g.fillRect(0,0,w,h);
 g.fillStyle='#fff';g.font='700 88px sans-serif';g.fillText(word,60,140);return c.toDataURL('image/png');};
const IMG='018f0000-0000-7000-8000-0000000000aa';

const meta={title:'Домен/Лента',component:RichEditor,tags:['autodocs'],
 parameters:{docs:{description:{component:'Редактор текста публикаций, статей и обсуждений: оформление видно сразу при наборе — жирный, курсив, зачёркнутый, '+
  'ссылка (адрес проверяется: только http(s) с настоящим доменом, «example.com» получает https://), списки, цитата; в статье ещё заголовки и фото в тексте. '+
  '«- », «1. », «> » в начале строки делают список или цитату. Наружу отдаётся тот же безопасный Markdown, что показывает публикация: HTML не хранится, '+
  'вставка — только текст. В конце панели — свои кнопки (`extra`, например «Упомянуть»).'}}},
 args:{value:'',onValue:()=>{},label:'Текст',placeholder:'Что нового?'},argTypes:{extra:{control:false},images:{control:false}},
} satisfies Meta<typeof RichEditor>;
export default meta;
type S=StoryObj<typeof meta>;
const Live=(a:Parameters<typeof RichEditor>[0])=>{const [v,setV]=useState(a.value);return <Card><RichEditor {...a} value={v} onValue={setV}/><pre>{v}</pre></Card>;};
export const Редактор:S={render:a=><Live {...a}/>};
export const СТекстомИКнопкой:S={name:'С текстом и своей кнопкой',render:a=><Live {...a}/>,
 args:{value:'**Жирный**, *курсив*, ~~зачёркнутый~~\n\n- пункт списка\n- ещё пункт\n\n> цитата\n\n[ссылка](https://example.com)',extra:<IconBtn icon={AtSign} kind="ghost" size="sm" label="Упомянуть"/>}};
export const Ошибка:S={name:'Ошибка в поле',render:a=><Live {...a}/>,args:{invalid:true,value:'Слишком коротко'}};

/** An article: headings and a photo button; the photo goes where the caret was. */
function ArticleEditor(){
 const [v,setV]=useState(`## Как прошёл вечер\n\nПервый абзац статьи.\n\n![](media:${IMG})\n\nТекст после фото.`);const ref=useRef<RichEditorHandle>(null);const [srcs]=useState<Record<string,string>>(()=>({[IMG]:pic('Фото')}));
 return <Card><RichEditor ref={ref} label="Текст статьи" placeholder="Начни статью…" headings long value={v} onValue={setV}
  images={{src:id=>srcs[id],onAdd:()=>{const id='018f0000-0000-7000-8000-'+String(Date.now()).slice(-12).padStart(12,'0');srcs[id]=pic('Новое');ref.current?.insertImage(id,srcs[id]!);}}}/>
  <pre>{v}</pre></Card>;
}
export const Статья:S={name:'Статья: заголовки и фото в тексте',render:()=><ArticleEditor/>};

export const КарточкаСтатьи:StoryObj<typeof ArticleCard>={name:'Карточка статьи',render:a=><div className="post"><ArticleCard {...a}/></div>,
 args:{cover:pic('Обложка'),kicker:'Статья · 3 мин',title:'Как мы ходили на первую вечеринку',excerpt:'Первый абзац статьи без оформления — так он выглядит в ленте…',more:'Читать'},argTypes:{cover:{control:false}}};
export const СтатьяЦеликом:StoryObj<typeof ArticleCard>={name:'Статья целиком',render:a=><div className="post"><ArticleCard {...a}><div className="md"><p>Текст статьи.</p>
 <ArticleImage src={pic('Фото')} label="Открыть фото" onOpen={fn()}/><p>Текст после фото.</p></div></ArticleCard></div>,
 args:{cover:pic('Обложка'),kicker:'Статья · 3 мин',title:'Как мы ходили на первую вечеринку',full:true},argTypes:{cover:{control:false}}};

const people=[{id:'mia',name:'Mia'},{id:'alex',name:'Alex'},{id:'kim',name:'Kim'}];
export const Нравится:StoryObj<typeof LikesLine>={name:'Строка «Нравится»',render:a=><LikesLine {...a}/>,args:{people,text:'Нравится: Mia, Alex, Kim и ещё 4',onClick:fn()},argTypes:{people:{control:false}}};

const ph=(i:number)=>`data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="hsl(${i*37%360} 45% 55%)"/></svg>`)}`;
/** Liked posts of every look: a photo, several photos, a video, a photo with a poll, a poll, interests, text only. */
const liked:ActThumb[]=[{src:ph(1),photos:1},{src:ph(2),photos:3},{src:ph(3),video:true,videos:1,durationMs:6000},{src:ph(4),photos:1,poll:true},{poll:true},{interests:true},
 {text:'Сегодня про границы и то, как о них говорить'},...Array.from({length:9},(_,i)=>({src:ph(i+5),photos:1}))];
const likedItems=liked.map((th,i)=><ActivityItem key={i} thumb={th} title={'Публикация '+(i+1)} sub="Alex · фото" onClick={fn()}/>);
export const Активность:StoryObj<typeof ActivityCard>={name:'Активность: много лайков (лента)',render:a=><div className="posts"><ActivityCard {...a}/></div>,
 parameters:{docs:{description:{story:'Серия однотипных действий одного человека — одна карточка. Лайки и подписки — лента миниатюр, листается вбок; справа «+N» — сколько ещё не видно '+
  '(включая те, что сервер не прислал: он шлёт до 20, `total` — сколько всего). «+N» раскрывает список с «Свернуть»; ⋯ — «Открыть профиль / Не показывать активность».'}}},
 args:{actor:{id:'mia',name:'Mia'},text:<><b>Mia</b>: нравится 23 публикации</>,time:'2 ч назад',menuLabel:'Ещё',onMenu:fn(),more:'Показать все · 23',less:'Свернуть',
  total:23,restText:'И ещё 7',items:likedItems,tiles:liked.map((th,i)=><ActivityTile key={i} thumb={th} label={'Публикация '+(i+1)} onClick={fn()}/>)},
 argTypes:{items:{control:false},tiles:{control:false},actor:{control:false}}};
const folks=['Lev','Kira','Tim','Vesta','Dan','Yana','Alisa','Sasha','Nika','Gleb','Olya','Egor'];
export const АктивностьПодписки:StoryObj<typeof ActivityCard>={name:'Активность: подписки (лица)',render:a=><div className="posts"><ActivityCard {...a}/></div>,
 args:{actor:{id:'kim',name:'Kim'},text:<><b>Kim</b> теперь следит за 12 людьми</>,time:'5 ч назад',menuLabel:'Ещё',onMenu:fn(),more:'Показать все · 12',less:'Свернуть',total:12,
  items:folks.map(n=><ActivityItem key={n} thumb={{person:{id:n,name:n}}} title={n} sub={'@'+n.toLowerCase()} onClick={fn()}/>),
  tiles:folks.map(n=><ActivityTile key={n} thumb={{person:{id:n,name:n}}} label={n} onClick={fn()}/>)},argTypes:{items:{control:false},tiles:{control:false},actor:{control:false}}};
export const АктивностьСобытия:StoryObj<typeof ActivityCard>={name:'Активность: события (строки)',render:a=><div className="posts"><ActivityCard {...a}/></div>,
 parameters:{docs:{description:{story:'События и сообщества — строками: две видны, «Ещё N» раскрывает остальные.'}}},
 args:{actor:{id:'kim',name:'Kim'},text:<><b>Kim</b>: в планах 3 события</>,time:'вчера',menuLabel:'Ещё',onMenu:fn(),more:'Ещё 1',less:'Свернуть',total:3,fold:2,
  items:['Вечер шибари','Онлайн-разговор о границах','Кофе и знакомство'].map((x,i)=><ActivityItem key={x} thumb={{icon:Calendar,...(i===0?{src:ph(20)}:{})}} title={x} sub="12 нояб., 19:00" onClick={fn()}/>)},
 argTypes:{items:{control:false},actor:{control:false}}};
export const АктивностьОдна:StoryObj<typeof ActivityCard>={name:'Активность: одно действие',render:a=><div className="posts"><ActivityCard {...a}/></div>,
 args:{actor:{id:'lev',name:'Lev'},text:<><b>Lev</b>: нравится публикация</>,time:'только что',menuLabel:'Ещё',onMenu:fn(),more:'',less:'Свернуть',
  items:[<ActivityItem key="p" thumb={{src:ph(30),photos:2}} title="Вечер у воды" sub="Mira · 2 фото" onClick={fn()}/>]},argTypes:{items:{control:false},actor:{control:false}}};
export const Миниатюры:StoryObj<typeof ActivityTile>={name:'Миниатюры активности',render:()=><div className="actc-row"><div className="actc-strip">
  {liked.slice(0,7).map((th,i)=><ActivityTile key={i} thumb={th} label={'Публикация '+(i+1)} onClick={fn()}/>)}<ActivityTile thumb={{person:{id:'mia',name:'Mia'}}} label="Mia" onClick={fn()}/></div></div>,
 parameters:{docs:{description:{story:'Фото (капсула с числом фото/длиной видео), видео, фото с опросом (метка в углу), опрос, интересы, только текст, человек.'}}}};

export const БыстрыйСтарт:StoryObj<typeof QuickStart>={name:'Быстрый старт',render:a=><QuickStart {...a}/>,
 args:{title:'Или сразу начать с',items:[[ImageIcon,'Фото и видео',fn()],[ChartColumn,'Опрос',fn()],[Sparkles,'Мои интересы',fn()]]},argTypes:{items:{control:false}}};
export const СтрокаДействия:StoryObj<typeof ActionLine>={name:'Подсказка со ссылкой',render:a=><ActionLine {...a}/>,
 args:{text:'Топ недели по твоим интересам',action:'Как подбираем',onAction:fn()}};
const evCover=(k:string)=><div className="plate" style={plate(k)}><span className="pi"><Calendar/></span></div>;
export const Скоро:StoryObj<typeof FeedEvents>={name:'«Скоро» в ленте',render:a=><div className="posts"><FeedEvents {...a}/></div>,
 parameters:{docs:{description:{story:'Ближайшие события, которые касаются смотрящего (ответил, подписан на организатора, сообщество, интересы, город, онлайн). У каждого своё «Скрыть»: скрытое не возвращается (сервер, `feedHide` kind `event`), тост даёт «Вернуть».'}}},
 args:{title:'Скоро',items:[
  {key:'1',tile:<EventTile row cover={evCover('a')} day="30" month="окт" place="Онлайн" time="19:00" title="Разговор о границах" org="Ты идёшь" onClick={fn()}/>,hide:'Скрыть',hideLabel:'Скрыть: Разговор о границах',onHide:fn()},
  {key:'2',tile:<EventTile row cover={evCover('b')} day="2" month="нояб" place="Кройцберг" time="20:00" title="Вечер знакомств" org="Из твоего сообщества" onClick={fn()}/>,hide:'Скрыть',hideLabel:'Скрыть: Вечер знакомств',onHide:fn()}]},
 argTypes:{items:{control:false}}};
