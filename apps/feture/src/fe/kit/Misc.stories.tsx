import type {Meta,StoryObj} from '@storybook/react-vite';
import {Av,Btn,Card,Divider,Group,H,LinkBtn,Note,Pill,Progress,SectionLabel,Skel,Stack,Steps,Text} from './index';

const meta={title:'Прочее/Метка',component:Pill,tags:['autodocs'],
 parameters:{docs:{description:{component:'Короткий статус рядом с текстом: `ok` одобрено, `wait` ждёт, `v` по доступу, `bad` отклонено, `hot` акцент.'}}},
 args:{tone:'ok',children:'одобрено'},argTypes:{tone:{control:'inline-radio',options:[undefined,'ok','wait','v','bad','hot']}},
} satisfies Meta<typeof Pill>;
export default meta;
type S=StoryObj<typeof meta>;
export const Метка:S={};
export const Метки:S={name:'Все метки',render:()=><Stack row gap={2}><Pill tone="ok">одобрено</Pill><Pill tone="wait">ждёт</Pill><Pill tone="v">по доступу</Pill><Pill tone="bad">отклонено</Pill><Pill tone="hot">3</Pill><Pill>просто</Pill></Stack>};
export const Прогресс:StoryObj<typeof Steps>={name:'Шаги и прогресс',render:a=><Stack gap={3}><Steps {...a}/><Progress value={a.step/a.total}/></Stack>,args:{step:2,total:4,name:'Где и когда'}};
export const Аватар:StoryObj<typeof Av>={render:a=><Av {...a}/>,args:{name:'Mia',seed:'mia',size:''},argTypes:{size:{control:'inline-radio',options:['xs','sm','','lg','xl']}}};
export const Аватары:S={name:'Все аватары',render:()=><Stack row gap={3}><Av name="Mia" seed="m" size="xs"/><Av name="Mia" seed="m" size="sm"/><Av name="Mia" seed="m"/><Av name="Mia" seed="m" size="lg"/><Av name="Mia" seed="m" size="xl"/><Av name="Eva Tom" seed="c" couple={['Eva','Tom']}/></Stack>};
export const Раскладка:S={name:'Группа, карточка, разделитель',render:()=><Stack gap={4}>
 <Group title="Раздел" action={<Btn kind="text" size="sm" auto>Все</Btn>} foot="Сноска под группой."><Card><Stack gap={2}><H level={4}>Карточка</H><Text size="sm" tone="mute">Поверхность блока.</Text></Stack></Card></Group>
 <Divider/><SectionLabel action={<Btn kind="text" size="sm" auto>Все</Btn>}>Подпись раздела</SectionLabel><Note>Тихая подсказка под блоком.</Note></Stack>};
export const МеткаКнопка:S={name:'Метка-кнопка и «стекло»',render:()=><Stack row gap={2}><Pill tone="v" onClick={()=>{}}>Открыть доступ</Pill><span className="k-demo-dark"><Pill tone="glass">Онлайн</Pill></span></Stack>};
export const КнопкаСсылка:S={name:'Кнопка-ссылка',render:()=><LinkBtn href="https://example.com">Билет у организатора</LinkBtn>};
export const Заголовки:S={name:'Крупный заголовок и текст 16',render:()=><Stack gap={2}><H level={0}>Вечер шибари для начинающих</H><Text size="md" tone="ink">Текст 16 — вводный абзац.</Text></Stack>};
export const Скелетоны:S={name:'Скелетоны: обложка, баннер, сетка, строка',render:()=><Stack gap={3}><Skel kind="hero" rows={1}/><Skel kind="cover" rows={1}/><Skel kind="grid" rows={6}/><Skel kind="line" rows={2}/></Stack>};
