import type {Meta,StoryObj} from '@storybook/react-vite';
import {useEffect,useState} from 'react';
import {Btn,CaptureFrame} from './index';
import {Uploader,type SendPhoto} from './Uploader';
import {CropSheet} from './Crop';

/** A sample photo drawn on a canvas, so the stories need no network. */
async function sample(name:string,w=1200,h=800):Promise<File>{
 const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d')!;
 const gr=g.createLinearGradient(0,0,w,h);gr.addColorStop(0,'#c33');gr.addColorStop(1,'#36c');g.fillStyle=gr;g.fillRect(0,0,w,h);
 g.fillStyle='#fff';g.font='700 96px sans-serif';g.fillText(name,60,140);
 const b=await new Promise<Blob>(r=>c.toBlob(x=>r(x!),'image/png'));return new File([b],name+'.png',{type:'image/png'});
}
/** Pretends to upload: progress over a second; `fail` makes every second photo fail once. */
const fakeSend=(fail:boolean):SendPhoto=>{let n=0;return (_b,on)=>new Promise((res,rej)=>{const bad=fail&&n++%2===1;let p=0;
 const t=setInterval(()=>{p+=.2;on(Math.min(1,p));if(p>=1){clearInterval(t);bad?rej(new Error('Нет связи — файл не загружен')):res('asset-'+Math.random().toString(36).slice(2,8));}},200);});};

const meta={title:'Медиа/Загрузка фото',component:Uploader,tags:['autodocs'],
 parameters:{docs:{description:{component:'Лист загрузки: формат (если месту разрешено несколько), превью, состояние и прогресс по каждому фото, «Кадрировать», «Повторить», «Убрать», «Добавить ещё», «Готово · N». Фото сжимаются и очищаются от метаданных прямо на устройстве; уходят на сервер по «Готово». Отправку делает экран — `useSendPhoto(purpose)`.\n\nФорматы по местам: пост — 4:5 / 1:1 / как есть; фото профиля — 4:5; обложка события и сообщества — 16:9; фото события — как есть / 4:5 / 1:1 / 16:9.'}}},
 args:{files:[],aspects:['4:5','1:1','orig'],max:6,send:fakeSend(false),onDone:()=>{},onClose:()=>{}},
 argTypes:{aspects:{control:'check',options:['4:5','1:1','16:9','orig']},files:{control:false},send:{control:false}},
} satisfies Meta<typeof Uploader>;
export default meta;
type S=StoryObj<typeof meta>;
const Live=(a:S['args']&{fail?:boolean})=>{const [files,setFiles]=useState<File[]|null>(null);const [open,setOpen]=useState(true);
 useEffect(()=>{void Promise.all([sample('Первое'),sample('Второе',800,1200)]).then(setFiles);},[]);
 if(!files)return <span/>;if(!open)return <Btn kind="soft" onClick={()=>setOpen(true)}>Открыть снова</Btn>;
 return <Uploader {...a!} max={a?.max??6} files={files} send={fakeSend(!!a?.fail)} onDone={()=>setOpen(false)} onClose={()=>setOpen(false)}/>;};
export const Пост:S={name:'Пост (4:5 / 1:1 / как есть)',render:a=><Live {...a}/>};
export const ФотоПрофиля:S={name:'Фото профиля (только 4:5)',render:a=><Live {...a} aspects={['4:5']} max={6}/>};
export const Обложка:S={name:'Обложка (16:9, одно фото)',render:a=><Live {...a} aspects={['16:9']} max={1}/>};
export const СОшибкой:S={name:'Ошибка отправки и «Повторить»',render:a=><Live {...a} fail/>};

export const Кадрирование:StoryObj<typeof CropSheet>={name:'Кадрирование',render:a=>{const [src,setSrc]=useState('');useEffect(()=>{void sample('Кадр').then(f=>setSrc(URL.createObjectURL(f)));},[]);
 return src?<CropSheet {...a} src={src}/>:<span/>;},args:{aspect:'4:5',onApply:()=>{},onClose:()=>{}},argTypes:{aspect:{control:'inline-radio',options:['4:5','1:1','16:9']}}};

/** CaptureFrame: the viewfinder of a verification shot — face oval (selfie with a gesture) or document frame; with `src`
 * the taken shot, shown whole (documents are never cropped). */
type CF=StoryObj<typeof CaptureFrame>;
const cfArgs={argTypes:{shape:{control:'inline-radio' as const,options:['face','document']},src:{control:false as const}}};
export const КадрСелфи:CF={name:'Кадр: селфи',...cfArgs,args:{shape:'face',hint:'Лицо и жест в кадре'},render:a=><CaptureFrame {...a}/>};
export const КадрДокумент:CF={name:'Кадр: документ',...cfArgs,args:{shape:'document',hint:'Помести разворот паспорта или права в рамку'},render:a=><CaptureFrame {...a}/>};
export const КадрСнимок:CF={name:'Кадр: снятый документ',...cfArgs,args:{shape:'document',alt:'Снимок документа'},render:a=>{const [src,setSrc]=useState('');
 useEffect(()=>{void sample('Документ',1400,1000).then(f=>setSrc(URL.createObjectURL(f)));},[]);return <CaptureFrame {...a} src={src||null}/>;}};
