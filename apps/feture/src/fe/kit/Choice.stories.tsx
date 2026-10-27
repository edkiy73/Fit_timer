import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {Check,ChoiceChips,Chip,Chips,Field,RadioList,Range,Stack,Switch} from './index';

const meta={title:'Выбор/Чип',component:Chip,tags:['autodocs'],
 parameters:{docs:{description:{component:'Несколько значений из набора (темы, интересы) или фильтр. `more` — «Все · N», открывает полный список. Одно значение из набора — `ChoiceChips`.'}}},
 args:{children:'Связывание',on:false,more:false,filter:false,disabled:false,onClick:()=>{}},
} satisfies Meta<typeof Chip>;
export default meta;
type S=StoryObj<typeof meta>;
export const Чип:S={render:a=>{const [on,setOn]=useState(!!a.on);return <Chips><Chip {...a} on={on} onClick={()=>setOn(v=>!v)}/></Chips>;}};
export const Состояния:S={render:()=><Chips><Chip onClick={()=>{}}>Обычный</Chip><Chip on onClick={()=>{}}>Выбран</Chip><Chip more onClick={()=>{}}>Все · 75</Chip><Chip disabled onClick={()=>{}}>Выключен</Chip></Chips>};
export const Набор:S={name:'Несколько из набора',render:()=>{const [v,setV]=useState(['rope']);const t=(id:string)=>setV(x=>x.includes(id)?x.filter(y=>y!==id):[...x,id]);
 return <Chips>{[['rope','Связывание'],['care','Забота после'],['role','Ролевые игры'],['sense','Сенсорные игры']].map(([id,l])=><Chip key={id} on={v.includes(id!)} onClick={()=>t(id!)}>{l}</Chip>)}</Chips>;}};
export const ОдинИзНабора:S={name:'Один из набора (ChoiceChips)',render:()=>{const [v,setV]=useState('all');return <ChoiceChips label="Кто видит" value={v} onChange={setV} options={[['all','Все'],['fol','Подписчики'],['only','Только я']]}/>;}};
export const Радиосписок:S={name:'Радиосписок',render:()=>{const [v,setV]=useState('spam');return <RadioList label="Причина" value={v} onChange={setV} options={[['spam','Спам или мошенничество'],['threat','Угрозы или шантаж','С подробностями'],['other','Другое']]}/>;}};
export const Галочка:S={render:()=>{const [a,setA]=useState(false);return <Stack gap={2}><Check on={a} onChange={setA}>Принимаю условия и политику</Check><Check on={false} error onChange={()=>{}}>Ошибка — без отметки дальше нельзя</Check></Stack>;}};
export const Переключатель:S={render:()=>{const [a,setA]=useState(true);return <Stack row gap={3}><Switch label="Включён" on={a} onChange={setA}/><Switch label="Выключен" on={false} disabled onChange={()=>{}}/></Stack>;}};
export const Ползунок:S={render:()=>{const [v,setV]=useState(30);return <Field label={`Возраст до ${v}`}><Range label="Возраст" min={18} max={99} value={v} onChange={setV}/></Field>;}};
export const Метка:S={name:'Чип-метка (без нажатия)',render:()=><Chips><Chip>Статья</Chip><Chip on>Выбрано</Chip></Chips>};
