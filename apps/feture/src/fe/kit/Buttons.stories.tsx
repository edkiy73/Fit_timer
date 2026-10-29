import type {Meta,StoryObj} from '@storybook/react-vite';
import {fn} from 'storybook/test';
import {Bell,Heart,Plus,Settings,Share,Trash2} from 'lucide-react';
import {Actions,Btn,IconBtn,Stack} from './index';

const icons={none:undefined,Plus,Heart,Share,Trash2,Bell,Settings};
const iconArg={options:Object.keys(icons),mapping:icons,control:{type:'select' as const}};

const meta={
 title:'Кнопки/Кнопка',component:Btn,tags:['autodocs'],
 parameters:{docs:{description:{component:'Главное действие экрана или группы. **Одна главная на группу**; вторая — `soft`, опасная — `danger`. Тихие действия — три вида: `quiet` (едва заметная подложка, например «Не иду»), `ghost` (без подложки, цвет текста), `text` (слово-ссылка акцентом). Нажатое состояние (`pressed`: «Отправлено», «Вы подписаны», мой ответ) у всех видов одно — мягкая акцентная подложка и акцентная подпись. Загрузка (`busy`) — мягкое мигание на месте, без спиннера и без изменения ширины. Не пиши свою кнопку через `<button className="btn">`.'}}},
 args:{children:'Опубликовать',kind:'primary',size:'',auto:false,disabled:false,busy:false,pressed:false,onClick:fn()},
 argTypes:{kind:{control:'inline-radio',options:['primary','soft','quiet','ghost','text','danger','dark']},size:{control:'inline-radio',options:['','md','sm'],labels:{'':'48','md':'44','sm':'36'}},icon:iconArg},
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
 {(['primary','soft','quiet','ghost','text','danger','dark'] as const).map(k=><Stack key={k} row gap={2}><Btn {...a} kind={k} size="sm" auto>{k}</Btn><Btn {...a} kind={k} size="sm" auto pressed icon={Heart}>нажата</Btn><Btn {...a} kind={k} size="sm" auto disabled>выкл.</Btn><Btn {...a} kind={k} size="sm" auto busy>загрузка</Btn></Stack>)}
 <Stack row gap={2}><Btn {...a} auto>48</Btn><Btn {...a} size="md" auto>44</Btn><Btn {...a} size="sm" auto>36</Btn></Stack></Stack>};
export const Тихие:S={name:'Тихие: quiet, ghost, text',render:a=><Stack gap={3}>
 <Actions><Btn {...a} kind="primary" icon={Heart}>Иду</Btn><Btn {...a} kind="quiet">Не иду</Btn></Actions>
 <Actions><Btn {...a} kind="soft">Изменить</Btn><Btn {...a} kind="ghost">Отмена</Btn></Actions>
 <Btn {...a} kind="text" auto>Подробнее о правилах</Btn></Stack>,
 parameters:{docs:{description:{story:'`quiet` — второе, равноправное, но тихое действие рядом с главным (подложка едва заметна). `ghost` — отмена или выход без веса. `text` — слово-ссылка внутри блока или под ним.'}}}};
export const Нажатая:S={name:'Нажатая (pressed)',render:a=><Stack gap={2}>
 <Actions><Btn {...a} kind="primary" pressed icon={Heart}>Отправлено</Btn><Btn {...a} kind="soft" pressed>Вы подписаны</Btn></Actions>
 <Actions><Btn {...a} kind="quiet" pressed>Не иду</Btn><Btn {...a} kind="ghost" pressed>Сохранено</Btn></Actions></Stack>,
 parameters:{docs:{description:{story:'Нажатое состояние (`pressed`, `aria-pressed`) одно для всех видов: мягкая акцентная подложка, акцентная подпись и иконка видны в обеих темах.'}}}};

export const Круглая:StoryObj<typeof IconBtn>={name:'Круглая кнопка',render:a=><IconBtn {...a}/>,
 args:{icon:Bell,label:'Уведомления',kind:'',size:'',disabled:false,badge:undefined},
 argTypes:{icon:iconArg,kind:{control:'inline-radio',options:['','ghost','glass','add']},size:{control:'inline-radio',options:['','sm']},badge:{control:'select',options:[undefined,3,120,'dot']}},
 parameters:{docs:{description:{story:'Действие иконкой. `label` обязателен — его читает экранный диктор. Счётчик — `badge` (число или `dot`).'}}}};
export const КруглыеВсе:StoryObj<typeof IconBtn>={name:'Круглые: все',render:()=><Stack row gap={3}>
 <IconBtn icon={Bell} label="Обычная"/><IconBtn icon={Heart} kind="ghost" label="Прозрачная"/><IconBtn icon={Plus} kind="add" label="Акцент"/><IconBtn icon={Trash2} size="sm" label="Маленькая"/>
 <IconBtn icon={Bell} label="С бейджем" badge={4}/><IconBtn icon={Bell} label="Много" badge={120}/><IconBtn icon={Bell} label="Точка" badge="dot"/><IconBtn icon={Settings} label="Выключена" disabled/></Stack>};
export const ВРяду:S={name:'В ряду: по ширине текста (fit)',render:()=><div className="row g8"><Btn kind="soft" fit>Изменить</Btn><Btn>Опубликовать</Btn></div>};
export const Тёмная:S={name:'Тёмная (на светлой вуали)',args:{kind:'dark',children:'Попросить доступ'}};
export const Квадратная:S={name:'Квадратная с иконкой (square)',render:a=><Stack row gap={2}><Btn kind="soft" square icon={Trash2} aria-label="Удалить"/><Btn {...a}/></Stack>,args:{children:'Сохранить'}};
export const РядДействий:StoryObj<typeof Actions>={name:'Ряд кнопок (Actions)',render:a=><Actions {...a}><Btn kind="soft" icon={Heart}>Симпатии</Btn><Btn kind="soft" icon={Bell}>Недавние</Btn></Actions>,
 args:{stack:false},parameters:{docs:{description:{story:'Единственный ряд кнопок приложения: равные ширины на всю колонку, один отступ; `stack` — одна под другой. Экран не выстраивает кнопки своим Stack, отступами или шириной.'}}}};
export const РядДействийСтолбиком:StoryObj<typeof Actions>={...РядДействий,name:'Ряд кнопок столбиком',args:{stack:true}};
