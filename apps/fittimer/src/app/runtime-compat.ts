import type { ExternalStorage } from '@appbase/core/storage.js';
import type { Platform } from '@appbase/core/observability.js';
import type { RuntimeAppConfig } from '@appbase/types/core.js';

let runtimeBuild = '';

function externalStorage(): ExternalStorage | null {
  try{
    const candidate = (window as Window & {storage?: ExternalStorage}).storage;
    if(!candidate) return null;
    if(typeof candidate.get !== 'function') return null;
    if(typeof candidate.set !== 'function') return null;
    if(typeof candidate.delete !== 'function') return null;
    return candidate;
  }catch(_){
    return null;
  }
}

function runtimePlatform(): Platform {
  try{
    const candidate = (window as Window & {
      Capacitor?: {getPlatform?: () => string}
    }).Capacitor;
    if(candidate && typeof candidate.getPlatform === 'function'){
      const platform = candidate.getPlatform();
      if(platform === 'android' || platform === 'ios') return platform;
    }
  }catch(_){}
  return 'web';
}

function setRuntimeBuild(value: unknown): void {
  runtimeBuild = String(value || '');
}

function getRuntimeBuild(): string {
  return runtimeBuild;
}

/* Public runtime config (app.config.js → window.APP_CONFIG). The product runtime reads
   it only here, so a missing or partial config degrades to an empty object. */
function runtimeConfig(): Partial<RuntimeAppConfig> {
  try{
    return (window as Window & {APP_CONFIG?: Readonly<RuntimeAppConfig>}).APP_CONFIG || {};
  }catch(_){
    return {};
  }
}

type NativeBridge = Record<string, any> & { isNative?: boolean };

function nativeBridge(): NativeBridge | null {
  try{
    return ((window as Window & {FitNative?: NativeBridge}).FitNative) || null;
  }catch(_){
    return null;
  }
}

