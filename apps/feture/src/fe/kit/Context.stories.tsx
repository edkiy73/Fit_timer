import type {Meta,StoryObj} from '@storybook/react-vite';
import {Bell,Calendar,Heart,MapPin,Users} from 'lucide-react';
import {Av,Btn,ContextColumn,CtxBlock,CtxRow,EventTile,Who,plate} from './index';
import {NameBadges} from '../faces';

const meta={title:'Навигация/Колонка контекста',component:ContextColumn,tags:['autodocs'],
 parameters:{docs:{description:{component:'Третья колонка на компьютере (окно от 1100 px, V21 `CTX`): несколько блоков о том, что рядом с открытой вкладкой. «Лента» — ближайшие события и сообщества для тебя; «Люди» — кто симпатизирует (имя, возраст и значки — `Who` + `NameBadges`, как везде у людей); «Комьюнити» — мои сообщества и события сообществ; «Чаты» и «Я» — уведомления и мои события. `CtxBlock` — заголовок и содержимое (мини-строки `CtxRow` в одной карточке или плитки событий), пока грузится — мигает на месте, пусто — компактный `Empty` с текстом прототипа. На телефоне и планшете колонки нет вовсе (оболочка её не монтирует). В приложении `always` не передаётся — он только для этой витрины.'}}},
 args:{label:'Контекст',always:true,children:null,foot:{text:'KINHAZE · 18+',links:[{label:'Помощь',onClick:()=>{}}]}},
 argTypes:{children:{control:false}},
} satisfies Meta<typeof ContextColumn>;
export default meta;
type S=StoryObj<typeof meta>;

/* The column's tiles are short (EventCard `brief`): only the city or «Онлайн» above the title, the title up to two lines. */
const tile=(title:string,day:string,place:string)=><EventTile row cover={<div className="plate" style={plate('lilac')}/>} day={day} month="нояб" place={place} placeIcon={MapPin} title={title} onClick={()=>{}}/>;
const comm=(k:string)=><div className="plate" style={plate(k)}/>;

export const Лента:S={name:'Лента: события и сообщества',render:a=><ContextColumn {...a}>
 <CtxBlock title="Ближайшие события">{tile('Вечер знакомств в баре','12','Лиссабон')}{tile('Большой разговор о границах и согласии в отношениях для пар','15','Онлайн')}</CtxBlock>
 <CtxBlock rows title="Сообщества для тебя">
  <CtxRow pic={comm('mint')} title="Круг о границах" sub="128 участников" onClick={()=>{}}/>
  <CtxRow pic={comm('rose')} title="Лиссабон после работы" sub="42 участника" onClick={()=>{}}/>
 </CtxBlock>
</ContextColumn>};

export const Люди:S={name:'Люди: симпатии',render:a=><ContextColumn {...a}>
 <CtxBlock rows title="Тебе симпатизируют" more={<Btn kind="text" auto>Все · 9</Btn>}>
  <CtxRow av={<Av name="Алиса" seed="a" size="sm"/>} title={<Who name="Алиса" age={29}><NameBadges p={{photoVerified:true,premium:true}}/></Who>} sub="2 ч назад" onClick={()=>{}}/>
  <CtxRow av={<Av name="Аня и Макс" seed="am" size="sm"/>} title={<Who name="Аня и Макс" age="31 · 28"><NameBadges p={{photoVerified:true}}/></Who>} sub="пара · вчера" onClick={()=>{}}/>
 </CtxBlock>
</ContextColumn>};

export const Чаты:S={name:'Чаты и Я: уведомления и мои события',render:a=><ContextColumn {...a}>
 <CtxBlock rows title="Уведомления">
  <CtxRow unread av={<Av name="Алиса" seed="a" size="sm"/>} title="Алиса ставит тебе симпатию" sub="5 мин" onClick={()=>{}}/>
  <CtxRow icon={Bell} title="Событие перенесли" sub="вчера" onClick={()=>{}}/>
  <CtxRow icon={Bell} title="Центр уведомлений" sub="Нужно решить: 1 · Новых: 3" onClick={()=>{}}/>
 </CtxBlock>
 <CtxBlock title="Мои события" more={<Btn kind="text" auto>Все · 5</Btn>}>{tile('Вечер знакомств в баре','12','Лиссабон')}</CtxBlock>
</ContextColumn>};

export const Пусто:S={name:'Пусто и загрузка',render:a=><ContextColumn {...a}>
 <CtxBlock rows title="Тебе симпатизируют" empty={{icon:Heart,title:'Пока никого — это нормально.'}}/>
 <CtxBlock rows title="Мои сообщества" empty={{icon:Users,title:'Ты пока ни в одном'}}/>
 <CtxBlock title="Мои события" empty={{icon:Calendar,title:'Пока нет',action:<Btn kind="soft">Смотреть события</Btn>}}/>
 <CtxBlock title="События сообществ" loading/>
</ContextColumn>};
