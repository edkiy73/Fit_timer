/** Photos are prepared on the device before upload (owner/V21: «сжимаем прямо на телефоне и стираем скрытые данные»):
 * decoded with the camera's orientation applied, scaled to at most MAX_SIDE, re-encoded as JPEG. Re-encoding drops
 * every metadata block (location, camera model, capture time). Cropping draws only the chosen frame. */
export type Aspect='orig'|'4:5'|'1:1'|'16:9';
export const ASPECTS:Record<Exclude<Aspect,'orig'>,[number,number]>={'4:5':[4,5],'1:1':[1,1],'16:9':[16,9]};
/** Where the frame sits on the photo: x/y shift as a share of the scaled photo (0 = centred), z ≥ 1 zoom. */
export type Crop={x:number,y:number,z:number};
export const NO_CROP:Crop={x:0,y:0,z:1};
export type Prepared={blob:Blob,url:string,w:number,h:number,size:number};

const MAX_SIDE=2048;const QUALITY=.86;
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

/** The frame `aspect` placed by `crop` on the photo (same maths as the crop sheet's preview). */
export async function cropPhoto(file:Blob,aspect:Exclude<Aspect,'orig'>,crop:Crop):Promise<Prepared>{
 const bmp=await decode(file);
 try{
  const [aw,ah]=ASPECTS[aspect];const W=bmp.width,H=bmp.height;
  // The frame at zoom 1 is the largest aspect box that fits; zoom shrinks it around the shifted centre.
  const base=Math.min(W/aw,H/ah);const fw=aw*base/crop.z,fh=ah*base/crop.z;
  const cx=W/2-crop.x*W,cy=H/2-crop.y*H;
  const sx=Math.max(0,Math.min(W-fw,cx-fw/2)),sy=Math.max(0,Math.min(H-fh,cy-fh/2));
  return await draw(bmp,sx,sy,fw,fh);
 }finally{bmp.close();}
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
/** «0:07», «1:00», «4:59». */
export const fmtDur=(ms:number|null|undefined)=>{const s=Math.max(0,Math.round((ms??0)/1000));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};

/** A picked clip, ready to send: its length, its size and a poster frame (JPEG, from the first moment) cut on the
 * device. The clip itself is sent as picked; the poster is what lists and covers show. */
export type PreparedVideo={file:File,poster:Blob,url:string,w:number,h:number,durationMs:number,size:number,mime:string};
const POSTER_SIDE=1280;

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
