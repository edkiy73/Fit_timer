/** What a clip becomes on the device (shared by both ways of making it: video-encode.ts, video-edit.ts). */
/** The part to keep and the frame, in the source's displayed pixels (kit/media.ts cropRect). */
export type EditJob={file:File,trim?:{startMs:number,endMs:number}|undefined,crop?:{sx:number,sy:number,sw:number,sh:number}|undefined};
/** Telegram-like: 720p on the long side… 1280 px. */
export const LONG_SIDE=1280;
/** Even width and height (H.264 needs them), the long side at most `side`. */
export function outSize(sw:number,sh:number,side=LONG_SIDE):{w:number,h:number}{
 const k=Math.min(1,side/Math.max(sw,sh,1));
 const even=(n:number)=>Math.max(2,Math.round(n*k/2)*2);
 return {w:even(sw),h:even(sh)};
}
/** ~2.5 Mbps for 1280×720, scaled by the picture's area, 0.8…3 Mbps: a minute stays near 20 MB. */
export const videoBitrate=(w:number,h:number)=>Math.round(Math.max(800_000,Math.min(3_000_000,2_500_000*(w*h)/(1280*720))));
