import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {Settings} from 'lucide-react';
import {Bar,IconBtn,Seg,SubBar} from './index';

const meta={title:'Навигация/Вкладки',component:Seg,tags:['autodocs'],
 parameters:{docs:{description:{component:'**Единственный** способ переключать разделы экрана. 2–4 вкладки делят ширину, 5 и больше прокручиваются. `n` — счётчик, `dot` — что-то ждёт. Не делай вкладки из чипов или подчёркнутых кнопок.'}}},
 args:{value:'0',onChange:()=>{},options:[{id:'0',label:'Для тебя'},{id:'1',label:'Подписки',n:3},{id:'2',label:'Популярное'}]},
} satisfies Meta<typeof Seg>;
export default meta;
type S=StoryObj<typeof meta>;
const Live=(a:S['args'])=>{const [v,setV]=useState(a!.value as string);return <Seg options={a!.options??[]} label={a!.label} value={v} onChange={setV}/>;};
export const Три:S={name:'Три вкладки',render:a=><Live {...a}/>};
export const Две:S={name:'Две вкладки',render:a=><Live {...a} options={[{id:'0',label:'Входящие'},{id:'1',label:'Отправленные'}]}/>};
export const СоСчётчикомИТочкой:S={name:'Счётчик и точка',render:a=><Live {...a} options={[{id:'0',label:'Профиль'},{id:'1',label:'Приватное',dot:'ждёт ответа'},{id:'2',label:'Видимость'},{id:'3',label:'Моё',n:120}]}/>};
export const Прокрутка:S={name:'Пять и больше — прокрутка',render:a=><Live {...a} options={['Всё','Люди','Сообщества','События','Темы','Публикации'].map((l,i)=>({id:String(i),label:l}))}/>};

export const Шапка:StoryObj<typeof Bar>={name:'Шапка экрана',render:a=><Bar {...a}><IconBtn icon={Settings} label="Настройки"/></Bar>,args:{title:'Лента',small:false},
 parameters:{docs:{description:{story:'Заголовок экрана; `back` — стрелка назад, справа — круглые кнопки действий.'}}}};
export const ШапкаНазад:StoryObj<typeof Bar>={name:'Шапка с «назад»',render:a=><Bar {...a}/>,args:{title:'Новая публикация',back:true}};
export const ШапкаДвеСтроки:StoryObj<typeof SubBar>={name:'Шапка с подзаголовком',render:a=><SubBar {...a}/>,args:{title:'Круг о границах',sub:'Сообщество · 128 участников'}};
