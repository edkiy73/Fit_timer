import type {Meta,StoryObj} from '@storybook/react-vite';
import {fn} from 'storybook/test';
import {Av,ChatList,ChatRow,CoupleTag,NewMatch,NewMatches} from './index';

const meta={title:'Домен/Чаты',component:ChatRow,tags:['autodocs'],
 parameters:{docs:{description:{component:'Строка диалога в списке чатов, архиве и «Запросах»: аватар, имя, последнее сообщение в одну строку, время, счётчик непрочитанного. `note` — вторая строка (откуда запрос), `tag` — метка «Чат пары», `ended` — общение завершено. Строки стоят в `ChatList`.'}}},
 render:a=><ChatList><ChatRow {...a}/></ChatList>,
 args:{av:<Av name="Mia" seed="mia" size="lg"/>,name:'Mia',line:'Привет! Как прошла суббота?',time:'5 мин',unread:2,onClick:fn()},
 argTypes:{av:{control:false},tag:{control:false},note:{control:'text'}},
} satisfies Meta<typeof ChatRow>;
export default meta;
type S=StoryObj<typeof meta>;
export const Непрочитано:S={};
export const Прочитано:S={args:{unread:0,line:'Ты: До встречи!'}};
export const ЧатПары:S={name:'Чат пары',args:{tag:<CoupleTag>Чат пары</CoupleTag>,unread:0}};
export const Завершено:S={name:'Общение завершено',args:{unread:0,ended:true,line:'Общение завершено'}};
export const Запрос:S={name:'Запрос (вторая строка — откуда знакомы)',args:{unread:0,name:'Пара Ann & Leo',line:'Привет! Видели вас на встрече, хотим познакомиться',note:'Участник сообщества «Кино по пятницам» · Подписан на тебя'}};
export const Список:S={name:'Список',render:()=><ChatList>
 <ChatRow av={<Av name="Mia" seed="mia" size="lg"/>} name="Mia" line="Привет! Как прошла суббота?" time="5 мин" unread={2} onClick={fn()}/>
 <ChatRow av={<Av name="Kai" seed="kai" size="lg"/>} name="Kai" tag={<CoupleTag>Чат пары</CoupleTag>} line="Фото" time="2 ч" onClick={fn()}/>
 <ChatRow av={<Av name="Noa" seed="noa" size="lg"/>} name="Noa — очень длинное имя, которое не помещается" line="Длинное сообщение, которое режется в конце строки многоточием, а не переносится" time="12 окт." onClick={fn()}/>
</ChatList>};
export const НовыеСовпадения:StoryObj<typeof NewMatch>={name:'Новые совпадения',render:a=><NewMatches>
 <NewMatch {...a}/><NewMatch av={<Av name="Kai" seed="kai"/>} name="Kai" us="чат пары" onClick={fn()}/><NewMatch av={<Av name="Alexandra" seed="al"/>} name="Alexandra" onClick={fn()}/>
</NewMatches>,args:{av:<Av name="Mia" seed="mia"/>,name:'Mia',onClick:fn()},argTypes:{av:{control:false}}};
