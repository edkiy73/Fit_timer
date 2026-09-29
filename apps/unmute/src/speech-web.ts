export type SpeakText=(text:string,locale?:string)=>Promise<boolean>;

export async function speakWebText(text:string,locale='en-US'):Promise<boolean>{
  if(typeof window==='undefined')return false;
  const synth=window.speechSynthesis;
  if(!synth||typeof SpeechSynthesisUtterance==='undefined'||!String(text||'').trim())return false;

  return new Promise(resolve=>{
    try{
      synth.cancel();
      const utterance=new SpeechSynthesisUtterance(String(text));
      utterance.lang=locale;
      let settled=false;
      const finish=(value:boolean)=>{
        if(settled)return;
        settled=true;
        resolve(value);
      };
      utterance.onend=()=>finish(true);
      utterance.onerror=()=>finish(false);
      synth.speak(utterance);
      // Some embedded WebViews never dispatch end/error. Speaking still started,
      // so callers must not wait forever just to unlock their UI.
      window.setTimeout(()=>finish(true),250);
    }catch(_){
      resolve(false);
    }
  });
}
