import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {Counter,Field,Input,SearchInput,Select,Stack,TextArea} from './index';

const meta={title:'Поля/Поле ввода',component:Input,tags:['autodocs'],
 parameters:{docs:{description:{component:'Любой однострочный текст. **Всегда внутри `Field`**: подпись, подсказка под полем, ошибка. Ошибка — `invalid` у поля и `error` у `Field`.'}}},
 args:{placeholder:'например, mia_rope',type:'text',disabled:false,invalid:false},
 argTypes:{type:{control:'inline-radio',options:['text','email','number','date','time','password']}},
 decorators:[(S,c)=><Field id="f" label="Ник" error={c.args.invalid?'Ник занят — попробуй другой':undefined} hint="3–20 знаков: буквы, цифры, _ и ."><S/></Field>],
} satisfies Meta<typeof Input>;
export default meta;
type S=StoryObj<typeof meta>;
export const Поле:S={args:{id:'f'}};
export const Ошибка:S={args:{id:'f',invalid:true,defaultValue:'mia'}};
export const Выключено:S={args:{id:'f',disabled:true,defaultValue:'нельзя менять'}};
export const Многострочное:S={render:()=>{const [t,setT]=useState('Привет!');return <TextArea id="f" rows={4} value={t} onChange={e=>setT(e.target.value)}/>;},
 decorators:[S=><Stack gap={1}><S/></Stack>]};
export const СоСчётчиком:S={name:'Со счётчиком',render:()=>{const [t,setT]=useState('Привет!');return <><TextArea id="f" rows={3} value={t} onChange={e=>setT(e.target.value)}/><Counter n={t.length} max={20}/></>;}};
export const Поиск:S={render:()=><SearchInput label="Ник, интерес, событие…"/>,decorators:[S=><S/>]};
export const ВыборИзСписка:S={name:'Выбор из списка',render:()=>{const [v,setV]=useState('ru');return <Select id="f" label="Язык" value={v} onChange={setV} options={[['ru','Русский'],['en','English']]}/>;}};
export const Растущее:S={name:'Растёт с текстом',render:()=><TextArea id="f" rows={1} grow={120} placeholder="Напиши ответ…"/>};
