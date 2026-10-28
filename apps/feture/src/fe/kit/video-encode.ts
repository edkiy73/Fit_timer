/** Video on the device, the WebCodecs way (owner, 28.10.2026: «Телега даже сжимает видео перед отправкой»). Mediabunny
 * (MPL-2.0, unmodified) reads MP4 / MOV / WebM, WebCodecs decodes and re-encodes, Mediabunny writes the MP4: only the
 * chosen part, cut to the chosen frame, at most 1280 px on the long side, H.264 at ~2.5 Mbps for 720p (scaled by the
 * picture's area), at most 30 frames a second, AAC 128 kbps sound (copied as it is when the source already has AAC and
 * the device cannot encode it). Metadata (place, device, time) is never copied. Runs in a worker (video-worker.ts) or,
 * when a worker cannot start, on the page. Loaded only when a clip is sent (video-edit.ts). */
import {BlobSource,MATROSKA,MP4,QTFF,WEBM,BufferTarget,Conversion,Input,Mp4OutputFormat,Output,Quality,canEncodeVideo,getFirstEncodableAudioCodec} from 'mediabunny';
import {LONG_SIDE,outSize,videoBitrate,type EditJob} from './video-size';

export class Unsupported extends Error{constructor(why:string){super(why);this.name='Unsupported';}}

export async function encodeVideo(job:EditJob,onProgress:(p:number)=>void):Promise<{buf:ArrayBuffer,mime:string}>{
 if(typeof VideoEncoder==='undefined'||typeof VideoDecoder==='undefined')throw new Unsupported('webcodecs');
 const input=new Input({source:new BlobSource(job.file),formats:[MP4,QTFF,WEBM,MATROSKA]});
 try{
  const track=await input.getPrimaryVideoTrack();
  if(!track)throw new Unsupported('no_video');
  if(!(await track.canDecode()))throw new Unsupported('decode');
  const W=await track.getDisplayWidth(),H=await track.getDisplayHeight();
  const r=job.crop?{left:Math.round(job.crop.sx),top:Math.round(job.crop.sy),width:Math.round(job.crop.sw),height:Math.round(job.crop.sh)}:{left:0,top:0,width:W,height:H};
  const {w,h}=outSize(r.width,r.height,LONG_SIDE);
  const bitrate=videoBitrate(w,h);
  if(!(await canEncodeVideo('avc',{width:w,height:h,bitrate:new Quality({bitrate})})))throw new Unsupported('encode');
  let fps:number|undefined;
  try{const s=await track.computePacketStats(90);if(s.averagePacketRate>31)fps=30;}catch{/* keep the source rate */}
  const audio=await input.getPrimaryAudioTrack();
  const acodec=audio?await getFirstEncodableAudioCodec(['aac','opus'],{numberOfChannels:Math.min(2,audio.numberOfChannels),sampleRate:48000,bitrate:new Quality({bitrate:128_000})}).catch(()=>null):null;
  const target=new BufferTarget();
  const output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target});
  const conversion=await Conversion.init({input,output,tracks:'primary',tags:{},showWarnings:false,
   ...(job.trim?{trim:{start:job.trim.startMs/1000,end:job.trim.endMs/1000}}:{}),
   video:{codec:'avc',...(job.crop?{crop:r}:{}),width:w,height:h,fit:'fill',quality:new Quality({bitrate}),forceTranscode:true,keyFrameInterval:2,
    allowTransformationMetadata:false,...(fps?{frameRate:fps}:{})},
   // No AAC/Opus encoder: an AAC source is copied as it is; anything else would be dropped, so the clip goes silent.
   audio:acodec?{codec:acodec,quality:new Quality({bitrate:128_000}),...(audio&&audio.numberOfChannels>2?{numberOfChannels:2}:{})}:{codec:'aac'}});
  if(!conversion.isValid||!conversion.utilizedTracks.some(t=>t.isVideoTrack()))throw new Unsupported('conversion');
  conversion.onProgress=p=>onProgress(Math.max(0,Math.min(1,p)));
  await conversion.execute();
  if(!target.buffer)throw new Error('empty');
  return {buf:target.buffer,mime:'video/mp4'};
 }finally{input.dispose();}
}
