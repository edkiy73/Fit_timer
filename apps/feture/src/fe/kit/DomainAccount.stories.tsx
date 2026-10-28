import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {fn} from 'storybook/test';
import {History,RefreshCw,Undo2} from 'lucide-react';
import {Btn,Maintenance,PlanCards,PremiumFeats,PremiumHero,Thread} from './index';

const meta={title:'Домен/Аккаунт',component:PremiumHero,tags:['autodocs'],
 parameters:{docs:{description:{component:'Аккаунт (волна 8): плашка Premium, что даёт Premium, карточки тарифов и сроков подарка, экран техработ, переписка с поддержкой.'}}},
 args:{lead:'Больше возможностей — то же уважение к границам'},
} satisfies Meta<typeof PremiumHero>;
export default meta;
type S=StoryObj<typeof meta>;
export const Плашка:S={};
export const ПлашкаВЛисте:S={name:'Плашка в листе (с ✕)',args:{onClose:fn(),closeLabel:'Закрыть'}};

const FEATS=[{id:'undo',icon:Undo2,title:'Вернуть пропущенных',text:'Любую анкету за 7 дней — не только последнюю'},{id:'history',icon:History,title:'Вся история просмотров',text:'Все просмотренные за неделю'}];
export const ЧтоДаёт:StoryObj<typeof PremiumFeats>={name:'Что даёт Premium',render:a=><PremiumFeats {...a}/>,args:{items:FEATS,current:'undo',neededLabel:'нужно сейчас'},argTypes:{items:{control:false}}};

type Plan='year'|'month';
export const Тарифы:StoryObj<typeof PlanCards<Plan>>={name:'Тарифы',
 render:a=>{const [v,setV]=useState<Plan>(a.value);return <PlanCards<Plan> {...a} value={v} onChange={setV}/>;},
 args:{label:'Тариф',value:'year',onChange:()=>{},plans:[{id:'year',title:'Год',price:'79,99 €',note:'6,67 € в месяц',badge:'−44%'},{id:'month',title:'Месяц',price:'11,99 €',note:'продлевается каждый месяц'}]},argTypes:{plans:{control:false}}};
type Gift='m1'|'m3'|'m12';
export const СрокПодарка:StoryObj<typeof PlanCards<Gift>>={name:'Срок подарка',
 render:a=>{const [v,setV]=useState<Gift>(a.value);return <PlanCards<Gift> {...a} value={v} onChange={setV}/>;},
 args:{label:'Срок',value:'m1',onChange:()=>{},plans:[{id:'m1',title:'1 месяц',price:'11,99 €'},{id:'m3',title:'3 месяца',price:'29,99 €'},{id:'m12',title:'12 месяцев',price:'79,99 €'}]},argTypes:{plans:{control:false}}};

export const Техработы:StoryObj<typeof Maintenance>={name:'Экран техработ',render:a=><Maintenance {...a}><Btn kind="soft" auto icon={RefreshCw}>Проверить ещё раз</Btn></Maintenance>,
 args:{title:'Скоро вернёмся',text:'В FetUre идут технические работы. Попробуй зайти немного позже.',message:'Обновляем базу, вернёмся к 15:00',note:'Твои данные и переписка сохранятся.'}};
export const ТехработыБезСообщения:StoryObj<typeof Maintenance>={name:'Техработы без сообщения',render:a=><Maintenance {...a}/>,args:{title:'Скоро вернёмся',text:'В FetUre идут технические работы.'}};

export const Переписка:StoryObj<typeof Thread>={name:'Переписка с поддержкой',render:a=><Thread {...a}/>,
 args:{label:'Обращение',messages:[{id:'1',mine:true,text:'Не приходит код из письма',meta:'28 окт, 14:02'},{id:'2',mine:false,text:'Проверь папку «Спам»: код живёт 15 минут.',meta:'Поддержка · 28 окт, 14:20'}]},argTypes:{messages:{control:false}}};
