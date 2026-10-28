import type {Meta,StoryObj} from '@storybook/react-vite';
import {useRef,useState} from 'react';
import {fn} from 'storybook/test';
import {AtSign,Calendar,ChartColumn,Image as ImageIcon,Sparkles} from 'lucide-react';
import {ActionLine,ActivityCard,ActivityItem,ArticleCard,ArticleImage,Av,Card,IconBtn,LikesLine,QuickStart,RichEditor,type RichEditorHandle} from './index';

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

export const Активность:StoryObj<typeof ActivityCard>={name:'Карточка активности',render:a=><div className="posts"><ActivityCard {...a}/></div>,
 args:{actor:{id:'mia',name:'Mia'},text:<><b>Mia</b>: нравится 3 публикации</>,time:'2 ч назад',menuLabel:'Ещё',onMenu:fn(),more:'Показать все · 3',less:'Свернуть',fold:2,
  items:[1,2,3].map(i=><ActivityItem key={i} av={<Av name="Alex" seed={'a'+i} size="sm"/>} title={'Публикация '+i} sub="Alex" onClick={fn()}/>)},argTypes:{items:{control:false},actor:{control:false}}};
export const АктивностьСобытия:StoryObj<typeof ActivityCard>={name:'Активность: события',render:a=><div className="posts"><ActivityCard {...a}/></div>,
 args:{actor:{id:'kim',name:'Kim'},text:<><b>Kim</b> пойдёт на событие</>,time:'вчера',menuLabel:'Ещё',onMenu:fn(),more:'Показать все',less:'Свернуть',
  items:[<ActivityItem key="e" icon={Calendar} title="Вечер шибари" sub="12 нояб., 19:00" onClick={fn()}/>]},argTypes:{items:{control:false},actor:{control:false}}};

export const БыстрыйСтарт:StoryObj<typeof QuickStart>={name:'Быстрый старт',render:a=><QuickStart {...a}/>,
 args:{title:'Или сразу начать с',items:[[ImageIcon,'Фото и видео',fn()],[ChartColumn,'Опрос',fn()],[Sparkles,'Мои интересы',fn()]]},argTypes:{items:{control:false}}};
export const СтрокаДействия:StoryObj<typeof ActionLine>={name:'Подсказка со ссылкой',render:a=><ActionLine {...a}/>,
 args:{text:'Топ недели по твоим интересам',action:'Как подбираем',onAction:fn()}};
