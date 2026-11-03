import type {Meta,StoryObj} from '@storybook/react-vite';
import {fn} from 'storybook/test';
import {AtSign,Calendar,CalendarClock,CalendarX,Check,Heart,LockOpen,MessageCircle,Shield,ShieldAlert,Users,X} from 'lucide-react';
import {Answer,Av,Btn,Chips,NoteDecision,NoteEvent,NoteNews,NoteResult,NoteSafety,NoteSummary,PersonLine,Pill,SafetyDecision,Actions,Stack} from './index';

/** The notification center's six card templates (docs/notifications.md «Модель»): every inbox row and every «Нужно
 * решить» item is one of them, picked by the catalog's `card`. */
const LONG='Александра-Мария Константинопольская-Верещагина';
const meta={title:'Домен/Уведомления',component:NoteNews,tags:['autodocs'],
 parameters:{docs:{description:{component:'Шесть шаблонов карточек центра уведомлений. Каталог (`contracts/notifications.mjs`) выбирает шаблон по полю `card`: '
  +'**news** — новость; **decision** — «Нужно решить» с кнопками; **result** — чем закончилось, без кнопок; **safety** — безопасность и модерация (причина, срок, обжалование); '
  +'**event** — событие со сроком (дата и время в поясе события с его названием); **summary** — сводка «Алиса и ещё 3 …». Новый тип выбирает один из них, новую карточку не рисуем.'}}},
 args:{icon:Heart,tone:'l',text:<><b>Mia</b> ставит тебе симпатию</>,time:'5 мин',unread:true,onClick:fn(),av:<Av name="Mia" seed="mia"/>},
 argTypes:{icon:{control:false},av:{control:false},text:{control:false},tag:{control:false}},
 render:a=><div><NoteNews {...a}/></div>,
} satisfies Meta<typeof NoteNews>;
export default meta;
type S=StoryObj<typeof meta>;

export const Новость:S={};
export const НовостьПрочитана:S={name:'Новость: прочитана',args:{unread:false}};
export const НовостьБезАвтора:S={name:'Новость: без лица (иконка на плашке)',args:{av:undefined,icon:Heart,tone:'v',text:'Знакомства открылись — можно смотреть анкеты'}};
export const НовостьДлинноеИмя:S={name:'Новость: длинное имя, «Паре»',args:{av:<Av name={LONG} seed="long"/>,icon:MessageCircle,tone:'g',
 text:<><b>{LONG}</b> отвечает на твою публикацию</>,tag:{text:'Паре',us:true}}};
export const НовостьНедоступна:S={name:'Новость: объект недоступен',args:{icon:AtSign,tone:'v',text:<><b>Kai</b> упоминает тебя в публикации</>,gone:'Публикация больше недоступна',av:<Av name="Kai" seed="kai"/>}};

export const Результат:StoryObj<typeof NoteResult>={name:'Результат',render:()=><div>
 <NoteResult icon={Check} tone="g" av={<Av name="Noa" seed="noa"/>} text={<><b>Noa</b> подтверждает связь — она есть в обоих профилях</>} time="1 ч" unread onClick={fn()}/>
 <NoteResult icon={Users} text="Заявку в сообщество отклонили" time="вчера" outcome="Отклонено" onClick={fn()}/>
 <NoteResult icon={LockOpen} tone="g" av={<Av name={LONG} seed="long"/>} text={<><b>{LONG}</b> открывает тебе приватную часть</>} time="2 дн" outcome="Принято" onClick={fn()}/>
</div>};

export const Безопасность:StoryObj<typeof NoteSafety>={name:'Безопасность и модерация',render:()=><div>
 <NoteSafety icon={Shield} text="Модераторы удалили твою публикацию" reason="Причина: спам" appeal="Подробнее" time="3 ч" unread onClick={fn()}/>
 <NoteSafety icon={Shield} text="Профиль ограничен до 12 ноября" reason="Причина: угрозы и шантаж" appeal="Подробнее" time="вчера" onClick={fn()}/>
 <NoteSafety icon={Shield} text="Профиль ограничен" reason="Причина: правила сообщества" term="Пока модераторы не снимут" time="4 дн" onClick={fn()}/>
 <NoteSafety icon={ShieldAlert} text={<><b>Вход с нового устройства</b>: Android, Лиссабон, Португалия</>} time="10 мин" unread onClick={fn()}/>
</div>};

