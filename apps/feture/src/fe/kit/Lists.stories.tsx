import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {fn} from 'storybook/test';
import {Bell,KeyRound,Trash2,Users} from 'lucide-react';
import {Av,Card,Row,SelectRow,ToggleRow} from './index';

const meta={title:'Списки/Строка',component:Row,tags:['autodocs'],
 parameters:{docs:{description:{component:'Пункт настроек, меню, списка людей — всегда внутри `<Card list>`. Слева иконка (`icon`, `tone`) или аватар (`av`), справа значение, бейдж и стрелка. Опасное действие — `danger` (без стрелки).'}}},
 args:{title:'Кто видит',sub:'Все участники',icon:KeyRound,val:'',badge:undefined,danger:false,noChev:false,disabled:false,onClick:fn()},
 argTypes:{icon:{control:false},av:{control:false},tone:{control:'inline-radio',options:[undefined,'v','g','l','a']}},
 decorators:[S=><Card list><S/></Card>],
} satisfies Meta<typeof Row>;
export default meta;
type S=StoryObj<typeof meta>;
export const Обычная:S={};
export const СЗначением:S={name:'Со значением',args:{title:'Язык',sub:undefined,val:'Русский'}};
export const СБейджем:S={name:'С бейджем',args:{title:'Запросы',sub:'Ждут ответа',icon:Bell,badge:3}};
export const САватаром:S={name:'С аватаром',render:({icon:_i,...a})=><Row {...a}/>,args:{av:<Av name="Mia" seed="mia" size="sm"/>,title:'Mia, 29',sub:'Берлин'}};
export const Опасная:S={args:{title:'Удалить аккаунт',sub:undefined,icon:Trash2,danger:true}};
export const Выключена:S={args:{disabled:true}};
export const Список:S={name:'Несколько строк',render:()=><><Row icon={Users} title="Подписчики" val="42" onClick={()=>{}}/><Row icon={Bell} title="Уведомления" badge={3} onClick={()=>{}}/><Row icon={Trash2} title="Удалить" danger onClick={()=>{}}/></>};

export const Переключатель:StoryObj<typeof ToggleRow>={name:'Строка с переключателем',render:a=>{const [on,setOn]=useState(a.on);return <ToggleRow {...a} on={on} onClick={()=>setOn(v=>!v)}/>;},
 args:{title:'Показать в ленте',sub:'Увидят в ленте и в профиле',on:true,disabled:false}};
export const Выбор:StoryObj<typeof SelectRow>={name:'Строка выбора',render:a=>{const [v,setV]=useState('all');return <SelectRow {...a} value={v} onChange={setV}/>;},
 args:{label:'Кто может просить доступ',options:[['all','Все'],['fol','Подписчики'],['none','Никто']],value:'all',onChange:()=>{}}};
