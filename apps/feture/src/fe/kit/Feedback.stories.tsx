import type {Meta,StoryObj} from '@storybook/react-vite';
import {Clock,Heart,RefreshCw,Sparkles,Users} from 'lucide-react';
import {Alert,Btn,Card,Empty,Row,Skel,Stack} from './index';

const meta={title:'Сообщения/Сообщение',component:Alert,tags:['autodocs'],
 parameters:{docs:{description:{component:'Постоянное сообщение в потоке экрана: `ok`, `info`, `warn`, `err` (ошибку читает экранный диктор). Временное — уведомление (toast). Пустой экран — `Empty`. Загрузка — `Skel`, мягкое мигание, без спиннеров.'}}},
 args:{kind:'info',children:'С фото — после короткой проверки'},argTypes:{kind:{control:'inline-radio',options:['ok','info','warn','err']}},
} satisfies Meta<typeof Alert>;
export default meta;
type S=StoryObj<typeof meta>;
export const Сообщение:S={};
export const Все:S={render:()=><Stack gap={2}><Alert kind="ok">Сохранено</Alert><Alert kind="info">Подсказка по экрану</Alert><Alert kind="warn">Нужно внимание</Alert><Alert kind="err">Не получилось — попробуй ещё раз</Alert></Stack>};
export const Пусто:StoryObj<typeof Empty>={name:'Пустое состояние',render:a=><Empty {...a}><Btn size="sm" auto>Перейти в ленту</Btn></Empty>,args:{icon:Heart,title:'Пока пусто',text:'Здесь появятся сохранённые публикации.'}};
export const Загрузка:StoryObj<typeof Skel>={name:'Скелетон',render:a=><Skel {...a}/>,args:{kind:'list',rows:3},argTypes:{kind:{control:'inline-radio',options:['list','post','card','tiles','hero','cover','line','grid','fill','event']}}};
export const Нейтральное:S={name:'Нейтральное (plain)',args:{kind:'plain',children:'Контакт завершён — переписка только для чтения'}};
export const СДействием:S={name:'С кнопками под текстом (action)',args:{kind:'err',noIcon:true,children:'Сообщество изменили, пока ты редактировал.',action:<Btn kind="text" auto icon={RefreshCw}>Загрузить заново</Btn>}};
export const Вопрос:S={name:'Вопрос на месте (alertdialog)',args:{kind:'warn',noIcon:true,role:'alertdialog',children:'Удалить черновик?',action:<><Btn kind="danger" size="sm" auto>Удалить</Btn><Btn kind="text" size="sm" auto>Отмена</Btn></>}};
export const Нажимаемое:S={name:'Нажимаемое (onClick)',args:{kind:'warn',icon:Clock,children:<><b>Tom предлагает изменение</b>Имя пары · нажми, чтобы ответить</>,onClick:()=>{}}};
export const ПустоКомпактно:StoryObj<typeof Empty>={name:'Пустое: часть экрана или листа (compact)',render:a=><Card><Empty {...a}/></Card>,args:{icon:Heart,title:'Ничего не нашлось',text:'Попробуй другое слово.',compact:true}};
export const ПустоБезТекста:StoryObj<typeof Empty>={name:'Пустое: заголовок и кнопка',render:a=><Empty {...a}><Btn kind="soft">Смотреть события</Btn></Empty>,args:{icon:Heart,title:'Ближайших событий нет'},
 parameters:{docs:{description:{story:'Отступы внутри одни и те же: иконка → заголовок → (строка) → кнопки; кнопка никогда не прилипает к заголовку. Две кнопки — в `Actions`.'}}}};
export const ПустоКрупно:StoryObj<typeof Empty>={name:'Пустое: крупно, сверху, с блоком после',render:a=><Empty {...a}><Btn auto>Изменить фильтры</Btn></Empty>,
 args:{icon:Users,title:'Знакомства выключены',text:'Включи, и тебя увидят те, кто тоже включил.',big:true,top:true,
  after:<Card list className="mt16"><Row icon={Sparkles} title="Интересы" sub="Расскажи о себе" onClick={()=>{}}/></Card>}};