export const Событие:StoryObj<typeof NoteEvent>={name:'Событие со сроком',render:()=><div>
 <NoteEvent icon={CalendarClock} tone="v" day="14" month="ноя" title="Вечер верёвки для новичков" when="14 ноя, 19:00 · Берлин (UTC+1)" text="В событии изменились детали" time="20 мин" unread onClick={fn()}/>
 <NoteEvent icon={CalendarX} tone="l" day="21" month="ноя" title="Очень длинное название события, которое не помещается в одну строку на телефоне" when="21 ноя, 22:30 · Тбилиси (UTC+4)" text="Событие отменено" time="2 ч" onClick={fn()}/>
 <NoteEvent icon={Calendar} tone="v" text="Новое объявление в событии" gone="Событие больше недоступно" time="3 дн" onClick={fn()}/>
 {/* The longest short months: the badge sits on the tile's top corner, the month under the day stays whole at 360. */}
 <NoteEvent icon={CalendarClock} tone="v" day="30" month="сент" title="Сентябрьская встреча" when="30 сент, 19:00 · Москва (UTC+3)" text="Скоро событие" time="1 ч" onClick={fn()}/>
 <NoteEvent icon={CalendarClock} tone="v" day="28" month="февр" title="Встреча в феврале" when="28 февр, 18:00 · Берлин (UTC+1)" text="В событии изменились детали" time="2 ч" onClick={fn()}/>
</div>};

export const Сводка:StoryObj<typeof NoteSummary>={name:'Сводка',render:()=><div>
 <NoteSummary icon={Heart} tone="l" avs={[<Av key="1" name="Алиса" seed="a"/>,<Av key="2" name="Kai" seed="k"/>,<Av key="3" name="Noa" seed="n"/>]} text={<><b>Алиса и ещё 3</b> ставят лайк твоей публикации</>} time="5 мин" unread onClick={fn()}/>
 <NoteSummary icon={MessageCircle} tone="g" avs={[<Av key="1" name={LONG} seed="l"/>,<Av key="2" name="Mia" seed="m"/>]} text={<><b>{LONG} и ещё 1</b> отвечают на твою публикацию</>} time="1 ч" onClick={fn()}/>
 <NoteSummary icon={Check} tone="g" avs={[]} text="Одобрено файлов: 6 · ×2" time="вчера" onClick={fn()}/>
</div>};

const person=(name:string,seed:string,sub='5 мин')=><PersonLine av={<Av name={name} seed={seed}/>} label={name} onOpen={fn()} name={<>{name}, 31</>} sub={sub}/>;
const two=<><Btn size="md">Одобрить</Btn><Btn size="md" kind="soft">Отклонить</Btn></>;
export const НужноРешить:StoryObj<typeof NoteDecision>={name:'Нужно решить',render:()=><Stack gap={3}>
 <NoteDecision person={person('Kira','kira')} action="Подаёт заявку в сообщество" object="Узлы и разговоры" objectIcon={Users} onOpen={fn()} openLabel="Открыть запрос" actions={two}>
  <Answer q="Почему вам интересно?">Хочу научиться безопасно, читала правила.</Answer>
 </NoteDecision>
 <NoteDecision person={person(LONG,'long','2 ч')} action="Подаёт заявку на событие" object="Вечер верёвки для новичков · 14 ноя, 19:00 · Берлин (UTC+1)" objectIcon={Calendar} onOpen={fn()} actions={two}>
  <Answer q="Есть ли опыт?">Немного, пару мастер-классов.</Answer><Answer>Приду с партнёром.</Answer>
 </NoteDecision>
 <NoteDecision person={person('Mia','mia')} action="Просит открыть твою приватную часть" onOpen={fn()} actions={<><Btn size="md">Посмотреть</Btn><Btn size="md" kind="soft">Отклонить</Btn></>}>
  <Chips><Pill>Описание</Pill><Pill>Фото</Pill></Chips>
 </NoteDecision>
 <NoteDecision person={person('Ann и Leo','pair','вчера')} action={<><b>Ann</b> предлагает опубликовать от пары</>} object="Публикация «Наши выходные»" onOpen={fn()} actions={<Btn size="md">Посмотреть</Btn>}/>
 <NoteDecision person={person('Noa','noa','3 дн')} action="Подаёт заявку на событие" object="Встреча в парке" objectIcon={Calendar} gone="Событие больше недоступно" actions={two}/>
</Stack>};

export const РешениеМодераторов:StoryObj<typeof SafetyDecision>={name:'Решение модераторов (открытая карточка)',render:()=><Stack gap={3}>
 <SafetyDecision icon={Shield} title="Профиль ограничен до 12 ноября 2026" facts={[['Причина','спам'],['Срок','До 12 ноября 2026'],
  ['Что это значит','Пока нельзя писать новым людям, ставить симпатии, просить доступ и предлагать связи.'],['Когда','вчера']]}>
  <Actions stack><Btn>Обжаловать</Btn><Btn kind="ghost">Все уведомления</Btn></Actions>
 </SafetyDecision>
 <SafetyDecision icon={Shield} tone="g" title="Жалоба рассмотрена. Спасибо, что сообщаешь" facts={[['Итог','Нарушений не нашли'],['Когда','2 ч']]}/>
 <SafetyDecision icon={X} tone="" title="Апелляция отклонена — решение остаётся" facts={[['Что','Публикация'],['Обжалование','Отклонено — решение осталось']]}/>
</Stack>};
