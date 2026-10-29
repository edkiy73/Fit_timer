import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {Btn,Counter,Field,Form,Input,SearchInput,Select,Stack,TextArea} from './index';
import {useChecks} from './validate';

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
/** Kit validation layer (`useChecks` from kit/validate): the server's rules for the field (contracts/_text.mjs) — the
 * error appears on blur and on «Сохранить», the counter near the limit, the first wrong field shakes. Try a long word
 * without spaces, `<b>`, a line break in the name or only spaces. */
export const СПроверкой:S={name:'С проверкой (правила сервера)',render:()=>{
 const [name,setName]=useState('');const [bio,setBio]=useState('');
 const v=useChecks({name:'profileName',bio:'bio'},{name,bio});
 return <Stack gap={3}>
  <Field id="vn" name="name" label="Имя" error={v.error('name')}><Input id="vn" value={name} {...v.input('name')} onChange={e=>setName(e.target.value)}/>{v.counter('name')}</Field>
  <Field id="vb" name="bio" label="О себе" error={v.error('bio')}><TextArea id="vb" rows={3} value={bio} {...v.input('bio')} onChange={e=>setBio(e.target.value)}/>{v.counter('bio')}</Field>
  <Btn onClick={()=>v.submit()}>Сохранить</Btn>
 </Stack>;},decorators:[S=><S/>]};

export const ФормаКолонкой:StoryObj<typeof Form>={name:'Форма: колонка полей (Form)',render:()=><Form>
 <Field id="fm-a" label="Ник"><Input id="fm-a" placeholder="mia_rope"/></Field>
 <Field id="fm-b" label="Дней"><Input id="fm-b" inputMode="numeric" defaultValue="30"/></Field>
 <Field id="fm-c" label="Зачем"><TextArea id="fm-c" rows={2}/></Field>
 <Btn>Выдать</Btn></Form>,
 parameters:{docs:{description:{story:'`Form` — одна колонка блоков формы: поля, уведомление, главная кнопка последней. Между соседями всегда 16 px, что бы в блоке ни лежало; своих обёрток и отступов экран не заводит.'}}}};
