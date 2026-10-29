import type {Meta,StoryObj} from '@storybook/react-vite';
import {useMemo,useState} from 'react';
import {createMemoryRouter,RouterProvider} from 'react-router';
import {Ask,Btn,Card,Row,SearchInput,Sheet,TextArea,useLeaveGuard} from './index';
import {useToast} from '../toast';

const meta={title:'Окна/Лист',component:Sheet,tags:['autodocs'],
 parameters:{docs:{description:{component:'Лист снизу — выбор или действие без ухода с экрана. Esc, ✕ и затемнение закрывают его. `full` — высокий лист со списком. Подтверждение перед необратимым — `Ask`. Короткое сообщение о результате — `toast` с «Отменить».'}}},
 args:{title:'Публикация',sub:'Строка под заголовком',full:false,onClose:()=>{},children:null},
} satisfies Meta<typeof Sheet>;
export default meta;
type S=StoryObj<typeof meta>;
export const Лист:S={render:a=>{const [o,setO]=useState(true);return <>{!o&&<Btn kind="soft" onClick={()=>setO(true)}>Открыть лист</Btn>}
 {o&&<Sheet {...a} onClose={()=>setO(false)} foot={<Btn onClick={()=>setO(false)}>Готово</Btn>}><Card list><Row title="Редактировать" onClick={()=>setO(false)}/><Row title="Удалить" danger onClick={()=>setO(false)}/></Card></Sheet>}</>;}};
export const Подтверждение:S={render:()=>{const [o,setO]=useState(true);return <>{!o&&<Btn kind="soft" onClick={()=>setO(true)}>Открыть подтверждение</Btn>}
 {o&&<Ask danger title="Удалить публикацию?" text="Её нельзя будет вернуть." ok="Удалить" onOk={()=>setO(false)} onCancel={()=>setO(false)}/>}</>;}};
export const Уведомление:S={render:()=>{const toast=useToast();return <Btn kind="soft" onClick={()=>toast('Публикация скрыта',{type:'ok',action:{label:'Отменить',fn:()=>{}}})}>Показать уведомление</Btn>;}};
export const ЛистСПоиском:S={name:'Лист с поиском',render:a=>{const [o,setO]=useState(true);return <>{!o&&<Btn kind="soft" onClick={()=>setO(true)}>Открыть</Btn>}
 {o&&<Sheet {...a} title="Люди на фото" full search={<SearchInput label="Найти человека"/>} onClose={()=>setO(false)} foot={<Btn onClick={()=>setO(false)}>Готово</Btn>}><Card list><Row title="Mia" onClick={()=>{}}/><Row title="Kai" onClick={()=>{}}/></Card></Sheet>}</>;}};
export const НесохранённыйВыбор:S={name:'Лист с несохранённым выбором (dirty)',render:a=>{const [o,setO]=useState(true);const [n,setN]=useState(1);return <>{!o&&<Btn kind="soft" onClick={()=>setO(true)}>Открыть</Btn>}
 {o&&<Sheet {...a} title="Интересы" dirty={n>0} onClose={()=>setO(false)} foot={<Btn onClick={()=>setO(false)}>{`Готово · ${n}`}</Btn>}><Card list><Row title="Выбрать ещё" onClick={()=>setN(n+1)}/><Row title="Сбросить" onClick={()=>setN(0)}/></Card></Sheet>}</>;}};
export const ТриОтвета:S={name:'Подтверждение с тремя ответами',render:()=>{const [o,setO]=useState(true);return <>{!o&&<Btn kind="soft" onClick={()=>setO(true)}>Открыть</Btn>}
 {o&&<Ask title="Сохранить черновик?" text="Иначе текст пропадёт." ok="Сохранить черновик" alt={{label:'Не сохранять',onClick:()=>setO(false),danger:true}} onOk={()=>setO(false)} onCancel={()=>setO(false)}/>}</>;}};

function GuardedForm(){
 const [text,setText]=useState('');const guard=useLeaveGuard(!!text.trim());
 return <Card form><p>Напиши что-нибудь и нажми «Уйти»: экран спросит, выйти ли без сохранения (так же — вкладки приложения, «Назад» в браузере).</p>
  <TextArea rows={3} value={text} onChange={e=>setText(e.target.value)} aria-label="Текст"/>
  <Btn kind="soft" onClick={()=>guard.pass(()=>setText(''))}>Сохранить</Btn>{guard.node}</Card>;
}
export const УходИзФормы:S={name:'Уход из изменённой формы (useLeaveGuard)',parameters:{docs:{description:{story:'Для экрана с формой, не для листа (у листа есть `dirty`). Пока в форме есть несохранённое, любой уход — своя кнопка назад, вкладки, «Назад» браузера — спрашивает «Выйти без сохранения?» (Остаться / Выйти). После сохранения уход делается через `guard.pass(...)`, чтобы не спрашивать.'}}},
 render:()=>{const router=useMemo(()=>createMemoryRouter([{path:'/',element:<GuardedForm/>},{path:'/away',element:<p>Другой экран</p>}]),[]);return <><RouterProvider router={router}/><Btn kind="text" onClick={()=>void router.navigate('/away')}>Уйти</Btn></>;}};
