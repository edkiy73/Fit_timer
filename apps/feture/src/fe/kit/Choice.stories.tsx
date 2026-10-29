import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {ChipPick} from './ChipPick';
import {Btn,Check,CheckList,ChoiceChips,Chip,Chips,Field,MultiChips,RadioList,Range,Stack,Switch} from './index';

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
export const НесколькоСоВсё:S={name:'Несколько из набора со «Всё» (MultiChips)',render:()=>{const [v,setV]=useState<('info'|'media'|'interests')[]>(['info','media','interests']);
 return <Stack gap={3}><MultiChips label="Что запросить" all="Всё" value={v} onChange={setV} options={[['info','Описание'],['media','Фото и видео'],['interests','Интересы']]}/>
  <MultiChips label="Что запросить" all="Всё" value={[]} onChange={()=>{}} options={[['info','Описание'],['interests','Интересы']]}/>
  <MultiChips label="Что запросить" all="Всё" disabled value={['info']} onChange={()=>{}} options={[['info','Описание'],['media','Фото']]}/></Stack>;}};
export const ОдинИзНабора:S={name:'Один из набора (ChoiceChips)',render:()=>{const [v,setV]=useState('all');return <ChoiceChips label="Кто видит" value={v} onChange={setV} options={[['all','Все'],['fol','Подписчики'],['only','Только я']]}/>;}};
export const Радиосписок:S={name:'Радиосписок',render:()=>{const [v,setV]=useState('spam');return <RadioList label="Причина" value={v} onChange={setV} options={[['spam','Спам или мошенничество'],['threat','Угрозы или шантаж','С подробностями'],['other','Другое']]}/>;}};
export const НесколькоСтроками:S={name:'Несколько из списка строками (CheckList)',render:()=>{const [v,setV]=useState<('info'|'photos'|'video')[]>(['info','photos']);
 return <CheckList label="Что открыть" value={v} onChange={setV} options={[['info','Описание','запрошено'],['photos','Фото','уже открыто'],['video','Видео','не запрошено']]}/>;}};
export const Галочка:S={render:()=>{const [a,setA]=useState(false);return <Stack gap={2}><Check on={a} onChange={setA}>Принимаю условия и политику</Check><Check on={false} error onChange={()=>{}}>Ошибка — без отметки дальше нельзя</Check></Stack>;}};
export const ГалочкаСДействием:S={name:'Галочка с действием (aside)',render:()=>{const [a,setA]=useState(false);return <Check on={a} onChange={setA} aside={<Btn kind="text" size="sm" auto onClick={()=>{}}>Читать</Btn>}>Принимаю условия и политику приватности</Check>;}};
export const ДлинныйСписок:S={name:'Длинный список (ChipPick)',render:()=>{const opts=['женщина','мужчина','небинарная персона','транс-женщина','транс-мужчина','гендерквир','агендер','пока ищу слово','бигендер','демигендер','пангендер'].map((l,i)=>({code:'g'+i,label:l}));
 const [v,setV]=useState<string[]>(['g2']);return <ChipPick label="Гендер" options={opts} value={v} max={5} onClear={()=>setV([])} onToggle={c=>setV(x=>x.includes(c)?x.filter(y=>y!==c):x.length<5?[...x,c]:x)}/>;}};
export const Переключатель:S={render:()=>{const [a,setA]=useState(true);return <Stack row gap={3}><Switch label="Включён" on={a} onChange={setA}/><Switch label="Выключен" on={false} disabled onChange={()=>{}}/></Stack>;}};
export const Ползунок:S={render:()=>{const [v,setV]=useState(30);return <Field label={`Возраст до ${v}`}><Range label="Возраст" min={18} max={99} value={v} onChange={setV}/></Field>;}};
export const Метка:S={name:'Чип-метка (без нажатия)',render:()=><Chips><Chip>Статья</Chip><Chip on>Выбрано</Chip></Chips>};
export const СБейджем:S={name:'Чип со счётчиком',render:()=><Chips><Chip filter lit badge={2} onClick={()=>{}}>Фильтры</Chip></Chips>};