export const appRuntimeCompat = Object.freeze({
  externalStorage,
  nativeBridge,
  runtimePlatform,
  runtimeConfig,

  setBuild(value: unknown){
    setRuntimeBuild(value);
  },

  build(){
    return getRuntimeBuild();
  },

  isNative(){
    const candidate = nativeBridge();
    return !!(candidate && candidate.isNative);
  },

  hasNative(...methods: string[]){
    const candidate = nativeBridge();
    return !!(candidate && candidate.isNative
      && methods.every(name => typeof candidate[name] === 'function'));
  },

  hapticHandled(){
    const candidate = nativeBridge();
    try{ return !!(candidate && typeof candidate.haptic === 'function' && candidate.haptic()); }
    catch(_){ return false; }
  },

  async shareFile(blob: Blob, fileName: string, title?: string, text?: string){
    const candidate = nativeBridge();
    if(!candidate || !candidate.isNative || typeof candidate.shareFile !== 'function') return false;
    try{ return !!(await candidate.shareFile(blob, fileName, title, text)); }
    catch(_){ return false; }
  },

  setSystemTheme(light: boolean){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.setSystemTheme !== 'function') return false;
    try{ candidate.setSystemTheme(!!light); return true; }
    catch(_){ return false; }
  },

  async openExternal(url: string){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.openExternal !== 'function') return false;
    try{ return !!(await candidate.openExternal(url)); }
    catch(_){ return false; }
  },

  async getAppInfo(){
    const candidate = nativeBridge();
    if(!candidate || !candidate.isNative || typeof candidate.getAppInfo !== 'function') return null;
    try{ return await candidate.getAppInfo(); }
    catch(_){ return null; }
  },

  async biometricStatus(){
    const candidate = nativeBridge();
    if(!candidate || !candidate.isNative || typeof candidate.biometricStatus !== 'function'){
      return {available:false, reason:'unsupported'};
    }
    try{ return await candidate.biometricStatus(); }
    catch(_){ return {available:false, reason:'temporarily_unavailable'}; }
  },

  async authenticateBiometric(options?: unknown){
    const candidate = nativeBridge();
    if(!candidate || !candidate.isNative || typeof candidate.authenticateBiometric !== 'function'){
      return {ok:false, error:'unsupported'};
    }
    try{ return await candidate.authenticateBiometric(options || {}); }
    catch(_){ return {ok:false, error:'temporarily_unavailable'}; }
  },

  async requestNotifications(){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.requestNotifications !== 'function') return false;
    try{ return !!(await candidate.requestNotifications()); }
    catch(_){ return false; }
  },

  async registerRemotePush(requestPermission: boolean){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.registerRemotePush !== 'function') return false;
    try{ return !!(await candidate.registerRemotePush(!!requestPermission)); }
    catch(_){ return false; }
  },

  async syncWorkoutNotifications(items: unknown){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.syncWorkoutNotifications !== 'function') return false;
    try{ return !!(await candidate.syncWorkoutNotifications(items)); }
    catch(_){ return false; }
  },

  async cancelRest(){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.cancelRest !== 'function') return false;
    try{ await candidate.cancelRest(); return true; }
    catch(_){ return false; }
  },

  async updateWorkoutState(payload?: unknown){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.updateWorkoutState !== 'function') return false;
    try{ return !!(await candidate.updateWorkoutState(payload || {})); }
    catch(_){ return false; }
  },

  async clearWorkoutState(){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.clearWorkoutState !== 'function') return false;
    try{ return !!(await candidate.clearWorkoutState()); }
    catch(_){ return false; }
  },

  async requestReview(){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.requestReview !== 'function') return false;
    try{ return !!(await candidate.requestReview()); }
    catch(_){ return false; }
  },

  offlineVoice(){
    const candidate = nativeBridge();
    return !!(candidate && candidate.offlineVoice);
  },

  async getVoiceModelStatus(language?: string){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.getVoiceModelStatus !== 'function'){
      return {installed:false, unavailable:true, language:language || 'ru'};
    }
    try{ return await candidate.getVoiceModelStatus(language); }
    catch(_){ return {installed:false, unavailable:true, language:language || 'ru'}; }
  },

  async listTtsVoices(){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.listTtsVoices !== 'function') return [];
    try{
      const list = await candidate.listTtsVoices();
      return Array.isArray(list) ? list : [];
    }catch(_){ return []; }
  },

  async downloadVoiceModel(language: string, onStatus?: (...args: any[]) => unknown){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.downloadVoiceModel !== 'function') return false;
    try{ return !!(await candidate.downloadVoiceModel(language, onStatus)); }
    catch(_){ return false; }
  },

  async startVoiceRecognition(
    onResult?: (...args: any[]) => unknown,
    onError?: (...args: any[]) => unknown,
    onStatus?: (...args: any[]) => unknown,
    language?: string
  ){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.startVoiceRecognition !== 'function') return false;
    try{ return !!(await candidate.startVoiceRecognition(onResult, onError, onStatus, language)); }
    catch(_){ return false; }
  },

  async speak(text: string, options?: unknown){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.speak !== 'function') return false;
    try{ return !!(await candidate.speak(text, options || {})); }
    catch(_){ return false; }
  },

  async stopVoiceRecognition(){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.stopVoiceRecognition !== 'function') return false;
    try{ await candidate.stopVoiceRecognition(); return true; }
    catch(_){ return false; }
  },

  async stopSpeaking(){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.stopSpeaking !== 'function') return false;
    try{ await candidate.stopSpeaking(); return true; }
    catch(_){ return false; }
  },

  consumeProgramLink(){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.consumeProgramLink !== 'function') return '';
    try{ return String(candidate.consumeProgramLink() || ''); }
    catch(_){ return ''; }
  },

  consumeWorkoutResume(){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.consumeWorkoutResume !== 'function') return false;
    try{ return !!candidate.consumeWorkoutResume(); }
    catch(_){ return false; }
  },

  async installUpdate(url: string, expectedVersionCode?: number){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.installUpdate !== 'function') return {status:'unsupported'};
    try{ return await candidate.installUpdate(url, expectedVersionCode); }
    catch(_){ return {status:'error'}; }
  },

  async cancelUpdate(){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.cancelUpdate !== 'function') return false;
    try{ return !!(await candidate.cancelUpdate()); }
    catch(_){ return false; }
  },

  async getUpdateState(){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.getUpdateState !== 'function') return {running:false, status:'idle'};
    try{ return await candidate.getUpdateState(); }
    catch(_){ return {running:false, status:'idle'}; }
  },

  async resumeUpdateInstall(expectedVersionCode?: number){
    const candidate = nativeBridge();
    if(!candidate || typeof candidate.resumeUpdateInstall !== 'function') return {status:'unsupported'};
    try{ return await candidate.resumeUpdateInstall(expectedVersionCode); }
    catch(_){ return {status:'error'}; }
  }
});
