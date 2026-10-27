import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {Heart,Trash2} from 'lucide-react';
import {Btn,Card,CodeInput,Empty,Field,H,Input,RangeDual,Stack,Text} from './index';

const meta={title:'Поля/Код и диапазон',component:CodeInput,tags:['autodocs'],
 parameters:{docs:{description:{component:'Код входа — шесть клеток: вставка или ввод заполняет по цифре. Диапазон «от–до» — два бегунка на одной линии (возраст).'}}},
 args:{value:'',onChange:()=>{},label:'Код из письма'},
} satisfies Meta<typeof CodeInput>;
export default meta;
type S=StoryObj<typeof meta>;
export const Код:S={render:a=>{const [v,setV]=useState('');return <CodeInput {...a} value={v} onChange={setV}/>;}};
export const КодОшибка:S={name:'Код с ошибкой',render:a=><CodeInput {...a} value="123" invalid/>};
export const Диапазон:S={name:'Диапазон от–до',render:()=>{const [lo,setLo]=useState(25);const [hi,setHi]=useState(40);
 return <Field label={`Возраст ${lo}–${hi}`}><RangeDual label="Возраст" min={18} max={99} lo={lo} hi={hi} onChange={(a,b)=>{setLo(a);setHi(b);}}/></Field>;}};
export const ПолеПолное:S={name:'Поле: необязательно, подсказка, ошибка',render:()=><Stack gap={3}>
 <Field id="a" label="О себе" optional="необязательно" hint="Пара фраз — это увидят все"><Input id="a"/></Field>
 <Field id="b" label="Ник" error="Ник занят — попробуй другой" name="handle"><Input id="b" invalid defaultValue="mia"/></Field></Stack>};
export const КарточкаОпасная:S={name:'Карточка «опасность»',render:()=><Card tone="danger"><Stack gap={2}><H level={4}>Удалить аккаунт</H><Text size="sm" tone="mute">Профиль, публикации и переписка исчезнут.</Text><Btn kind="danger" icon={Trash2} fit>Удалить</Btn></Stack></Card>};
export const ПустоеСКартинкой:S={name:'Пустое: картинка и широкий блок',render:()=><Empty art={<div className="k-demo-dark" style={{width:96,height:96,borderRadius:48}}/>} title="Вы пока не пара" text="Пригласи партнёра по нику." wide><Card>Широкий блок на всю ширину</Card></Empty>};
void Heart;
export const КодСобытия:S={name:'Код: выключен, сам отправляет',render:a=>{const [v,setV]=useState('12');const [sent,setSent]=useState('');
 return <Stack gap={2}><CodeInput {...a} value={v} onChange={setV} onComplete={setSent} onEnter={setSent}/><CodeInput {...a} value="123456" disabled onChange={()=>{}}/>{sent&&<Text size="sm">Отправлен: {sent}</Text>}</Stack>;},
 args:{label:'Код из письма',digitLabel:'Цифра'}};
export const ДиапазонПодписи:S={name:'Диапазон: свои подписи',render:()=>{const [lo,setLo]=useState(25);const [hi,setHi]=useState(40);
 return <Field label={`Возраст ${lo}–${hi}`}><RangeDual label="Возраст" labels={['Возраст от','Возраст до']} min={18} max={99} lo={lo} hi={hi} onChange={(a,b)=>{setLo(a);setHi(b);}}/></Field>;}};
