import type {Meta,StoryObj} from '@storybook/react-vite';
import {useEffect,useState} from 'react';
import {Btn,CaptureFrame,Card,Group,SelectRow} from './index';
import {Uploader,type SendPhoto,type SendVideo} from './Uploader';
import {CropSheet} from './Crop';
import {TrimSheet} from './Trim';

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
 parameters:{docs:{description:{component:'Лист загрузки: формат (если месту разрешено несколько); строка на каждый файл — превью в выбранном формате (1:1 — квадрат, 4:5, «Как есть» — форма самого файла, не больше 80 px), имя и ✕ «Убрать» справа, состояние, прогресс и под текстом в одну строку от его левого края «Обрезать» (видео), «Кадрировать» (если формат не «Как есть»), «Повторить»; затем «Добавить ещё», что добавил экран (`children`: в чате — как смотреть), заметка о приватности (всегда с отступом), кнопка (`doneLabel`, по умолчанию «Готово · N»). Это единственный способ отправить фото или видео — посты, профиль, галерея, чаты. Видео (`sendVideo`) готовится на устройстве при отправке: только выбранный отрезок (до минуты; у длинного видео сначала — первая минута), обрезанный по кадру, не больше 1280 px, сжатый (H.264 ~2,5 Мбит/с + AAC, MP4) — «Готовим видео… 42%» с «Отменить»; обложка — первый кадр готового видео. Исходник — до 10 минут и 2 ГБ, лимиты сервера (минута, 100 МБ) — на готовый файл. Путь: WebCodecs в воркере, иначе запись с холста в реальном времени (MediaRecorder), иначе видео уходит как есть (до минуты и 100 МБ) без обрезки и кадра — с пояснением. Фото сжимаются и очищаются от метаданных прямо на устройстве; уходят на сервер по «Готово». Отправку делает экран — `useSendPhoto(purpose)`.\n\nФорматы по местам: пост — 4:5 / 1:1 / как есть; фото профиля — 4:5; обложка события и сообщества — 16:9; фото события — как есть / 4:5 / 1:1 / 16:9.'}}},
 args:{files:[],aspects:['orig','4:5','1:1'],max:6,send:fakeSend(false),onDone:()=>{},onClose:()=>{}},
 argTypes:{aspects:{control:'check',options:['4:5','1:1','16:9','orig']},files:{control:false},send:{control:false}},
} satisfies Meta<typeof Uploader>;
export default meta;
type S=StoryObj<typeof meta>;
const Live=(a:S['args']&{fail?:boolean})=>{const [files,setFiles]=useState<File[]|null>(null);const [open,setOpen]=useState(true);
 useEffect(()=>{void Promise.all([sample('Первое'),sample('Второе',800,1200)]).then(setFiles);},[]);
 if(!files)return <span/>;if(!open)return <Btn kind="soft" onClick={()=>setOpen(true)}>Открыть снова</Btn>;
 return <Uploader {...a!} max={a?.max??6} files={files} send={fakeSend(!!a?.fail)} onDone={()=>setOpen(false)} onClose={()=>setOpen(false)}/>;};
export const Пост:S={name:'Пост (Свой / 4:5 / 1:1)',render:a=><Live {...a}/>};
export const ФотоПрофиля:S={name:'Фото профиля (только 4:5)',render:a=><Live {...a} aspects={['4:5']} max={6}/>};
export const Обложка:S={name:'Обложка (16:9, одно фото)',render:a=><Live {...a} aspects={['16:9']} max={1}/>};
export const СОшибкой:S={name:'Ошибка отправки и «Повторить»',render:a=><Live {...a} fail/>};

export const Кадрирование:StoryObj<typeof CropSheet>={name:'Кадрирование',render:a=>{const [src,setSrc]=useState('');useEffect(()=>{void sample('Кадр').then(f=>setSrc(URL.createObjectURL(f)));},[]);
 return src?<CropSheet {...a} src={src}/>:<span/>;},args:{aspect:'4:5',onApply:()=>{},onClose:()=>{}},argTypes:{aspect:{control:'inline-radio',options:['orig','4:5','1:1','16:9']}}};
/** Свой формат: рамку тянут за края и углы, фото двигают и масштабируют под ней; рамка видна со всех четырёх сторон. */
export const КадрированиеСвой:StoryObj<typeof CropSheet>={name:'Кадрирование: свой формат',render:a=>{const [src,setSrc]=useState('');useEffect(()=>{void sample('Кадр',1200,800).then(f=>setSrc(URL.createObjectURL(f)));},[]);
 return src?<CropSheet {...a} src={src}/>:<span/>;},args:{aspect:'orig',onApply:()=>{},onClose:()=>{}}};

