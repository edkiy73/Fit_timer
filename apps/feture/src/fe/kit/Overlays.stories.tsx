import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {Ask,Btn,Card,Row,Sheet} from './index';
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
