import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {fn} from 'storybook/test';
import {Bell,Bookmark,Calendar,CalendarCheck,Check,CircleCheck,Clock,Ellipsis,Eye,FileText,MapPin,Settings,Share,TriangleAlert,Video,X} from 'lucide-react';
import {Actions,Announcement,Btn,CoverBar,EventAnswer,EventHero,EventTile,Fact,IconBtn,Note,Pill,Rsvp,Stack,ToggleRow,plate} from './index';

const cover=<div className="plate" style={plate('event-demo')}><span className="pi"><Calendar/></span></div>;

const meta={title:'Домен/События',component:EventTile,tags:['autodocs'],
 parameters:{docs:{description:{component:'Карточка события (`eventCard()`): обложка с датой и местом, вид, название, время и цена. `row` — компактная строка («Ближайшая встреча», отменённые). Без `onClick` — неподвижная картинка карточки (превью мастера создания).'}}},
 args:{cover,day:'28',month:'окт',place:'Берлин, Кройцберг',placeIcon:MapPin,kicker:'Мастер-класс',title:'Вечер шибари для начинающих',time:'19:00',price:'15 €',row:false,onClick:fn()},
 argTypes:{cover:{control:false},placeIcon:{control:false},status:{control:false}},
} satisfies Meta<typeof EventTile>;
export default meta;
type S=StoryObj<typeof meta>;
export const Карточка:S={};
export const СоСтатусом:S={name:'Со статусом',args:{status:<Pill tone="ok">Иду</Pill>}};
export const Онлайн:S={args:{place:'Онлайн',placeIcon:Video,price:'Бесплатно'}};
export const Строка:S={args:{row:true,org:'Kink Kollektiv',status:<Pill tone="bad">Отменено</Pill>}};
export const Превью:S={name:'Превью (без нажатия)',render:({onClick:_o,...a})=><EventTile {...a}/>};

export const Обложка:StoryObj<typeof EventHero>={name:'Обложка события',render:a=><EventHero {...a}/>,
 args:{cover,title:'Вечер шибари для начинающих',tags:[<><MapPin/>Берлин</>,'Мастер-класс'],status:<Pill tone="v">Интересно</Pill>},argTypes:{cover:{control:false},tags:{control:false},status:{control:false}}};
export const ОбложкаЗагрузка:StoryObj<typeof EventHero>={name:'Обложка: загрузка',render:()=><EventHero/>};

export const ШапкаНаОбложке:StoryObj<typeof CoverBar>={name:'Шапка поверх обложки',render:a=><div className="k-demo-dark"><CoverBar {...a}>
 <IconBtn icon={Bookmark} kind="glass" label="Сохранить"/><IconBtn icon={Share} kind="glass" label="Поделиться"/><IconBtn icon={Ellipsis} kind="glass" label="Ещё"/></CoverBar></div>,
 args:{title:'Вечер шибари',onBack:fn()}};

export const Ответ:StoryObj<typeof Rsvp<'interested'|'going'|'not_going'>>={name:'Ответ «Интересно / Иду / Не иду»',
 render:a=>{const [v,setV]=useState<'interested'|'going'|'not_going'|null>(a.value??null);return <Rsvp<'interested'|'going'|'not_going'> {...a} value={v} onChange={x=>setV(v===x?null:x)}/>;},
 args:{label:'Твой ответ',value:null,couple:false,disabled:false,onChange:()=>{},
  options:[['interested','Интересно',Eye,'interested'],['going','Иду',Check,'going'],['not_going','Не иду',X,'not']]},
 argTypes:{value:{control:'inline-radio',options:[null,'interested','going','not_going']},options:{control:false}}};
export const ОтветПары:StoryObj<typeof Rsvp<'interested'|'going'|'not_going'>>={name:'Ответ пары (выбран «Идём»)',render:a=><Rsvp<'interested'|'going'|'not_going'> {...a}/>,
 args:{label:'Ваш ответ',value:'going',couple:true,onChange:()=>{},options:[['interested','Нам интересно',Eye,'interested'],['going','Идём',Check,'going'],['not_going','Не идём',X,'not']]}};

