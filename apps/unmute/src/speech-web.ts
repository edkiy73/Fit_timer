export type SpeakText=(text:string,locale?:string)=>Promise<boolean>;

export type WebRecognitionError=
  |'unsupported'
  |'permission'
  |'no-speech'
  |'aborted'
  |'network'
  |'recognition';

export interface WebRecognitionHandlers {
  onResult:(alternatives:string[])=>void;
  onError?:(error:WebRecognitionError)=>void;
  onEnd?:()=>void;
}

export interface WebRecognitionHandle {
  stop:()=>void;
  abort:()=>void;
}

export type StartRecognition=(
  handlers:WebRecognitionHandlers,
  locale?:string
)=>WebRecognitionHandle|null;

interface RecognitionAlternativeLike { transcript?:string }
interface RecognitionResultLike {
  length:number;
  [index:number]:RecognitionAlternativeLike;
}
interface RecognitionEventLike {
  results:ArrayLike<RecognitionResultLike>;
}
interface RecognitionErrorLike { error?:string }

interface RecognitionLike {
  lang:string;
  interimResults:boolean;
  maxAlternatives:number;
  continuous?:boolean;
  onresult:((event:RecognitionEventLike)=>void)|null;
  onerror:((event:RecognitionErrorLike)=>void)|null;
  onend:(()=>void)|null;
  start:()=>void;
  stop:()=>void;
  abort:()=>void;
}

type RecognitionConstructor=new()=>RecognitionLike;

function recognitionError(value:string|undefined):WebRecognitionError{
  if(value==='not-allowed'||value==='service-not-allowed')return 'permission';
  if(value==='no-speech')return 'no-speech';
  if(value==='aborted')return 'aborted';
  if(value==='network')return 'network';
  return 'recognition';
}

export const startWebRecognition:StartRecognition=(handlers,locale='en-US')=>{
  if(typeof window==='undefined'){
    handlers.onError?.('unsupported');
    return null;
  }

  const scope=window as unknown as {
    SpeechRecognition?:RecognitionConstructor;
    webkitSpeechRecognition?:RecognitionConstructor;
  };
  const Recognition=scope.SpeechRecognition||scope.webkitSpeechRecognition;
  if(!Recognition){
    handlers.onError?.('unsupported');
    return null;
  }

  const recognition=new Recognition();
  recognition.lang=locale;
  recognition.interimResults=false;
  recognition.maxAlternatives=3;
  recognition.continuous=false;

  recognition.onresult=event=>{
    const first=event.results?.[0];
    const alternatives:string[]=[];
    if(first){
      for(let index=0;index<first.length;index++){
        const value=String(first[index]?.transcript||'').trim();
        if(value)alternatives.push(value);
      }
    }
    if(alternatives.length)handlers.onResult(alternatives);
    else handlers.onError?.('no-speech');
  };
  recognition.onerror=event=>handlers.onError?.(recognitionError(event.error));
  recognition.onend=()=>handlers.onEnd?.();

  try{
    recognition.start();
  }catch(_){
    handlers.onError?.('recognition');
    return null;
  }

  return {
    stop(){
      try{recognition.stop();}catch(_){}
    },
    abort(){
      try{recognition.abort();}catch(_){}
    }
  };
};

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
