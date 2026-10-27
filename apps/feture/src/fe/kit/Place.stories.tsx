import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {PickField,PlacePicker,placeName,type Place} from './Place';

const P=(code:string,country:string,ru:string,en:string):Place&{code:string}=>({id:code,code,country,ru,en});
const PLACES=[P('moscow','RU','Москва','Moscow'),P('spb','RU','Санкт-Петербург','Saint Petersburg'),P('kazan','RU','Казань','Kazan'),
 P('berlin','DE','Берлин','Berlin'),P('hamburg','DE','Гамбург','Hamburg'),P('tbilisi','GE','Тбилиси','Tbilisi'),P('istanbul','TR','Стамбул','Istanbul'),
 P('dubai','AE','Дубай','Dubai'),P('bangkok','TH','Бангкок','Bangkok'),P('almaty','KZ','Алматы','Almaty'),P('belgrade','RS','Белград','Belgrade'),
 P('limassol','CY','Лимасол','Limassol'),P('barcelona','ES','Барселона','Barcelona'),P('denpasar','ID','Денпасар, Бали','Denpasar, Bali')];

const meta={title:'Поля/Выбор города',component:PlacePicker,tags:['autodocs'],
 parameters:{docs:{description:{component:'Одно поле для города или страны. Пусто — «Популярные». Страна в результатах сужает список до её городов (фильтр снимается крестиком). Если города нет — «Добавить «Название»» → выбор страны → город уходит на проверку написания (`place.submit`), человеку он виден сразу. `clear` — пункт «Не показывать» для профиля. Поле, которое открывает выбор, — `PickField`.'}}},
 args:{places:PLACES,current:'berlin',onPick:()=>{},onClose:()=>{}},
 argTypes:{places:{control:false},add:{control:false}},
} satisfies Meta<typeof PlacePicker>;
export default meta;
type S=StoryObj<typeof meta>;
const fakeAdd=(country:string,name:string)=>new Promise<Place>(r=>setTimeout(()=>r({id:'new-'+name,country,ru:name,en:name,pending:true}),500));
export const Выбор:S={name:'Выбор города'};
export const СДобавлением:S={name:'Свой город и «Не показывать»',args:{add:fakeAdd,clear:'Не показывать'}};
export const Поле:StoryObj<typeof PickField>={name:'Поле выбора (PickField)',render:()=>{const [v,setV]=useState<Place|null>(null);const [open,setOpen]=useState(false);
 return <><PickField label="Город" value={v?placeName(v,'ru'):null} placeholder="Не показывать" onClick={()=>setOpen(true)}/>
  {open&&<PlacePicker places={PLACES} current={v?.id??null} add={fakeAdd} clear="Не показывать" onPick={p=>{setV(p);setOpen(false);}} onClose={()=>setOpen(false)}/>}</>;}};
export const ОшибкаПоля:StoryObj<typeof PickField>={name:'Поле с ошибкой',render:()=><PickField label="Город" value={null} placeholder="Выбери город" error="Выбери город события" onClick={()=>{}}/>};
