import type {Meta,StoryObj} from '@storybook/react-vite';
import {fn} from 'storybook/test';
import {ActingAv,ActorCard,ActorCards,Av,Btn,ReturnNote,ReviewMeta,ReviewPost,Sheet,Stack} from './index';

const meta={title:'Домен/Пара',component:ActorCard,tags:['autodocs'],
 parameters:{docs:{description:{component:'«Действовать как» (док «Я» при активной паре): карточка профиля выбирает его, кнопка справа открывает профиль. `dot` — что-то ждёт решения. Карточки — внутри `ActorCards` (подпись снизу). Для согласований пары: `ReviewMeta` (кто предложил, версия), `ReviewPost` (что будет опубликовано), `ReturnNote` (комментарий «на доработку»).'}}},
 args:{av:<Av name="Mia" seed="mia"/>,name:'Mia',sub:'Личный профиль',selected:true,onPick:fn(),onOpen:fn(),openLabel:'Открыть профиль'},
 argTypes:{av:{control:false}},
 render:a=><ActorCards label="Действовать как"><ActorCard {...a}/></ActorCards>,
} satisfies Meta<typeof ActorCard>;
export default meta;
type S=StoryObj<typeof meta>;
export const Выбрана:S={};
export const СоСчётчиком:S={name:'Ждёт решения (точка)',args:{selected:false,dot:true,name:'Mia & Tom',sub:'2 ждут решения',av:<Av name="Mia & Tom" seed="pair"/>}};
export const Две:S={name:'Я и пара, с подписью',render:a=><ActorCards label="Действовать как" foot="Чаты, уведомления и «Нужно решить» приходят в одно место.">
 <ActorCard {...a}/><ActorCard {...a} selected={false} dot name="Mia & Tom" sub="Tom предлагает изменения" av={<Av name="Mia & Tom" seed="pair"/>} openLabel="Перейти в профиль пары"/></ActorCards>};

export const Согласование:StoryObj<typeof ReviewPost>={name:'Лист согласования публикации',
 render:a=><Sheet title="Согласование публикации" onClose={fn()} foot={<><Btn>Одобрить</Btn><Btn kind="soft" className="mt8">Вернуть на доработку</Btn></>}>
  <ReviewMeta by="Tom" version="Версия 2"/><ReviewPost {...a}/></Sheet>,
 args:{title:'Вечер настолок',children:<p>Собираемся в субботу, берите любимые игры.</p>,meta:'2 фото · видят все'}};
export const Возвращено:StoryObj<typeof ReturnNote>={name:'Комментарий «на доработку»',render:a=><ReturnNote {...a}/>,args:{children:'«Давай другое фото»'}};

export const КемДействую:StoryObj<typeof ActingAv>={name:'Аватар «кем действую»',render:a=><Stack row gap={3}><ActingAv {...a}/><ActingAv p={{id:'pair',kind:'couple',name:'Mia и Tom'}}/><ActingAv p={{id:'pair',kind:'couple',name:'Mia и Tom'}} size="xs"/></Stack>,
 parameters:{docs:{description:{story:'На каждом месте, откуда пишут («Что нового», ответ, сообщение, новая тема): фото профиля, от имени которого действуешь, а у пары без фото — оба инициала на плашке пары. Выбора «от кого» нигде нет (правило владельца): решает «Действовать как» в доке.'}}},
 args:{p:{id:'mia',kind:'person',name:'Mia'},size:'sm'},argTypes:{p:{control:false},size:{control:'inline-radio',options:['xs','sm','']}}};
