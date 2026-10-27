import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {fn} from 'storybook/test';
import {Bell,Bookmark,Calendar,Check,Ellipsis,Eye,MapPin,Share,Video,X} from 'lucide-react';
import {Announcement,CoverBar,EventHero,EventTile,IconBtn,Pill,Rsvp,Stack,plate} from './index';

const cover=<div className="plate" style={plate('event-demo')}><span className="pi"><Calendar/></span></div>;

const meta={title:'Домен/События',component:EventTile,tags:['autodocs'],
 parameters:{docs:{description:{component:'Карточка события (`eventCard()`): обложка с датой и местом, вид, название, время и цена. `row` — компактная строка («Ближайшая встреча», отменённые). Без `onClick` — неподвижная картинка карточки (превью мастера создания).'}}},
 args:{cover,day:'28',month:'окт',place:'Берлин, Кройцберг',placeIcon:MapPin,kicker:'Мастер-класс',title:'Вечер шибари для начинающих',time:'19:00',price:'15 €',row:false,onClick:fn()},
 argTypes:{cover:{control:false},placeIcon:{control:false},status:{control:false}},
} satisfies Meta<typeof EventTile>;
export default meta;
type S=StoryObj<typeof meta>;
export const Карточка:S={};
export const СоСтатусом:S={name:'Со статусом',args:{status:<Pill tone="ok">Иду</Pill>}};
export const Онлайн:S={args:{place:'Онлайн',placeIcon:Video,price:'Бесплатно'}};
export const Строка:S={args:{row:true,org:'Kink Kollektiv',status:<Pill tone="bad">Отменено</Pill>}};
export const Превью:S={name:'Превью (без нажатия)',render:({onClick:_o,...a})=><EventTile {...a}/>};

export const Обложка:StoryObj<typeof EventHero>={name:'Обложка события',render:a=><EventHero {...a}/>,
 args:{cover,title:'Вечер шибари для начинающих',tags:[<><MapPin/>Берлин</>,'Мастер-класс'],status:<Pill tone="v">Интересно</Pill>},argTypes:{cover:{control:false},tags:{control:false},status:{control:false}}};
export const ОбложкаЗагрузка:StoryObj<typeof EventHero>={name:'Обложка: загрузка',render:()=><EventHero/>};

export const ШапкаНаОбложке:StoryObj<typeof CoverBar>={name:'Шапка поверх обложки',render:a=><div className="k-demo-dark"><CoverBar {...a}>
 <IconBtn icon={Bookmark} kind="glass" label="Сохранить"/><IconBtn icon={Share} kind="glass" label="Поделиться"/><IconBtn icon={Ellipsis} kind="glass" label="Ещё"/></CoverBar></div>,
 args:{title:'Вечер шибари',onBack:fn()}};

export const Ответ:StoryObj<typeof Rsvp<'interested'|'going'|'not_going'>>={name:'Ответ «Интересно / Иду / Не иду»',
 render:a=>{const [v,setV]=useState<'interested'|'going'|'not_going'|null>(a.value??null);return <Rsvp<'interested'|'going'|'not_going'> {...a} value={v} onChange={x=>setV(v===x?null:x)}/>;},
 args:{label:'Твой ответ',value:null,couple:false,disabled:false,onChange:()=>{},
  options:[['interested','Интересно',Eye,'interested'],['going','Иду',Check,'going'],['not_going','Не иду',X,'not']]},
 argTypes:{value:{control:'inline-radio',options:[null,'interested','going','not_going']},options:{control:false}}};
export const ОтветПары:StoryObj<typeof Rsvp<'interested'|'going'|'not_going'>>={name:'Ответ пары (выбран «Идём»)',render:a=><Rsvp<'interested'|'going'|'not_going'> {...a}/>,
 args:{label:'Ваш ответ',value:'going',couple:true,onChange:()=>{},options:[['interested','Нам интересно',Eye,'interested'],['going','Идём',Check,'going'],['not_going','Не идём',X,'not']]}};

export const Объявление:StoryObj<typeof Announcement>={name:'Объявление организатора',render:a=><Stack gap={0}><Announcement {...a}/><Announcement icon={Bell} body="Адрес пришлём за день." meta="авто · вчера"/></Stack>,
 args:{icon:Bell,body:'Начинаем на 15 минут позже.',meta:'2 ч назад'},argTypes:{icon:{control:false}}};