export const Объявление:StoryObj<typeof Announcement>={name:'Объявление организатора',render:a=><Stack gap={0}><Announcement {...a}/><Announcement icon={Bell} body="Адрес пришлём за день." meta="авто · вчера"/></Stack>,
 args:{icon:Bell,body:'Начинаем на 15 минут позже.',meta:'2 ч назад'},argTypes:{icon:{control:false}}};

const OPTS=[['interested','Интересно',Eye,'interested'],['going','Иду',Check,'going'],['not_going','Не иду',X,'not']] as const;
const OPTS_US=[['interested','Нам интересно',Eye,'interested'],['going','Идём вдвоём',Check,'going'],['not_going','Не идём',X,'not']] as const;
type A='interested'|'going'|'not_going';
/** The event page's «участие» block in every state: the same card, only what is inside changes. */
export const Участие:StoryObj<typeof EventAnswer>={name:'Участие: все состояния',parameters:{docs:{description:{story:'`EventAnswer` — заголовок (вопрос или роль) с маленьким действием справа, строка состояния (заявка, отмена, прошло, проверка; тона как у `StatusCard`, действие под текстом), выбор (`Rsvp`) или кнопки (`Actions`), и нижняя строка, которая относится к ответу (переключатель «Показывать меня в списке»). Только состояние — карточка сама становится строкой состояния, без коробки в коробке.'}}},
 render:()=>{const [v,setV]=useState<A|null>('going');const [show,setShow]=useState(true);
  return <Stack gap={3}>
   <EventAnswer title="Пойдёшь?"><Rsvp<A> label="Твой ответ" value={null} onChange={()=>{}} options={OPTS}/></EventAnswer>
   <EventAnswer title="Пойдёшь?" aside={v?<Btn kind="text" auto onClick={()=>setV(null)}>Снять ответ</Btn>:null}
    foot={v==='going'||v==='interested'?<ToggleRow title="Показывать меня в списке" sub="Организатор видит всегда" on={show} onClick={()=>setShow(!show)}/>:undefined}>
    <Rsvp<A> label="Твой ответ" value={v} onChange={x=>setV(v===x?null:x)} options={OPTS}/></EventAnswer>
   <EventAnswer title="Пойдёте вдвоём?" aside={<Pill tone="wait" icon={Clock}>Ждёт партнёра</Pill>}><Rsvp<A> label="Ваш ответ" value="interested" couple onChange={()=>{}} options={OPTS_US}/></EventAnswer>
   <EventAnswer title="Участие по заявке" status={{icon:FileText,title:'Нужна заявка',sub:'Организатор сам выбирает участников. Адрес и детали откроются после одобрения.'}}/>
   <EventAnswer title="Участие по заявке" status={{tone:'wait',icon:Clock,title:'Заявка на рассмотрении',sub:'Ответ организатора придёт в уведомления.',action:<Btn kind="soft" size="sm" auto fit>Отозвать</Btn>}}/>
   <EventAnswer title="Пойдёшь?" status={{tone:'ok',icon:CircleCheck,title:'Заявка одобрена',sub:'Адрес и детали открыты.'}}><Rsvp<A> label="Твой ответ" value={null} onChange={()=>{}} options={OPTS}/></EventAnswer>
   <EventAnswer title="Участие по заявке" status={{tone:'bad',icon:X,title:'Заявка не одобрена',sub:'Организатор выбрал других участников.'}}/>
   <EventAnswer status={{tone:'bad',icon:TriangleAlert,title:'Событие отменено',sub:'Ведущий заболел, перенесём на декабрь.'}}/>
   <EventAnswer status={{icon:CalendarCheck,title:'Событие прошло',sub:'Твой ответ был «Иду»'}}/>
   <EventAnswer title="Ты организатор" foot={<Note>Адрес видят только те, кто идёт</Note>}><Actions><Btn kind="soft" icon={Settings}>Управление</Btn></Actions></EventAnswer>
  </Stack>;}};

export const Условия:StoryObj<typeof Fact>={name:'Строка списка (Fact)',render:a=><Stack gap={1}><Fact {...a}/><Fact icon={Check}>Без фото без согласия</Fact><Fact icon={MapPin} tone="v">Вход со двора</Fact></Stack>,
 args:{icon:Check,tone:'ok',children:'Только 18+'},argTypes:{icon:{control:false},tone:{control:'inline-radio',options:[undefined,'ok','v','a']}}};
