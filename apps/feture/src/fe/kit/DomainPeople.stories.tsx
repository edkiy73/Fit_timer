import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {fn} from 'storybook/test';
import {Ban,Bell,Ellipsis,Heart,KeyRound,MessageCircle,Sparkles,Users,X} from 'lucide-react';
import {PhotoBars,Answer,AnswerScale,Av,Btn,Chip,Chips,IconBtn,LikeTile,PersonBar,PersonLine,PersonName,Pill,Radar,RequestCard,Soon,Typing,plate} from './index';

const meta={title:'Домен/Люди',component:RequestCard,tags:['autodocs'],
 parameters:{docs:{description:{component:'Запрос, на который нужно ответить (доступ к приватному, связь, приглашение в пару, заявка на событие): кто просит (`PersonLine`), подробности, ответы. Ответ на вопрос заявки — `Answer`.'}}},
 args:{person:<PersonLine av={<Av name="Mia" seed="mia"/>} name="Mia, 29" sub="Просит доступ · 2 ч назад" label="Mia" onOpen={fn()}/>,
  actions:<><Btn size="md">Открыть</Btn><Btn size="md" kind="soft">Отклонить</Btn></>,children:<Chips className="mt12"><Pill>Фото</Pill><Pill>Текст</Pill></Chips>},
 argTypes:{person:{control:false},actions:{control:false},children:{control:false}},
} satisfies Meta<typeof RequestCard>;
export default meta;
type S=StoryObj<typeof meta>;
export const Запрос:S={};
export const Заявка:S={name:'Заявка на событие',args:{className:'application-card',children:<><Answer q="Был ли опыт?">Да, пару раз на воркшопах.</Answer><Answer q="Заметка">Приду с партнёром.</Answer></>}};
export const БезКнопок:S={name:'Без ответа (только показ)',args:{actions:undefined,person:<PersonLine av={<Av name="Kai" seed="kai" size="sm"/>} small name="Kai" sub="Приглашает в пару · вчера"/>,children:undefined}};

export const ИмяНаФото:StoryObj<typeof PersonName>={name:'Имя на фото',render:a=><div className="k-demo-dark"><PersonName {...a}/></div>,args:{name:'Mia',age:'29'}};
export const ШапкаЧата:StoryObj<typeof PersonBar>={name:'Шапка чата',render:a=><PersonBar {...a}><IconBtn icon={Ellipsis} kind="ghost" label="Меню"/></PersonBar>,
 args:{name:'Mia & Tom',av:<Av name="Mia" seed="mia" size="sm"/>,sub:<><Users/> Чат пары · видят оба</>,onOpen:fn(),onBack:fn()},argTypes:{av:{control:false},sub:{control:false}}};
export const ШапкаЧатаЗагрузка:StoryObj<typeof PersonBar>={name:'Шапка чата: загрузка',render:a=><PersonBar {...a}/>,args:{onBack:fn()}};

export const Лайк:StoryObj<typeof LikeTile>={name:'Плитка «лайкнули вас»',render:a=><div className="likes"><LikeTile {...a}>
 <button type="button" className="lkx" aria-label="Пропустить"><X/></button><button type="button" className="lkb" aria-label="Ответить взаимностью"><Heart/></button></LikeTile></div>,
 args:{seed:'mia',label:'Mia',name:<><b>Mia, 29</b><Pill className="lk-pair">пара</Pill></>,onOpen:fn()}};
export const Скоро:StoryObj<typeof Soon>={name:'Скоро (знакомства выключены)',render:a=><Soon {...a}><Btn icon={Bell}>Сообщить о запуске</Btn><Btn kind="text">Пока — добавить интересы</Btn></Soon>,
 args:{badge:'Скоро',title:'Готовим знакомства',text:'Подборка по тому, что откликается вам обоим.',points:[[Sparkles,'Совпадения по интересам и границам'],[KeyRound,'Приватное открываешь ты'],[MessageCircle,'Написать — только при взаимной симпатии']]},argTypes:{points:{control:false}}};
export const Печатает:StoryObj<typeof Typing>={name:'«печатает…» в чате',render:a=><div className="msgs"><div className="msg">Привет!</div><Typing {...a}/></div>,args:{children:'Mia печатает…'}};
export const Радар:StoryObj<typeof Radar>={name:'Радар (никого рядом)',render:a=><div className="empty"><Radar {...a}/></div>,args:{seed:'me'}};
export const РадарМалый:StoryObj<typeof Radar>={name:'Радар компактный (пустая колода)',render:a=><div className="empty"><Radar {...a}/></div>,args:{seed:'me',small:true}};

type Mark='discuss'|'hard';
export const Шкала:StoryObj<typeof AnswerScale<Mark>>={name:'Шкала ответа 1–10',
 render:a=>{const [v,setV]=useState<number|Mark|null>(a.value??null);return <AnswerScale<Mark> {...a} value={v} onChange={setV}/>;},
 args:{label:'Насколько нравится',low:'чуть-чуть',high:'очень',value:6,onChange:()=>{},
  marks:[{id:'discuss',label:'обсудить',icon:MessageCircle},{id:'hard',label:'граница',icon:Ban,taboo:true}]},
 argTypes:{value:{control:'select',options:[null,1,2,3,4,5,6,7,8,9,10,'discuss','hard']},marks:{control:false}}};
export const ШкалаГраница:StoryObj<typeof AnswerScale<Mark>>={name:'Шкала: выбрана граница',render:a=><AnswerScale<Mark> {...a}/>,
 args:{label:'Насколько нравится',low:'чуть-чуть',high:'очень',value:'hard',onChange:()=>{},marks:[{id:'discuss',label:'обсудить',icon:MessageCircle},{id:'hard',label:'граница',icon:Ban,taboo:true}]}};
export const Направления:StoryObj<typeof Chip>={name:'Чипы недоступны (inactive)',render:a=><div className="dim"><Chips><Chip {...a}>Делать</Chip><Chip {...a} on>Получать</Chip></Chips></div>,args:{inactive:true,onClick:fn(),children:''}};

export const ПолоскиФото:StoryObj<typeof PhotoBars>={name:'Полоски фото на шапке профиля (со счётчиком)',render:a=><div className="hero" style={{height:240}}><div className="plate" style={plate('mia')}/><PhotoBars {...a}/></div>,
 args:{n:5,i:1,label:'Фото 2 из 5',count:true}};
