/** Photos are prepared on the device before upload (owner/V21: «сжимаем прямо на телефоне и стираем скрытые данные»):
 * decoded with the camera's orientation applied, scaled to at most MAX_SIDE, re-encoded as JPEG. Re-encoding drops
 * every metadata block (location, camera model, capture time). Cropping draws only the chosen frame. */
export type Aspect='orig'|'4:5'|'1:1'|'16:9';
export const ASPECTS:Record<Exclude<Aspect,'orig'>,[number,number]>={'4:5':[4,5],'1:1':[1,1],'16:9':[16,9]};
/** Where the frame sits on the photo: x/y shift as a share of the scaled photo (0 = centred), z ≥ 1 zoom. */
/** `rect` (free format): the frame as a share of the whole photo [x, y, width, height]; then x / y / z are not used. */
export type Crop={x:number,y:number,z:number,rect?:[number,number,number,number]|undefined};
export const NO_CROP:Crop={x:0,y:0,z:1};
export type Prepared={blob:Blob,url:string,w:number,h:number,size:number};

const MAX_SIDE=2048;const QUALITY=.86;const POSTER_SIDE=1280;
export const PHOTO_TYPES=['image/jpeg','image/png','image/webp','image/heic','image/heif'];
export const PHOTO_MAX_BYTES=25*1024*1024;

async function decode(src:Blob):Promise<ImageBitmap>{
 // `from-image` applies the EXIF orientation, so a phone photo is upright after metadata is gone.
 return createImageBitmap(src,{imageOrientation:'from-image'});
}
function toJpeg(canvas:HTMLCanvasElement):Promise<Blob>{
 return new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error('encode')),'image/jpeg',QUALITY));
}
async function draw(bmp:ImageBitmap,sx:number,sy:number,sw:number,sh:number):Promise<Prepared>{
 const k=Math.min(1,MAX_SIDE/Math.max(sw,sh));const w=Math.round(sw*k),h=Math.round(sh*k);
 const c=document.createElement('canvas');c.width=w;c.height=h;
 const g=c.getContext('2d');if(!g)throw new Error('canvas');
 g.imageSmoothingQuality='high';g.drawImage(bmp,sx,sy,sw,sh,0,0,w,h);
 const blob=await toJpeg(c);return {blob,url:URL.createObjectURL(blob),w,h,size:blob.size};
}

/** The whole photo, upright, at most MAX_SIDE, without metadata. */
export async function preparePhoto(file:Blob):Promise<Prepared>{
 const bmp=await decode(file);try{return await draw(bmp,0,0,bmp.width,bmp.height);}finally{bmp.close();}
}

/** The source rectangle of the frame `aspect` placed by `crop` on a W×H picture (same maths as the crop sheet's
 * preview): at zoom 1 the largest aspect box that fits; zoom shrinks it around the shifted centre. */
export function cropRect(W:number,H:number,aspect:Aspect,crop:Crop):{sx:number,sy:number,sw:number,sh:number}{
 if(crop.rect||aspect==='orig'){const [rx,ry,rw,rh]=crop.rect??[0,0,1,1];
  return {sx:rx*W,sy:ry*H,sw:Math.max(1,rw*W),sh:Math.max(1,rh*H)};}
 const [aw,ah]=ASPECTS[aspect];
 const base=Math.min(W/aw,H/ah);const fw=aw*base/crop.z,fh=ah*base/crop.z;
 const cx=W/2-crop.x*W,cy=H/2-crop.y*H;
 return {sx:Math.max(0,Math.min(W-fw,cx-fw/2)),sy:Math.max(0,Math.min(H-fh,cy-fh/2)),sw:fw,sh:fh};
}
/** The frame `aspect` placed by `crop` on the photo. */
export async function cropPhoto(file:Blob,aspect:Aspect,crop:Crop):Promise<Prepared>{
 const bmp=await decode(file);
 try{const r=cropRect(bmp.width,bmp.height,aspect,crop);return await draw(bmp,r.sx,r.sy,r.sw,r.sh);}finally{bmp.close();}
}

export const isPhoto=(f:File)=>PHOTO_TYPES.includes(f.type)||/\.(heic|heif)$/i.test(f.name);
export const kb=(n:number)=>n<1024*1024?`${Math.max(1,Math.round(n/1024))} КБ`:`${(n/1024/1024).toFixed(1)} МБ`;

