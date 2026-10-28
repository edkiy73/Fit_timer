import type {Meta,StoryObj} from '@storybook/react-vite';
import {useEffect,useState} from 'react';
import {VideoBadge,VideoPlayer,VoiceBubble,VoiceRecorder,type Voice} from './av';
import {Alert,Stack} from './index';
import {fmtDur} from './media';

/** A poster drawn on a canvas and a two-second clip recorded from it, so the stories need no network. */
function poster(w=720,h=1280,label='Видео'):string{
 const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d')!;
 const gr=g.createLinearGradient(0,0,w,h);gr.addColorStop(0,'#c33');gr.addColorStop(1,'#36c');g.fillStyle=gr;g.fillRect(0,0,w,h);
 g.fillStyle='#fff';g.font='700 72px sans-serif';g.fillText(label,48,120);return c.toDataURL('image/jpeg',.8);
}
async function clip():Promise<string|null>{
 if(typeof MediaRecorder==='undefined')return null;
 const c=document.createElement('canvas');c.width=360;c.height=640;const g=c.getContext('2d')!;
 const rec=new MediaRecorder(c.captureStream(24));const parts:Blob[]=[];rec.ondataavailable=e=>parts.push(e.data);
 let f=0;const iv=setInterval(()=>{g.fillStyle=`hsl(${f*6},70%,50%)`;g.fillRect(0,0,360,640);g.fillStyle='#fff';g.font='700 48px sans-serif';g.fillText(String(f++),40,90);},42);
 rec.start();await new Promise(r=>setTimeout(r,2000));rec.stop();clearInterval(iv);await new Promise(r=>{rec.onstop=r;});
 return URL.createObjectURL(new Blob(parts,{type:rec.mimeType}));
}
/** A short tone as WAV: the voice bubble needs a real file to play. */
function tone(sec=3):string{
 const rate=8000,n=rate*sec,b=new ArrayBuffer(44+n*2),v=new DataView(b);const s=(o:number,x:string)=>[...x].forEach((ch,i)=>v.setUint8(o+i,ch.charCodeAt(0)));
 s(0,'RIFF');v.setUint32(4,36+n*2,true);s(8,'WAVE');s(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);
 v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);s(36,'data');v.setUint32(40,n*2,true);
 for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.sin(i/rate*2*Math.PI*330)*8000*Math.abs(Math.sin(i/rate*3)),true);
 return URL.createObjectURL(new Blob([b],{type:'audio/wav'}));
}
const PEAKS=[2,6,12,20,28,31,24,16,9,4,8,14,22,30,26,18,10,6,3,7,15,23,29,21,13,7,4,9,17,25,31,27,19,11,5,3,8,16,24,30,22,14,8,4,6,12,18,10];

const meta={title:'Медиа/Видео и голос',component:VideoPlayer,tags:['autodocs'],
 parameters:{docs:{description:{component:'Видео в постах, чатах и просмотрщике; голосовые сообщения в чатах (владелец, 28.10). Ссылки на файлы — короткие подписанные (`src.file` из mediaDto); плееры не дают скачать, вынести в «картинку в картинке» или на другое устройство.\n\n'+
  '**VideoPlayer** — обложка (первый кадр готового видео, вырезан на устройстве), круглая кнопка и длительность; нажатие в любом месте — играть / пауза на месте. Пока играет, снизу свои кнопки: ▶/❚❚, время, полоса перемотки, звук, с `onExpand` — «На весь экран» (системных кнопок нет: на телефонах они не показывались). Файл уже обрезан и кадрирован на устройстве перед загрузкой — плеер показывает его как есть, в форме `w`×`h`. Без `src` (на проверке, скрыто) — только обложка. `fill` — во весь слайд просмотрщика, `autoPlay` — сразу (без звука, если браузер не даёт звук без нажатия). Одновременно играет одно видео.\n\n'+
  '**VideoBadge** — значок ▶ с длительностью поверх обложки в сетках, плитках и загрузчике.\n\n'+
  '**VoiceBubble** — голосовое в пузыре: ▶/❚❚, волна заполняется при проигрывании (нажатие по волне — перемотка), время; получатель видит точку, пока не прослушал, отправитель — «Прослушано».\n\n'+
  '**VoiceRecorder** — кнопка микрофона в строке сообщения: удерживать — запись; влево — отмена; вверх — запись без рук (с ✕, «Стоп» и прослушиванием перед отправкой); короткое нажатие тоже включает запись без рук. Микрофон спрашиваем только при первом нажатии; отказ — понятное сообщение. До 5 минут. Формат — webm/opus, на iOS Safari — mp4/aac.'}}},
 args:{poster:poster(),w:720,h:1280,durationMs:12000},
 argTypes:{src:{control:false},poster:{control:false}},
} satisfies Meta<typeof VideoPlayer>;
export default meta;
type S=StoryObj<typeof meta>;

const WithClip=(a:S['args'])=>{const [src,setSrc]=useState<string|null>(null);useEffect(()=>{void clip().then(setSrc);},[]);
 return <div style={{maxWidth:280}}><VideoPlayer {...a} src={src} durationMs={2000}/></div>;};
export const Видео:S={name:'Видео: обложка и «Смотреть»',render:a=><WithClip {...a}/>};
export const Квадрат:S={name:'Видео 1:1 с «На весь экран»',render:a=>{const [src,setSrc]=useState<string|null>(null);useEffect(()=>{void clip().then(setSrc);},[]);
 return <div style={{maxWidth:280}}><VideoPlayer {...a} src={src} w={1} h={1} durationMs={2000} onExpand={()=>{}}/></div>;}};
export const НаПроверке:S={name:'Видео без ссылки (на проверке / скрыто)',render:a=><div style={{maxWidth:280}}><VideoPlayer {...a} src={null}/></div>};
export const Значок:StoryObj<typeof VideoBadge>={name:'Значок длительности',render:()=><div style={{position:'relative',width:120,height:150,borderRadius:12,overflow:'hidden'}}>
 <img src={poster(240,300)} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/><VideoBadge durationMs={47000}/></div>};

export const Голосовое:StoryObj<typeof VoiceBubble>={name:'Голосовое: получатель, отправитель, ждёт',render:()=>{const [src]=useState(()=>tone());const [heard,setHeard]=useState(false);
 return <Stack gap={4}>
  <VoiceBubble src={src} durationMs={3000} peaks={PEAKS} listened={heard} onPlayed={()=>setHeard(true)}/>
  <VoiceBubble src={src} durationMs={3000} peaks={PEAKS} mine listened/>
  <VoiceBubble src={null} durationMs={41000} peaks={PEAKS} mine/>
 </Stack>;}};

export const Запись:StoryObj<typeof VoiceRecorder>={name:'Запись голосового',render:()=>{const [got,setGot]=useState<Voice|null>(null);const [err,setErr]=useState('');
 return <Stack gap={4}>
  <div className="inputbar" style={{position:'relative',display:'flex',justifyContent:'flex-end',padding:8,minHeight:58}}><VoiceRecorder onSend={v=>{setGot(v);setErr('');}} onError={w=>setErr(w)}/></div>
  {got&&<Alert kind="ok">Записано: {fmtDur(got.durationMs)}, {Math.round(got.blob.size/1024)} КБ, {got.mime}</Alert>}
  {err&&<Alert kind="warn">Ошибка: {err}</Alert>}
  {got&&<VoiceBubble src={URL.createObjectURL(got.blob)} durationMs={got.durationMs} peaks={got.peaks} mine/>}
 </Stack>;}};
