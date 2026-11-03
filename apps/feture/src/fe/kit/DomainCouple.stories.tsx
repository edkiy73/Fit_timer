import type {Meta,StoryObj} from '@storybook/react-vite';
import {fn} from 'storybook/test';
import {Pencil} from 'lucide-react';
import {Actions,ActingAv,ActorCard,ActorCards,ApprovalSheet,Av,Btn,EventTile,KeyValues,Note,PersonLine,ReturnNote,ReviewPost,Stack} from './index';

const meta={title:'Домен/Пара',component:ActorCard,tags:['autodocs'],
 parameters:{docs:{description:{component:'«Действовать как» (док «Я» при активной паре): карточка профиля выбирает его, кнопка справа открывает профиль. `dot` — что-то ждёт решения. Карточки — внутри `ActorCards` (подпись снизу). Для согласований пары — один `ApprovalSheet` на все 19 видов: кто предлагает и версия, кого или что касается, что меняется (до → после), содержимое как уйдёт, что будет дальше, пара кнопок вида; закрытое — карточка результата без кнопок решения. Внутри: `ReviewMeta`, `ReviewPost`, `ApprovalChanges`, `ReturnNote` (комментарий к отказу).'}}},
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

type AS=StoryObj<typeof ApprovalSheet>;
const mia=<PersonLine av={<Av name="Mia" seed="mia" size="sm"/>} name="Mia" sub="Организатор · @mia"/>;
export const СогласованиеПост:AS={name:'Согласование: публикация (весь текст и аудитория)',render:a=><ApprovalSheet {...a}/>,
 args:{title:'Публикация от пары',sub:'Mia и Tom',by:'Предлагает Tom',version:'Версия 2',onClose:fn(),consequence:'Пост выйдет от имени пары и его увидит выбранная аудитория.',
  foot:<Actions stack><Btn>Разрешить публикацию</Btn><Btn kind="soft">Не публиковать</Btn></Actions>,
  children:<ReviewPost title="Вечер настолок" meta="Кто увидит: Подписчики · Файлов: 2"><p>Собираемся в субботу, берите любимые игры. Начинаем в семь, заканчиваем, когда надоест.</p></ReviewPost>}};
export const СогласованиеЗаявка:AS={name:'Согласование: заявка на событие (ответы организатору)',render:a=><ApprovalSheet {...a}/>,
 args:{title:'Заявка на событие',sub:'Mia и Tom',by:'Предлагает Tom',onClose:fn(),subject:mia,
  consequence:'Заявку получит организатор. Твоё согласие — ещё не допуск: решает организатор.',foot:<Actions stack><Btn>Отправить заявку</Btn><Btn kind="soft">Не отправлять</Btn></Actions>,
  children:<><EventTile row cover={<div/>} day="12" month="нояб" place="Берлин" time="19:00 · Берлин" title="Вечер знакомств"/>
   <KeyValues rows={[['Почему хотите прийти?','Хотим познакомиться с людьми рядом'],['Записка организатору','Мы спокойные, впервые']]}/></>}};
export const СогласованиеКлуб:AS={name:'Согласование: вступление в клуб (правила, вопрос, ответ)',render:a=><ApprovalSheet {...a}/>,
 args:{title:'Вступление в сообщество',sub:'Mia и Tom',by:'Предлагает Tom',onClose:fn(),
  subject:<PersonLine av={<Av name="Узлы" seed="club" size="sm"/>} name="Узлы и разговоры" sub="Ведущие · @knots"/>,
  consequence:'Ответ и заявку получат ведущие. Твоё согласие — ещё не вступление: решают ведущие.',foot:<Actions stack><Btn>Отправить заявку</Btn><Btn kind="soft">Не вступать</Btn></Actions>,
  children:<><ReviewPost title="Узлы и разговоры"><p>Встречи и разговоры о верёвке для новичков.</p></ReviewPost>
   <KeyValues rows={[['Правила','Уважать границы · Без фото без согласия'],['Вопрос ведущих','Что вас привело?'],['Ответ, который получат ведущие','Хотим учиться вместе'],['Сообщество','Закрытое, по заявкам']]}/></>}};
export const СогласованиеПрофиль:AS={name:'Согласование: профиль (до → после)',render:a=><ApprovalSheet {...a}/>,
 args:{title:'Профиль пары',by:'Предлагает Tom',onClose:fn(),consequence:'Изменения сразу увидят все, кто смотрит профиль пары.',
  changes:[{key:'bio',label:'О паре',before:'Мы из Берлина',after:'Мы из Берлина. Любим настолки и долгие прогулки'},{key:'cityId',label:'Город',before:'Берлин',after:'Гамбург'}],
  foot:<Actions stack><Btn>Принять изменения</Btn><Btn kind="soft">Отклонить изменения</Btn></Actions>}};
export const СогласованиеДоступ:AS={name:'Согласование: доступ (что и на какой срок)',render:a=><ApprovalSheet {...a}/>,
 args:{title:'Доступ к приватной части',by:'Предлагает Tom',onClose:fn(),subject:<PersonLine av={<Av name="Mia" seed="mia" size="sm"/>} name="Mia" sub="Кому · @mia"/>,
  consequence:'Откроется только то, что отмечено, на выбранный срок. Отозвать можно в любой момент.',foot:<Actions stack><Btn>Открыть доступ</Btn><Btn kind="soft">Не открывать</Btn></Actions>,
  children:<KeyValues rows={[['Что откроется','Текст, Фото'],['Срок','7 дней · до 10 ноября']]}/>}};
export const Результат:AS={name:'Результат: отклонено (без кнопок решения)',render:a=><ApprovalSheet {...a}/>,
 args:{title:'Публикация от пары',sub:'Mia и Tom',state:'closed',by:'Предлагаешь ты',onClose:fn(),
  status:{tone:'warn',title:'Отклонено',text:'Mia · 3 ноября. Ничего не изменилось.',comment:'Давай без названия фестиваля'},
  foot:<Btn icon={Pencil}>Изменить и отправить снова</Btn>,children:<ReviewPost title="Вильнюс"><p>Съездили на фестиваль…</p></ReviewPost>}};
export const РезультатНедоступно:AS={name:'Результат: срок истёк, объект недоступен',render:a=><ApprovalSheet {...a}/>,
 args:{title:'Заявка на событие',state:'closed',by:'Предлагает Tom',onClose:fn(),status:{tone:'plain',title:'Срок истёк',text:'17 ноября. Ответа не было 14 дней — ничего не изменилось.'},
  objectNote:'Этого больше нет в доступе — решение уже ничего не изменит.'}};
export const Загрузка:AS={name:'Загрузка',render:a=><ApprovalSheet {...a}/>,args:{title:'Согласование',state:'loading',onClose:fn()}};
export const Ошибка:AS={name:'Ошибка с повтором',render:a=><ApprovalSheet {...a}/>,args:{title:'Согласование',state:'error',error:'Нет связи. Проверь интернет.',onRetry:fn(),retryLabel:'Повторить',onClose:fn()}};
export const Комментарий:StoryObj<typeof ReturnNote>={name:'Комментарий к отказу',render:a=><ReturnNote {...a}/>,args:{children:'«Давай другое фото»'}};
export const Следствие:StoryObj<typeof Note>={name:'Что будет дальше (строка под содержимым)',render:()=><Note>Заявку получит организатор. Твоё согласие — ещё не допуск.</Note>};

export const КемДействую:StoryObj<typeof ActingAv>={name:'Аватар «кем действую»',render:a=><Stack row gap={3}><ActingAv {...a}/><ActingAv p={{id:'pair',kind:'couple',name:'Mia и Tom'}}/><ActingAv p={{id:'pair',kind:'couple',name:'Mia и Tom'}} size="xs"/></Stack>,
 parameters:{docs:{description:{story:'На каждом месте, откуда пишут («Что нового», ответ, сообщение, новая тема): фото профиля, от имени которого действуешь, а у пары без фото — оба инициала на плашке пары. Выбора «от кого» нигде нет (правило владельца): решает «Действовать как» в доке.'}}},
 args:{p:{id:'mia',kind:'person',name:'Mia'},size:'sm'},argTypes:{p:{control:false},size:{control:'inline-radio',options:['xs','sm','']}}};
