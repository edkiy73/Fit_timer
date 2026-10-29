import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {fn} from 'storybook/test';
import {Bell,Camera,Eye,Hand,KeyRound,Link2,Lock,Trash2,Users,X} from 'lucide-react';
import {AddCard,Av,Btn,Card,Group,IconBtn,LoadMore,Row,SelectRow,StatTiles,ToggleRow} from './index';

const meta={title:'Списки/Строка',component:Row,tags:['autodocs'],
 parameters:{docs:{description:{component:'Пункт настроек, меню, списка людей — всегда внутри `<Card list>`. Слева иконка (`icon`, `tone`) или аватар (`av`), справа значение, бейдж и стрелка. Опасное действие — `danger` (без стрелки).'}}},
 args:{title:'Кто видит',sub:'Все участники',icon:KeyRound,val:'',badge:undefined,danger:false,noChev:false,disabled:false,onClick:fn()},
 argTypes:{icon:{control:false},av:{control:false},tone:{control:'inline-radio',options:[undefined,'v','g','l','a']}},
 decorators:[S=><Card list><S/></Card>],
} satisfies Meta<typeof Row>;
export default meta;
type S=StoryObj<typeof meta>;
export const Обычная:S={};
export const СЗначением:S={name:'Со значением',args:{title:'Язык',sub:undefined,val:'Русский'}};
export const СБейджем:S={name:'С бейджем',args:{title:'Запросы',sub:'Ждут ответа',icon:Bell,badge:3}};
export const САватаром:S={name:'С аватаром',render:({icon:_i,...a})=><Row {...a}/>,args:{av:<Av name="Mia" seed="mia" size="sm"/>,title:'Mia, 29',sub:'Берлин'}};
export const Опасная:S={args:{title:'Удалить аккаунт',sub:undefined,icon:Trash2,danger:true}};
export const Выключена:S={args:{disabled:true}};
export const Список:S={name:'Несколько строк',render:()=><><Row icon={Users} title="Подписчики" val="42" onClick={()=>{}}/><Row icon={Bell} title="Уведомления" badge={3} onClick={()=>{}}/><Row icon={Trash2} title="Удалить" danger onClick={()=>{}}/></>};

export const Переключатель:StoryObj<typeof ToggleRow>={name:'Строка с переключателем',render:a=>{const [on,setOn]=useState(a.on);return <ToggleRow {...a} on={on} onClick={()=>setOn(v=>!v)}/>;},
 args:{title:'Показать в ленте',sub:'Увидят в ленте и в профиле',on:true,disabled:false}};
export const Выбор:StoryObj<typeof SelectRow>={name:'Строка выбора',render:a=>{const [v,setV]=useState('all');return <SelectRow {...a} value={v} onChange={setV}/>;},
 args:{label:'Кто может просить доступ',options:[['all','Все'],['fol','Подписчики'],['none','Никто']],value:'all',onChange:()=>{}}};
export const СДействиемСправа:S={name:'С действием справа',render:()=><><Row av={<Av name="Kai" seed="kai" size="sm"/>} title="Kai" sub="@kai_slow" onClick={()=>{}} end={<Btn size="sm" fit>Подписаться</Btn>}/>
 <Row icon={Users} title="шибари" onClick={()=>{}} end={<IconBtn icon={X} kind="ghost" size="sm" label="Убрать"/>}/></>};
export const ВыборСИконкой:StoryObj<typeof SelectRow>={name:'Строка выбора с иконкой',render:a=>{const [v,setV]=useState('all');return <SelectRow {...a} icon={Eye} value={v} onChange={setV}/>;},
 args:{label:'Кто видит',options:[['all','Все'],['fol','Подписчики']],value:'all',onChange:()=>{}}};
export const ТолькоПоказ:S={name:'Только показ (без нажатия)',render:()=><><Row icon={KeyRound} title="ср, 28 октября" sub="19:00–21:00 местное время"/><Row icon={Users} title="https://очень-длинная-ссылка.example/путь/к/странице" wrap/></>};
export const Текстом:S={name:'Шаг инструкции (body)',render:()=><><Row icon={Hand} tone="v" body="Покажи жест рядом с лицом"/><Row icon={Lock} title="Где хранится" sub="Удаляем после проверки"/><Row sub="Пока пусто"/></>};
export const Раскрытие:S={name:'Раскрывающая строка (expanded, extra)',render:()=>{const [o,setO]=useState(false);return <Row title="Твои данные" expanded={o} onClick={()=>setO(!o)} extra={o?undefined:<span className="pe-sums"><span className="pe-sum"><b>Рост</b> 170</span></span>}/>;}};

/** The one «add» card of an empty section: same size everywhere; a Group holds it directly (no Card). */
export const Добавить:StoryObj<typeof AddCard>={name:'Пустой блок: карточка «Добавить» (AddCard)',decorators:[S=><S/>],
 render:a=><Group title="Фото профиля"><AddCard {...a}/></Group>,args:{icon:Camera,title:'Добавить фото',sub:'Первое фото станет главным',onClick:fn()}};
export const ДобавитьНесколько:StoryObj<typeof AddCard>={name:'Пустые блоки подряд',decorators:[S=><S/>],
 render:()=><><Group title="Фото профиля"><AddCard icon={Camera} title="Добавить фото" sub="Первое фото станет главным" onClick={()=>{}}/></Group>
  <Group title="Связи"><AddCard icon={Link2} title="Добавить связь" sub="Отношения, практика, наставничество" onClick={()=>{}}/></Group>
  <Group title="Описание"><AddCard icon={Lock} title="Добавить описание" sub="Длинная подсказка переносится на вторую строку, но не дальше — коротко и по делу" onClick={()=>{}}/></Group></>};

export const БесконечнаяЛента:StoryObj<typeof LoadMore>={name:'Подгрузка при прокрутке (LoadMore)',decorators:[S=><S/>],
 parameters:{docs:{description:{story:'После постраничного списка вместо «Показать ещё»: следующая страница запрашивается сама примерно за экран до конца. Пока грузится — три мигающие точки в блоке постоянной высоты; при ошибке — одна строка «Не загрузилось · Повторить»; когда страниц больше нет — ничего.'}}},
 render:a=>{const [n,setN]=useState(8);const [busy,setBusy]=useState(false);
  return <div style={{height:320,overflow:'auto'}}><Card list>{Array.from({length:n},(_,i)=><Row key={i} title={'Строка '+(i+1)}/>)}</Card>
   <LoadMore {...a} more={a.more&&n<40} busy={busy||a.busy} onMore={()=>{setBusy(true);setTimeout(()=>{setN(x=>x+8);setBusy(false);},700);}}/></div>;},
 args:{more:true,busy:false,error:null,onMore:fn()}};
export const ПодгрузкаОшибка:StoryObj<typeof LoadMore>={name:'Подгрузка: ошибка',render:a=><LoadMore {...a}/>,args:{more:true,busy:false,error:new Error('x'),onMore:fn()}};

export const Счётчики:StoryObj<typeof StatTiles>={name:'Счётчики (StatTiles)',render:a=><StatTiles {...a}/>,decorators:[S=><S/>],
 args:{items:[{n:12,label:'участников',onClick:fn()},{n:3,label:'обсуждения',onClick:fn()},{n:2,label:'ждут решения',onClick:fn()}]}};
export const СчётчикиДва:StoryObj<typeof StatTiles>={name:'Счётчики — два',render:a=><StatTiles {...a}/>,decorators:[S=><S/>],
 args:{items:[{n:8,label:'идут',onClick:fn()},{n:5,label:'интересуются',onClick:fn()}]}};
