import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {fn} from 'storybook/test';
import {History,Mail,MessageCircle,RefreshCw,Smartphone,Undo2} from 'lucide-react';
import {Btn,Card,ChannelHeads,ChannelToggle,ChoiceCards,LockPreview,Maintenance,PlanCards,PremiumFeats,PremiumHero,Row,SectionLabel,Thread} from './index';
import {UpdateRequired,UpdateStateProvider,type UpdateState} from '../app-update';

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

type UpdStatus=UpdateState['status'];
const updState=(status:UpdStatus):UpdateState=>({offer:{level:'required',channel:'direct',versionCode:42,versionName:'1.4',url:'https://example.org/app.apk',message:''},
 status,progress:-1,start:async()=>{},cancel:async()=>{},dismiss:()=>{}});
/** The same frame the app gives it (shell `Center`): the whole app is this screen until the update is installed. */
export const ОбязательноеОбновление:StoryObj<{status:UpdStatus}>={name:'Обязательное обновление',
 render:a=><div className="view"><div className="wrap"><UpdateStateProvider value={updState(a.status)}><UpdateRequired/></UpdateStateProvider></div></div>,
 args:{status:'error'},argTypes:{status:{control:'inline-radio',options:['idle','downloading','permission','error']}},
 parameters:{docs:{description:{story:'Ошибка и подсказка про разрешение стоят под кнопкой с обычным отступом блока; текст сообщения — по левому краю.'}}}};

export const ЭкранБлокировки:S={name:'Экран блокировки (LockPreview)',parameters:{docs:{description:{story:'Как уведомление выглядит на заблокированном телефоне: тёмный экран в обеих темах. Экран передаёт ровно то, что пришлёт выбранный режим; переключение ChoiceCards меняет превью.'}}},
 render:()=>{const [m,setM]=useState<'normal'|'safe'>('safe');return <div style={{display:"grid",gap:12,maxWidth:420}}>
  <ChoiceCards label="Что видно на экране блокировки" value={m} onChange={setM} options={[['normal','Обычные','Имя и начало сообщения, кто поставил симпатию'],['safe','Безопасные','Без имён и текста — только «Новое уведомление»']]}/>
  <LockPreview app="FetUre" icon="/icon.svg" items={m==='safe'?[{title:'FetUre',body:'Новое уведомление',time:'сейчас'},{title:'FetUre',body:'Новое уведомление',time:'2 мин'}]
   :[{title:'Мира',body:'Привет! Видела тебя на встрече в субботу…',time:'сейчас'},{title:'Sofi',body:'Ставит тебе симпатию',time:'2 мин'}]}/></div>;}};
export const Каналы:S={name:'Каналы категории (ChannelToggle)',parameters:{docs:{description:{story:'Пуш и почта для категории уведомлений: квадратные переключатели в конце строки, заголовки колонок — ChannelHeads в SectionLabel. Выключенный канал гасит колонку.'}}},
 render:()=>{const [p,setP]=useState(true);const [e,setE]=useState(false);return <div style={{maxWidth:420}}>
  <SectionLabel action={<ChannelHeads labels={['Пуш','Почта']}/>}>О чём сообщать</SectionLabel>
  <Card list className="ncats"><Row icon={MessageCircle} title="Совпадения и сообщения" sub="Взаимная симпатия, новое сообщение" end={<>
   <ChannelToggle icon={Smartphone} on={p} label="Пуш: Совпадения" onClick={()=>setP(v=>!v)}/><ChannelToggle icon={Mail} on={e} label="Почта: Совпадения" onClick={()=>setE(v=>!v)}/></>}/>
   <Row icon={MessageCircle} title="Почта выключена" sub="Колонка погашена" end={<><ChannelToggle icon={Smartphone} on label="Пуш" onClick={()=>{}}/><ChannelToggle icon={Mail} on disabled label="Почта" onClick={()=>{}}/></>}/></Card></div>;}};