/** CaptureFrame: the viewfinder of a verification shot — face oval (selfie with a gesture) or document frame; with `src`
 * the taken shot, shown whole (documents are never cropped). */
type CF=StoryObj<typeof CaptureFrame>;
const cfArgs={argTypes:{shape:{control:'inline-radio' as const,options:['face','document']},src:{control:false as const}}};
export const КадрСелфи:CF={name:'Кадр: селфи',...cfArgs,args:{shape:'face',hint:'Лицо и жест в кадре'},render:a=><CaptureFrame {...a}/>};
export const КадрДокумент:CF={name:'Кадр: документ',...cfArgs,args:{shape:'document',hint:'Помести разворот паспорта или права в рамку'},render:a=><CaptureFrame {...a}/>};
export const КадрСнимок:CF={name:'Кадр: снятый документ',...cfArgs,args:{shape:'document',alt:'Снимок документа'},render:a=>{const [src,setSrc]=useState('');
 useEffect(()=>{void sample('Документ',1400,1000).then(f=>setSrc(URL.createObjectURL(f)));},[]);return <CaptureFrame {...a} src={src||null}/>;}};

/** A two-second clip recorded from a canvas (no network). */
async function sampleClip():Promise<File|null>{
 if(typeof MediaRecorder==='undefined')return null;
 const c=document.createElement('canvas');c.width=360;c.height=640;const g=c.getContext('2d')!;
 const rec=new MediaRecorder(c.captureStream(24));const parts:Blob[]=[];rec.ondataavailable=e=>parts.push(e.data);
 let f=0;const iv=setInterval(()=>{g.fillStyle=`hsl(${f*6},70%,50%)`;g.fillRect(0,0,360,640);g.fillStyle='#fff';g.font='700 48px sans-serif';g.fillText(String(f++),40,90);},42);
 rec.start();await new Promise(r=>setTimeout(r,2400));rec.stop();clearInterval(iv);await new Promise(r=>{rec.onstop=r;});
 return new File(parts,'clip.webm',{type:'video/webm'});
}
/** Pretends to upload a made clip and shows what was made (size, length, shape) in the story's actions. */
const fakeVideo:SendVideo=(v,on)=>new Promise(res=>{console.info('made',v.mime,v.size,v.durationMs,v.w+'×'+v.h);let p=0;const t=setInterval(()=>{p+=.25;on(Math.min(1,p));if(p>=1){clearInterval(t);res('asset-v');}},200);});
const LiveClip=(a:S['args']&{chat?:boolean})=>{const [files,setFiles]=useState<File[]|null>(null);const [open,setOpen]=useState(true);const [mode,setMode]=useState('normal');
 useEffect(()=>{void sampleClip().then(f=>setFiles(f?[f]:[]));},[]);
 if(!files)return <span/>;if(!open)return <Btn kind="soft" onClick={()=>setOpen(true)}>Открыть снова</Btn>;
 return <Uploader {...a!} max={a?.max??6} files={files} send={fakeSend(false)} sendVideo={fakeVideo} onDone={()=>setOpen(false)} onClose={()=>setOpen(false)}
  {...(a?.chat?{doneLabel:'Отправить',title:'Фото или видео'}:{})}>
  {a?.chat&&<Group title="Как смотреть"><Card><SelectRow solo label="Как смотреть" value={mode} onChange={setMode} options={[['normal','Обычно'],['once','Один просмотр']] as const}/></Card></Group>}
 </Uploader>;};
export const Видео:S={name:'Видео: обрезка, кадр, готовим на устройстве',render:a=><LiveClip {...a} aspects={['orig','4:5','1:1','16:9']}/>};
export const Чат:S={name:'Чат: предпросмотр перед отправкой',render:a=><LiveClip {...a} chat max={1} aspects={['orig','4:5','1:1','16:9']}/>};

export const Обрезка:StoryObj<typeof TrimSheet>={name:'Обрезка видео',render:a=>{const [file,setFile]=useState<File|null>(null);useEffect(()=>{void sampleClip().then(setFile);},[]);
 return file?<TrimSheet {...a} file={file} durationMs={2400}/>:<span/>;},args:{onApply:()=>{},onClose:()=>{}},argTypes:{file:{control:false}}};
