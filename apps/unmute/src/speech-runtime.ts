import {
  createSpeech,
  type AudioPlugin,
  type SpeechTransport
} from '@appbase/core/speech.js';
import {
  speakWebText,
  startWebRecognition,
  type SpeakText,
  type StartRecognition,
  type WebRecognitionError,
  type WebRecognitionHandle
} from './speech-web';

interface CapacitorLike {
  isNativePlatform?():boolean;
  Plugins?:{
    UnMuteAudio?:AudioPlugin;
  };
}

function capacitor():CapacitorLike|null{
  return ((globalThis as unknown as {Capacitor?:CapacitorLike}).Capacitor)??null;
}

function nativeAudio():AudioPlugin|null{
  const cap=capacitor();
  if(!cap?.isNativePlatform?.())return null;
  return cap.Plugins?.UnMuteAudio??null;
}

function nativeTransport():SpeechTransport|null{
  const audio=nativeAudio();
  if(!audio)return null;
  return createSpeech({
    native:true,
    audio,
    defaultLanguage:'en-US',
    defaultLocale:'en-US'
  });
}

function nativeError(value:string):WebRecognitionError{
  if(value==='permission')return 'permission';
  if(value==='no-speech')return 'no-speech';
  if(value==='aborted')return 'aborted';
  if(value==='network')return 'network';
  return 'recognition';
}

function alternativesFromEvent(text:string,event:Record<string,unknown>):string[]{
  const raw=event.alternatives;
  const values=Array.isArray(raw)
    ? raw.map(value=>String(value||'').trim()).filter(Boolean)
    : [];
  const primary=String(text||'').trim();
  if(primary&&!values.includes(primary))values.unshift(primary);
  return values.slice(0,3);
}

export function nativeSpeechAvailable():boolean{
  return nativeAudio()!==null;
}

export const speakText:SpeakText=async(text,locale='en-US')=>{
  const native=nativeTransport();
  if(native){
    const spoken=await native.speak(text,{locale});
    if(spoken)return true;
  }
  return speakWebText(text,locale);
};

export const startRecognition:StartRecognition=(handlers,locale='en-US')=>{
  const native=nativeTransport();
  if(!native)return startWebRecognition(handlers,locale);

  let live=true;
  let received=false;
  let stopped=false;

  const finish=()=>{
    if(stopped)return;
    stopped=true;
    handlers.onEnd?.();
  };

  void native.startRecognition({
    onResult:(text,event)=>{
      if(!live)return;
      const alternatives=alternativesFromEvent(text,event);
      if(!alternatives.length){
        handlers.onError?.('no-speech');
        return;
      }
      received=true;
      handlers.onResult(alternatives);
    },
    onError:error=>{
      if(!live)return;
      handlers.onError?.(nativeError(error));
    },
    onStatus:event=>{
      const status=String(event.status??event.state??'').toLowerCase();
      if(status==='end'||status==='ended'||status==='stopped')finish();
    }
  },locale).then(started=>{
    if(!live)return;
    if(!started){
      handlers.onError?.('recognition');
      finish();
    }
  }).catch(()=>{
    if(!live)return;
    handlers.onError?.('recognition');
    finish();
  });

  const close=(abort:boolean)=>{
    if(!live)return;
    live=false;
    void native.stopRecognition().finally(()=>{
      if(!abort&&!received)handlers.onError?.('no-speech');
      finish();
    });
  };

  const handle:WebRecognitionHandle={
    stop(){ close(false); },
    abort(){ close(true); }
  };
  return handle;
};

export type {
  SpeakText,
  StartRecognition,
  WebRecognitionError,
  WebRecognitionHandle
} from './speech-web';
