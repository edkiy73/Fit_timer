import type {Meta,StoryObj} from '@storybook/react-vite';
import {fn} from 'storybook/test';
import {Bell,Heart,Plus,Settings,Share,Trash2} from 'lucide-react';
import {Btn,IconBtn,Stack} from './index';

const icons={none:undefined,Plus,Heart,Share,Trash2,Bell,Settings};
const iconArg={options:Object.keys(icons),mapping:icons,control:{type:'select' as const}};

const meta={
 title:'Кнопки/Кнопка',component:Btn,tags:['autodocs'],
 parameters:{docs:{description:{component:'Главное действие экрана или группы. **Одна главная на группу**; вторая — `soft`, опасная — `danger`, лёгкая — `text`. Загрузка (`busy`) — мягкое мигание на месте, без спиннера и без изменения ширины. Не пиши свою кнопку через `<button className="btn">`.'}}},
 args:{children:'Опубликовать',kind:'primary',size:'',auto:false,disabled:false,busy:false,onClick:fn()},
 argTypes:{kind:{control:'inline-radio',options:['primary','soft','danger','text']},size:{control:'inline-radio',options:['','md','sm'],labels:{'':'48','md':'44','sm':'36'}},icon:iconArg},
} satisfies Meta<typeof Btn>;
export default meta;
type S=StoryObj<typeof meta>;

export const Главная:S={};
export const Вторая:S={args:{kind:'soft',children:'Как увидят'}};
export const Опасная:S={args:{kind:'danger',children:'Удалить'}};
export const Текстовая:S={args:{kind:'text',auto:true,children:'В черновик'}};
export const СИконкой:S={name:'С иконкой',args:{icon:Plus,children:'Создать'}};
export const Загрузка:S={args:{busy:true}};
export const Выключена:S={args:{disabled:true}};
export const ВсеСостояния:S={name:'Все виды и состояния',render:a=><Stack gap={2}>
 {(['primary','soft','danger','text'] as const).map(k=><Stack key={k} row gap={2}><Btn {...a} kind={k} auto>{k}</Btn><Btn {...a} kind={k} auto disabled>выкл.</Btn><Btn {...a} kind={k} auto busy>загрузка</Btn></Stack>)}
 <Stack row gap={2}><Btn {...a} auto>48</Btn><Btn {...a} size="md" auto>44</Btn><Btn {...a} size="sm" auto>36</Btn></Stack></Stack>};

export const Круглая:StoryObj<typeof IconBtn>={name:'Круглая кнопка',render:a=><IconBtn {...a}/>,
 args:{icon:Bell,label:'Уведомления',kind:'',size:'',disabled:false,badge:undefined},
 argTypes:{icon:iconArg,kind:{control:'inline-radio',options:['','ghost','glass','add']},size:{control:'inline-radio',options:['','sm']},badge:{control:'select',options:[undefined,3,120,'dot']}},
 parameters:{docs:{description:{story:'Действие иконкой. `label` обязателен — его читает экранный диктор. Счётчик — `badge` (число или `dot`).'}}}};
export const КруглыеВсе:StoryObj<typeof IconBtn>={name:'Круглые: все',render:()=><Stack row gap={3}>
 <IconBtn icon={Bell} label="Обычная"/><IconBtn icon={Heart} kind="ghost" label="Прозрачная"/><IconBtn icon={Plus} kind="add" label="Акцент"/><IconBtn icon={Trash2} size="sm" label="Маленькая"/>
 <IconBtn icon={Bell} label="С бейджем" badge={4}/><IconBtn icon={Bell} label="Много" badge={120}/><IconBtn icon={Bell} label="Точка" badge="dot"/><IconBtn icon={Settings} label="Выключена" disabled/></Stack>};
