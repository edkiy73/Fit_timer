import { apiUrl } from './api-url';

/* The learning day follows the server's clock, not the phone's: moving the phone date forward must
   not make tomorrow's review due today (owner's check 08.10). The app asks the server for its time
   at start and whenever it comes back to the screen, and keeps the difference; offline it uses the
   last known difference (or the phone clock if it never reached the server). Durations (timers,
   reaction times) still use the phone clock — only «which day is it» goes through here. */

const KEY='unmute.clock-offset';
// Network delay makes a few seconds of difference meaningless; ignore it.
const NOISE_MS=60_000;

let offsetMs=readStored();

function readStored():number{
  try{
    const value=Number(localStorage.getItem(KEY));
    return Number.isFinite(value)?value:0;
  }catch{ return 0; }
}

/** «Now» for learning days, streaks and review intervals. */
export function appNow():Date{
  return new Date(Date.now()+offsetMs);
}

export function clockOffsetMs():number{
  return offsetMs;
}

export function applyServerTime(serverIso:string,sentAt:number,receivedAt:number):boolean{
  const server=Date.parse(serverIso);
  if(!Number.isFinite(server)||receivedAt<sentAt)return false;
  const measured=server-(sentAt+receivedAt)/2;
  offsetMs=Math.abs(measured)<NOISE_MS?0:Math.round(measured);
  try{ localStorage.setItem(KEY,String(offsetMs)); }catch{}
  return true;
}

/** Ask the server for its time (public /api/health). A failure keeps the last known offset. */
export async function syncServerClock(fetcher:typeof fetch=fetch):Promise<boolean>{
  try{
    const sentAt=Date.now();
    const response=await fetcher(apiUrl('/api/health'),{cache:'no-store'});
    const receivedAt=Date.now();
    if(!response.ok)return false;
    const body=await response.json() as {checkedAt?:unknown};
    return typeof body.checkedAt==='string'&&applyServerTime(body.checkedAt,sentAt,receivedAt);
  }catch{
    return false;
  }
}

export function resetClockForTests():void{
  offsetMs=0;
  try{ localStorage.removeItem(KEY); }catch{}
}
