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
