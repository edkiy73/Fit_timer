import { ENGLISH_SPEECH_LOCALE } from './speech-locale';

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

/** Whether this access to the microphone lets «Говорение» listen, ask manual checking, or fall back. */
export type MicrophoneAccess='granted'|'denied'|'unsupported';
export type RequestMicrophone=()=>Promise<MicrophoneAccess>;

function recognitionConstructor():RecognitionConstructor|null{
  if(typeof window==='undefined')return null;
  const scope=window as unknown as {
    SpeechRecognition?:RecognitionConstructor;
    webkitSpeechRecognition?:RecognitionConstructor;
  };
  return scope.SpeechRecognition||scope.webkitSpeechRecognition||null;
}

/** Ask the browser for the microphone (the prompt shows only when it has not been answered yet). */
export const requestWebMicrophone:RequestMicrophone=async()=>{
  if(!recognitionConstructor())return 'unsupported';
  const media=typeof navigator==='undefined'?null:navigator.mediaDevices;
  if(!media?.getUserMedia)return 'granted';
  try{
    const stream=await media.getUserMedia({audio:true});
    stream.getTracks().forEach(track=>track.stop());
    return 'granted';
  }catch(error){
    const name=(error as {name?:string}|null)?.name;
    if(name==='NotAllowedError'||name==='SecurityError')return 'denied';
    if(name==='NotFoundError')return 'unsupported';
    // Anything else: let recognition itself try and report.
    return 'granted';
  }
};

export const startWebRecognition:StartRecognition=(handlers,locale=ENGLISH_SPEECH_LOCALE)=>{
  const Recognition=recognitionConstructor();
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

// Browsers often default to an American voice even for lang="en-GB": pick a voice of the exact
// locale, otherwise leave the choice to the browser.
function voiceFor(synth:SpeechSynthesis,locale:string):SpeechSynthesisVoice|null{
  try{
    const wanted=locale.toLowerCase();
    return synth.getVoices().find(voice=>String(voice.lang||'').replace('_','-').toLowerCase()===wanted)??null;
  }catch(_){
    return null;
  }
}

export async function speakWebText(text:string,locale=ENGLISH_SPEECH_LOCALE):Promise<boolean>{
  if(typeof window==='undefined')return false;
  const synth=window.speechSynthesis;
  if(!synth||typeof SpeechSynthesisUtterance==='undefined'||!String(text||'').trim())return false;

  return new Promise(resolve=>{
    try{
      synth.cancel();
      const utterance=new SpeechSynthesisUtterance(String(text));
      utterance.lang=locale;
      const voice=voiceFor(synth,locale);
      if(voice)utterance.voice=voice;
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
