import type { ListenerHandle } from './mobile.js';

/* Native text-to-speech, speech recognition and offline recognition-model transport.
   Products decide what to say, which language to use and what recognized text means. */

export interface RecognitionModelStatus {
  installed: boolean;
  unavailable?: boolean;
  language?: string | undefined;
  [key: string]: unknown;
}

export interface ModelDownloadStatus {
  language: string;
  status: 'ready' | 'queued';
  progress: number;
  installed: boolean;
  sizeMb?: unknown;
}

export interface AudioPlugin {
  requestMicrophone?(): Promise<{granted?: boolean}>;
  speak?(input: {text: string; locale: string; voice: string}): Promise<{spoken?: boolean}>;
  stopSpeaking?(): Promise<unknown>;
  listVoices?(): Promise<{voices?: unknown[]} | null>;
  addListener?(
    eventName: string,
    listener: (event: any) => void
  ): Promise<ListenerHandle> | ListenerHandle;
  startRecognition?(input: {language: string}): Promise<{started?: boolean; missingModel?: boolean} | null>;
  stopRecognition?(): Promise<unknown>;
  getRecognitionModelStatus?(input: {language: string}): Promise<RecognitionModelStatus>;
  prepareRecognitionModel?(input: {language: string}): Promise<{installed?: boolean; sizeMb?: unknown} | null>;
  deleteRecognitionModel?(input: {language: string}): Promise<{deleted?: boolean} | null>;
}

export interface SpeechOptions {
  native: boolean;
  audio?: AudioPlugin | null;
  /** Recognition language used when a caller does not pass one. */
  defaultLanguage: string;
  /** TTS locale used when a caller does not pass one. */
  defaultLocale: string;
  /** Runs before a background model download starts, e.g. to ask for progress notifications. */
  beforeModelDownload?: () => Promise<unknown>;
}

export interface SpeakOptions {
  locale?: string;
  voice?: string;
}

export interface RecognitionHandlers {
  onResult?: (text: string, event: Record<string, unknown>) => void;
  onError?: (code: string) => void;
  onStatus?: (event: Record<string, unknown>) => void;
  /** Raw "what was heard" diagnostics, including utterances that produced no result. */
  onHeard?: (event: Record<string, unknown>) => void;
}

export interface SpeechTransport {
  available(): boolean;
  requestMicrophone(): Promise<boolean>;
  speak(text: string, options?: SpeakOptions): Promise<boolean>;
  stopSpeaking(): Promise<void>;
  listVoices(): Promise<unknown[]>;
  startRecognition(handlers: RecognitionHandlers, language?: string): Promise<boolean>;
  stopRecognition(): Promise<void>;
  modelStatus(language?: string): Promise<RecognitionModelStatus>;
  downloadModel(language?: string, onStatus?: (status: ModelDownloadStatus) => void): Promise<boolean>;
  deleteModel(language?: string): Promise<boolean>;
}

export function createSpeech(options: SpeechOptions): SpeechTransport {
  const audio = options.native ? options.audio || null : null;
  let handles: ListenerHandle[] = [];

  const lang = (value?: string) => String(value || options.defaultLanguage);

  async function listen(eventName: string, listener: (event: any) => void): Promise<void> {
    if(!audio || !audio.addListener) return;
    handles.push(await audio.addListener(eventName, listener));
  }

  async function requestMicrophone(): Promise<boolean> {
    if(!options.native) return true;
    if(!audio || !audio.requestMicrophone) return false;
    try{
      const result = await audio.requestMicrophone();
      return result.granted === true;
    }catch(_){ return false; }
  }

  async function stopRecognition(): Promise<void> {
    if(!audio) return;
    try{ if(audio.stopRecognition) await audio.stopRecognition(); }catch(_){}
    const current = handles;
    handles = [];
    for(const handle of current){
      try{ await handle.remove(); }catch(_){}
    }
  }

  return {
    available(){ return !!audio; },

    requestMicrophone,

    async speak(text, speakOptions = {}){
      if(!audio || !audio.speak) return false;
      try{
        const result = await audio.speak({
          text:String(text || ''),
          locale:String(speakOptions.locale || options.defaultLocale),
          voice:String(speakOptions.voice || '')
        });
        return result.spoken === true;
      }catch(_){ return false; }
    },

    async stopSpeaking(){
      if(!audio || !audio.stopSpeaking) return;
      try{ await audio.stopSpeaking(); }catch(_){}
    },

    async listVoices(){
      if(!audio || !audio.listVoices) return [];
      try{
        const result = await audio.listVoices();
        return result && Array.isArray(result.voices) ? result.voices : [];
      }catch(_){ return []; }
    },

    async startRecognition(handlers, language){
      if(!audio || !audio.startRecognition) return false;
      await stopRecognition();
      if(!(await requestMicrophone())){
        if(handlers.onError) handlers.onError('permission');
        return false;
      }
      try{
        await listen('speechResult', event => {
          if(handlers.onResult && event && event.text) handlers.onResult(event.text, event);
        });
        await listen('speechError', event => {
          if(handlers.onError) handlers.onError((event && event.error) || 'recognition');
        });
        await listen('speechStatus', event => {
          if(handlers.onStatus) handlers.onStatus(event || {});
        });
        await listen('speechHeard', event => {
          if(handlers.onHeard) handlers.onHeard(event || {});
        });
        const started = await audio.startRecognition({language:lang(language)});
        if(started && started.missingModel){
          if(handlers.onError) handlers.onError('model_missing');
          return false;
        }
        return !!(started && started.started);
      }catch(_){
        if(handlers.onError) handlers.onError('recognition');
        return false;
      }
    },

    stopRecognition,

    async modelStatus(language){
      if(!audio || !audio.getRecognitionModelStatus){
        return {installed:false, unavailable:true, language};
      }
      try{ return await audio.getRecognitionModelStatus({language:lang(language)}); }
      catch(_){ return {installed:false, unavailable:true, language}; }
    },

    async downloadModel(language, onStatus){
      if(!audio || !audio.prepareRecognitionModel) return false;
      try{
        // The native side owns the transfer so it survives screen changes and backgrounding.
        if(options.beforeModelDownload){
          try{ await options.beforeModelDownload(); }catch(_){}
        }
        const result = await audio.prepareRecognitionModel({language:lang(language)});
        const installed = !!(result && result.installed);
        if(onStatus) onStatus({
          language:lang(language),
          status:installed ? 'ready' : 'queued',
          progress:installed ? 100 : 0,
          installed,
          sizeMb:result ? result.sizeMb : undefined
        });
        return !!result;
      }catch(_){ return false; }
    },

    async deleteModel(language){
      if(!audio || !audio.deleteRecognitionModel) return false;
      try{
        const result = await audio.deleteRecognitionModel({language:lang(language)});
        return !!(result && result.deleted);
      }catch(_){ return false; }
    }
  };
}
