import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {fn} from 'storybook/test';
import {AtSign,Calendar,ChartColumn,Image as ImageIcon,Sparkles} from 'lucide-react';
import {ActionLine,ActivityCard,ActivityItem,Av,Btn,Card,EventTile,FeedEvents,IconBtn,LikesLine,QuickStart,RichArea,plate} from './index';

const meta={title:'Домен/Лента',component:RichArea,tags:['autodocs'],
 parameters:{docs:{description:{component:'Поле текста с панелью оформления: жирный, курсив, список, цитата, ссылка (адрес проверяется: только http(s) с настоящим доменом). '+
  'Текст — Markdown, который показывает публикация; кнопки только расставляют метки. В конце панели — свои кнопки (`extra`, например «Упомянуть»).'}}},
 args:{value:'',onValue:()=>{},placeholder:'Что нового?',rows:5},argTypes:{extra:{control:false}},
} satisfies Meta<typeof RichArea>;
export default meta;
type S=StoryObj<typeof meta>;
const Live=(a:Parameters<typeof RichArea>[0])=>{const [v,setV]=useState(a.value);return <Card><RichArea {...a} value={v} onValue={setV}/></Card>;};
export const Редактор:S={render:a=><Live {...a}/>};
export const СТекстомИКнопкой:S={name:'С текстом и своей кнопкой',render:a=><Live {...a}/>,
 args:{value:'**Жирный**, *курсив*\n- пункт списка\n> цитата\n[ссылка](https://example.com)',extra:<IconBtn icon={AtSign} kind="ghost" size="sm" label="Упомянуть"/>}};
export const Ошибка:S={name:'Ошибка в поле',render:a=><Live {...a}/>,args:{invalid:true,value:'Слишком коротко'}};

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
export const СтрокаДействия:StoryObj<typeof ActionLine>={name:'Строка с действием',render:a=><ActionLine {...a}/>,
 args:{text:'Только статьи — без остальных публикаций',children:<Btn size="sm" fit>Следить за статьями</Btn>},argTypes:{children:{control:false}}};

const evCover=(k:string)=><div className="plate" style={plate(k)}><span className="pi"><Calendar/></span></div>;
export const Скоро:StoryObj<typeof FeedEvents>={name:'«Скоро» в ленте',render:a=><div className="posts"><FeedEvents {...a}/></div>,
 parameters:{docs:{description:{story:'Ближайшие события, которые касаются смотрящего (ответил, подписан на организатора, сообщество, интересы, город, онлайн). У каждого своё «Скрыть»: скрытое не возвращается (сервер, `feedHide` kind `event`), тост даёт «Вернуть».'}}},
 args:{title:'Скоро',items:[
  {key:'1',tile:<EventTile row cover={evCover('a')} day="30" month="окт" place="Онлайн" time="19:00" title="Разговор о границах" org="Ты идёшь" onClick={fn()}/>,hide:'Скрыть',hideLabel:'Скрыть: Разговор о границах',onHide:fn()},
  {key:'2',tile:<EventTile row cover={evCover('b')} day="2" month="нояб" place="Кройцберг" time="20:00" title="Вечер знакомств" org="Из твоего сообщества" onClick={fn()}/>,hide:'Скрыть',hideLabel:'Скрыть: Вечер знакомств',onHide:fn()}]},
 argTypes:{items:{control:false}}};
