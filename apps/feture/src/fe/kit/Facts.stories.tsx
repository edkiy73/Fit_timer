import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {Baby,Cigarette,CigaretteOff,Languages,Ruler,Sparkles,Wine} from 'lucide-react';
import {AudSelect,Card,FactChip,FactChips,FactRow,type Aud,type FactItem} from './index';
import {ChipPick} from './ChipPick';

const ALL:FactItem[]=[
 {id:'height',icon:Ruler,value:'174 см',label:'Рост: 174 см'},
 {id:'smoking',icon:CigaretteOff,value:'Не курю',label:'Курение: нет'},
 {id:'alcohol',icon:Wine,value:'Пью редко',label:'Алкоголь: редко'},
 {id:'kids',icon:Baby,value:'Пока не знаю',label:'Дети: пока не знаю'},
 {id:'langs',icon:Languages,value:'RU · EN · DE',label:'Языки: русский, английский, немецкий'},
 {id:'zodiac',icon:Sparkles,value:'Скорпион',label:'Знак зодиака: Скорпион'},
];

const meta={title:'Домен/Обо мне',component:FactChips,tags:['autodocs'],
 parameters:{docs:{description:{component:'«Обо мне» под описанием профиля: короткие факты мягкими таблетками «иконка + значение», переносятся по строкам. Нажатие показывает подпись («Курение: иногда») на месте значения; подпись — всегда доступное имя таблетки. Иконки — только Lucide. Значение читается и без иконки.'}}},
 args:{items:ALL,label:'Обо мне'},argTypes:{items:{control:false}},
} satisfies Meta<typeof FactChips>;
export default meta;
type S=StoryObj<typeof meta>;
export const ВсеФакты:S={name:'Все факты'};
export const Несколько:S={name:'Несколько',args:{items:[ALL[0]!,ALL[4]!]}};
export const ТолькоПоказ:S={name:'Только показ («Как видят»)',args:{inert:true}};
export const Открыта:StoryObj<typeof FactChip>={name:'Таблетка после нажатия',render:a=><FactChip {...a}/>,args:{icon:Cigarette,value:'Курю иногда',label:'Курение: иногда',open:true,onClick:()=>{}}};

export const КтоВидит:StoryObj<typeof AudSelect>={name:'Кто видит пункт (AudSelect)',
 parameters:{docs:{description:{story:'Маленькая метка аудитории, которая открывает выбор «Все / По доступу / Только ты» (системный список телефона).'}}},
 render:a=>{const [v,setV]=useState<Aud>(a.value);return <AudSelect {...a} value={v} onChange={setV}/>;},
 args:{value:'granted',label:'Кто видит рост',onChange:()=>{}}};

export const Редактор:StoryObj<typeof FactRow>={name:'Строки редактора (FactRow)',
 parameters:{docs:{description:{story:'Раздел «Обо мне» в «Редактировать профиль»: строка на факт — значение списком и у каждого своя аудитория; языки — чипами с выбором до шести.'}}},
 render:()=>{const [h,setH]=useState('174');const [s,setS]=useState('');const [vis,setVis]=useState<Record<string,Aud>>({h:'all',s:'only',l:'granted'});const [langs,setLangs]=useState<string[]>(['ru','en']);
  const aud=(k:string)=><AudSelect value={vis[k]??'all'} label="Кто видит" onChange={v=>setVis(x=>({...x,[k]:v}))}/>;
  return <Card list>
   <FactRow icon={Ruler} label="Рост" aud={aud('h')} value={h} options={[['','Не указано'],['173','173 см'],['174','174 см'],['175','175 см']]} onChange={setH}/>
   <FactRow icon={Cigarette} label="Курение" aud={aud('s')} value={s} options={[['','Не указано'],['no','Не курю'],['sometimes','Курю иногда'],['yes','Курю']]} onChange={setS}/>
   <FactRow icon={Languages} label="Языки" aud={aud('l')}>
    <ChipPick label="Языки" max={6} value={langs} options={[['ru','Русский'],['en','Английский'],['de','Немецкий'],['fr','Французский'],['es','Испанский'],['it','Итальянский'],['pt','Португальский'],['uk','Украинский']].map(([code,label])=>({code:code!,label:label!}))}
     onToggle={c=>setLangs(l=>l.includes(c)?l.filter(x=>x!==c):[...l,c])} onClear={()=>setLangs([])}/>
   </FactRow>
  </Card>;}};
