import type {Meta,StoryObj} from '@storybook/react-vite';
import {Heart} from 'lucide-react';
import {Alert,Btn,Empty,Skel,Stack} from './index';

const meta={title:'Сообщения/Сообщение',component:Alert,tags:['autodocs'],
 parameters:{docs:{description:{component:'Постоянное сообщение в потоке экрана: `ok`, `info`, `warn`, `err` (ошибку читает экранный диктор). Временное — уведомление (toast). Пустой экран — `Empty`. Загрузка — `Skel`, мягкое мигание, без спиннеров.'}}},
 args:{kind:'info',children:'С фото — после короткой проверки'},argTypes:{kind:{control:'inline-radio',options:['ok','info','warn','err']}},
} satisfies Meta<typeof Alert>;
export default meta;
type S=StoryObj<typeof meta>;
export const Сообщение:S={};
export const Все:S={render:()=><Stack gap={2}><Alert kind="ok">Сохранено</Alert><Alert kind="info">Подсказка по экрану</Alert><Alert kind="warn">Нужно внимание</Alert><Alert kind="err">Не получилось — попробуй ещё раз</Alert></Stack>};
export const Пусто:StoryObj<typeof Empty>={name:'Пустое состояние',render:a=><Empty {...a}><Btn size="sm" auto>Перейти в ленту</Btn></Empty>,args:{icon:Heart,title:'Пока пусто',text:'Здесь появятся сохранённые публикации.'}};
export const Загрузка:StoryObj<typeof Skel>={name:'Скелетон',render:a=><Skel {...a}/>,args:{kind:'list',rows:3},argTypes:{kind:{control:'inline-radio',options:['list','post','card','tiles']}}};