/* ---------- video and voice (owner, 28.10.2026) ---------- */
/** Server limits (server/media/assets.mjs): a clip up to a minute and 100 MB, a voice message up to five minutes. */
export const VIDEO_TYPES=['video/mp4','video/quicktime','video/webm'];
export const VIDEO_MAX_BYTES=100*1024*1024;
export const VIDEO_MAX_MS=60_000;
export const VOICE_MAX_MS=300_000;
export const isVideo=(f:File)=>VIDEO_TYPES.includes(f.type)||/\.(mp4|mov|m4v|webm)$/i.test(f.name);
/** «0:07.5»: to a tenth of a second (trim handles). */
export const fmtDurFine=(ms:number)=>{const d=Math.max(0,Math.round(ms/100));const s=Math.floor(d/10);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}.${d%10}`;};
/** «0:07», «1:00», «4:59». */
export const fmtDur=(ms:number|null|undefined)=>{const s=Math.max(0,Math.round((ms??0)/1000));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};

/** A clip is made on the device before it is sent (owner, 28.10.2026, «Зачем грузить огромные файлы ради кусочка?»):
 * only the chosen part (≤ 60 s), cut to the chosen frame, ≤ 1280 px, compressed (kit/video-edit.ts). So the source may
 * be much longer and larger than what the server takes; the server limits apply to the result. */
export const VIDEO_SOURCE_MAX_BYTES=2*1024*1024*1024;
export const VIDEO_SOURCE_MAX_MS=600_000;
/** The frame of a clip as the crop sheet returns it. */
export type ClipCrop={aspect:Aspect}&Crop;
/** The author's choice for a clip: the part to keep and the frame. Applied on the device; nothing of it goes to the server. */
export type VideoEdit={trim?:{startMs:number,endMs:number}|undefined,crop?:ClipCrop|undefined};
export const TRIM_MIN_MS=1000;
/** A clip, ready to send: the file that goes (after `makeVideo`: the made one), its length, size, MIME and a poster frame
 * (JPEG, from its first moment, cut on the device). Before it is made it describes the picked source. */
export type PreparedVideo={file:File,poster:Blob,url:string,w:number,h:number,durationMs:number,size:number,mime:string};

/** Where the video sits in its box for a crop preview (trim sheet): size and offset in % of the box (the crop sheet's
 * maths with the clip covering the frame). `r` = the clip's own width / height. */
export function clipBox(r:number,crop:ClipCrop):{w:number,h:number,x:number,y:number}{
 if(crop.rect){const [rx,ry,rw,rh]=crop.rect;const w=100/rw,h=100/rh;return {w,h,x:-rx*w,y:-ry*h};}
 const [aw,ah]=crop.aspect==='orig'?[1,1]:ASPECTS[crop.aspect];const a=aw/ah;
 let w=100,h=100;if(r>a)w=r/a*100;else h=a/r*100;
 w*=crop.z;h*=crop.z;
 return {w,h,x:(100-w)/2+crop.x*w,y:(100-h)/2+crop.y*h};
}

/** The recorder fallback's format: MP4 (H.264 + AAC) where offered — Safari, Chrome 126+ —, WebM (VP8/VP9 + Opus)
 * otherwise (never MP4 with other codecs: Safari would not play it); null without MediaRecorder or canvas capture. */
export function recorderMime():string|null{
 if(typeof MediaRecorder==='undefined'||typeof HTMLCanvasElement==='undefined'||!('captureStream' in HTMLCanvasElement.prototype))return null;
 for(const m of ['video/mp4;codecs=avc1.42E01F,mp4a.40.2','video/mp4;codecs=avc1,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'])
  if(MediaRecorder.isTypeSupported?.(m))return m;
 return null;
}
let editPath:Promise<'webcodecs'|'recorder'|null>|null=null;
/** How this device makes clips: WebCodecs with an H.264 encoder (Chrome / Edge / Android WebView, Safari and iOS
 * WKWebView 16.4+, Firefox 130+ desktop), else the real-time recorder, else none — then a clip goes as picked (≤ 60 s,
 * ≤ 100 MB) and the uploader offers no trim or crop. */
export function videoEditPath():Promise<'webcodecs'|'recorder'|null>{
 return editPath??=(async()=>{
  try{
   if(typeof VideoEncoder!=='undefined'&&typeof VideoDecoder!=='undefined'&&typeof Worker!=='undefined'){
    const s=await VideoEncoder.isConfigSupported({codec:'avc1.42001f',width:1280,height:720,bitrate:2_500_000,framerate:30});
    if(s.supported)return 'webcodecs';
   }
  }catch{/* fall through */}
  return recorderMime()?'recorder':null;
 })();
}

/** Opens a clip in a hidden video element and reads its real length (recorded WebM reports none until the end is
 * sought). The caller seeks it with `frameAt` and revokes `src` when done. */
export function openVideo(file:File):Promise<{v:HTMLVideoElement,src:string,length:number}>{
 return new Promise((res,rej)=>{
  const src=URL.createObjectURL(file);const v=document.createElement('video');
  v.muted=true;v.playsInline=true;v.preload='auto';v.src=src;
  let over=false;const fail=()=>{if(over)return;over=true;clearTimeout(timer);URL.revokeObjectURL(src);rej(new Error('video'));};
  const timer=setTimeout(fail,20000);
  v.onerror=fail;
  v.onloadedmetadata=()=>{
   if(Number.isFinite(v.duration)){over=true;clearTimeout(timer);res({v,src,length:v.duration});return;}
   v.onseeked=()=>{if(over)return;over=true;clearTimeout(timer);v.onseeked=null;res({v,src,length:Number.isFinite(v.duration)?v.duration:v.currentTime});};
   v.currentTime=1e7;
  };
 });
}
/** Seeks the clip to `t` seconds and draws that frame (cropped when `crop` is given) as a JPEG at most `side` long. */
export function frameAt(v:HTMLVideoElement,t:number,{crop,side=POSTER_SIDE,quality=.82}:{crop?:ClipCrop|undefined,side?:number,quality?:number}={}):Promise<{blob:Blob,w:number,h:number}>{
 return new Promise((res,rej)=>{
  const draw=()=>{
   const W=v.videoWidth,H=v.videoHeight;if(!W||!H){rej(new Error('video'));return;}
   const r=crop?cropRect(W,H,crop.aspect,crop):{sx:0,sy:0,sw:W,sh:H};
   const k=Math.min(1,side/Math.max(r.sw,r.sh));const w=Math.max(1,Math.round(r.sw*k)),h=Math.max(1,Math.round(r.sh*k));
   const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');if(!g){rej(new Error('canvas'));return;}
   try{g.drawImage(v,r.sx,r.sy,r.sw,r.sh,0,0,w,h);}catch{rej(new Error('video'));return;}
   c.toBlob(b=>b?res({blob:b,w,h}):rej(new Error('encode')),'image/jpeg',quality);
  };
  const target=Math.max(0,Math.min(t,(Number.isFinite(v.duration)?v.duration:t)-.05));
  if(Math.abs(v.currentTime-target)<.01&&v.readyState>=2){draw();return;}
  const timer=setTimeout(()=>{v.onseeked=null;rej(new Error('seek'));},10000);
  v.onseeked=()=>{clearTimeout(timer);v.onseeked=null;draw();};
  v.currentTime=target;
 });
}
/** The poster of an edited clip: the frame at the trim start, cropped; and the whole frame there for the crop sheet. */
export async function clipPoster(file:File,edit:VideoEdit|undefined):Promise<{poster:Blob,url:string,w:number,h:number,full:string}>{
 const o=await openVideo(file);
 try{
  const at=Math.max(.1,(edit?.trim?.startMs??0)/1000+.05);
  const whole=await frameAt(o.v,at);
  const cut=edit?.crop?await frameAt(o.v,at,{crop:edit.crop}):whole;
  return {poster:cut.blob,url:URL.createObjectURL(cut.blob),w:cut.w,h:cut.h,full:URL.createObjectURL(whole.blob)};
 }finally{URL.revokeObjectURL(o.src);o.v.removeAttribute('src');o.v.load();}
}
/** `n` small frames across the clip for the trim filmstrip. */
export async function filmstrip(file:File,n:number,height=96):Promise<string[]>{
 const o=await openVideo(file);
 try{
  const out:string[]=[];
  for(let i=0;i<n;i++){const f=await frameAt(o.v,(i+.5)*o.length/n,{side:height*2,quality:.7});out.push(URL.createObjectURL(f.blob));}
  return out;
 }finally{URL.revokeObjectURL(o.src);o.v.removeAttribute('src');o.v.load();}
}

/** Reads the length and cuts the poster frame. Rejects when the browser cannot decode the clip (it could not play it
 * either). `mime` falls back to the file name: some pickers give an empty type for .mov. */
export function prepareVideo(file:File):Promise<PreparedVideo>{
 return new Promise((res,rej)=>{
  const src=URL.createObjectURL(file);const v=document.createElement('video');
  v.muted=true;v.playsInline=true;v.preload='auto';v.src=src;
  let over=false;
  const fail=()=>{if(over)return;over=true;URL.revokeObjectURL(src);rej(new Error('video'));};
  const timer=setTimeout(fail,20000);
  v.onerror=()=>{clearTimeout(timer);fail();};
  // The frame at 0.1 s avoids a black fade-in. Recorded WebM often reports no length until the end is sought: seek far
  // first, read the real length, then come back for the frame.
  let probing=false;let length=NaN;
  v.onloadedmetadata=()=>{
   if(Number.isFinite(v.duration)){length=v.duration;v.currentTime=Math.min(.1,length/2);}
   else{probing=true;v.currentTime=1e7;}
  };
  v.onseeked=()=>{
   if(over)return;
   if(probing){probing=false;length=Number.isFinite(v.duration)?v.duration:v.currentTime;v.currentTime=Math.min(.1,length/2);return;}
   clearTimeout(timer);
   const w0=v.videoWidth,h0=v.videoHeight;
   const k=Math.min(1,POSTER_SIDE/Math.max(w0||1,h0||1));const w=Math.round(w0*k),h=Math.round(h0*k);
   const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');
   if(!w0||!h0||!g){fail();return;}
   try{g.drawImage(v,0,0,w,h);}catch{fail();return;}
   c.toBlob(b=>{
    if(!b){fail();return;}
    over=true;URL.revokeObjectURL(src);
    const mime=VIDEO_TYPES.includes(file.type)?file.type:/\.mov$/i.test(file.name)?'video/quicktime':/\.webm$/i.test(file.name)?'video/webm':'video/mp4';
    res({file,poster:b,url:URL.createObjectURL(b),w:w0,h:h0,durationMs:Math.round((Number.isFinite(length)?length:0)*1000),size:file.size,mime});
   },'image/jpeg',.82);
  };
 });
}

/** The recording format this browser offers: Opus in WebM (Chrome, Android WebView, Firefox), AAC in MP4 (iOS
 * Safari), Opus in Ogg. Null without MediaRecorder; '' when the browser names none (its default is used). */
export function voiceMime():string|null{
 if(typeof MediaRecorder==='undefined')return null;
 for(const m of ['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'])if(MediaRecorder.isTypeSupported?.(m))return m;
 return '';
}
/** The MIME the server stores: no codec parameters. */
export const baseMime=(m:string)=>m.split(';')[0]!.trim();

/* ---------- signed media links ---------- */
const b64=(s:string)=>{try{return atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4));}catch{return '';}};
/** When a media link from the server stops working (ms since epoch), or null for a link without a lifetime.
 * Supabase signed links carry a JWT (`token=`, its `exp`), our media domain a `t=v1.<payload>.<sig>` token whose
 * payload is `asset|variant|viewer|exp|nonce`. */
export function linkExpiresAt(url:string|null|undefined):number|null{
 if(!url)return null;
 const m=/[?&](token|t)=([A-Za-z0-9._-]+)/.exec(url);if(!m)return null;
 const parts=m[2]!.split('.');
 if(m[1]==='t'&&parts[0]==='v1'&&parts[1]){const exp=Number(b64(parts[1]).split('|')[3]);return exp>0?exp*1000:null;}
 if(m[1]==='token'&&parts.length===3){try{const exp=Number((JSON.parse(b64(parts[1]!)) as {exp?:unknown}).exp);return exp>0?exp*1000:null;}catch{return null;}}
 return null;
}
/** The earliest moment any media link inside a server answer stops working, or null when it has none. A read cache
 * never answers from a copy past this (owner 28.10.2026: avatars broke when a remembered answer outlived its links). */
export function linksExpireAt(body:unknown):number|null{
 let text:string;try{text=JSON.stringify(body)??'';}catch{return null;}
 if(!text.includes('token=')&&!text.includes('t=v1.'))return null;
 let min:number|null=null;
 for(const m of text.matchAll(/https?:[^"\s]+?[?&](?:token|t)=[A-Za-z0-9._-]+/g)){const e=linkExpiresAt(m[0]);if(e!==null&&(min===null||e<min))min=e;}
 return min;
}
