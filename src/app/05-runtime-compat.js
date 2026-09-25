/* ================= RUNTIME COMPATIBILITY BOUNDARY =================
   Legacy browser/native globals live here while the frontend is still concatenated.
   Product/domain code should depend on this adapter instead of reading globals directly. */
const appRuntimeCompat = Object.freeze({
  externalStorage(){
    try{
      const candidate = window.storage;
      if(!candidate) return null;
      if(typeof candidate.get !== 'function') return null;
      if(typeof candidate.set !== 'function') return null;
      if(typeof candidate.delete !== 'function') return null;
      return candidate;
    }catch(_){
      return null;
    }
  },

  nativeBridge(){
    try{ return window.FitNative || null; }
    catch(_){ return null; }
  },

  runtimePlatform(){
    try{
      const candidate = window.Capacitor;
      if(candidate && typeof candidate.getPlatform === 'function'){
        const platform = candidate.getPlatform();
        if(platform === 'android' || platform === 'ios') return platform;
      }
    }catch(_){}
    return 'web';
  },

  isNative(){
    const candidate = appRuntimeCompat.nativeBridge();
    return !!(candidate && candidate.isNative);
  },

  hasNative(...methods){
    const candidate = appRuntimeCompat.nativeBridge();
    return !!(candidate && candidate.isNative
      && methods.every(name => typeof candidate[name] === 'function'));
  },

  hapticHandled(){
    const candidate = appRuntimeCompat.nativeBridge();
    try{ return !!(candidate && typeof candidate.haptic === 'function' && candidate.haptic()); }
    catch(_){ return false; }
  },

  async shareFile(blob, fileName, title, text){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || !candidate.isNative || typeof candidate.shareFile !== 'function') return false;
    try{ return !!(await candidate.shareFile(blob, fileName, title, text)); }
    catch(_){ return false; }
  },

  setSystemTheme(light){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.setSystemTheme !== 'function') return false;
    try{ candidate.setSystemTheme(!!light); return true; }
    catch(_){ return false; }
  },

  async openExternal(url){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.openExternal !== 'function') return false;
    try{ return !!(await candidate.openExternal(url)); }
    catch(_){ return false; }
  },

  async getAppInfo(){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || !candidate.isNative || typeof candidate.getAppInfo !== 'function') return null;
    try{ return await candidate.getAppInfo(); }
    catch(_){ return null; }
  },

  async biometricStatus(){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || !candidate.isNative || typeof candidate.biometricStatus !== 'function'){
      return {available:false, reason:'unsupported'};
    }
    try{ return await candidate.biometricStatus(); }
    catch(_){ return {available:false, reason:'temporarily_unavailable'}; }
  },

  async authenticateBiometric(options){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || !candidate.isNative || typeof candidate.authenticateBiometric !== 'function'){
      return {ok:false, error:'unsupported'};
    }
    try{ return await candidate.authenticateBiometric(options || {}); }
    catch(_){ return {ok:false, error:'temporarily_unavailable'}; }
  },

  async requestNotifications(){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.requestNotifications !== 'function') return false;
    try{ return !!(await candidate.requestNotifications()); }
    catch(_){ return false; }
  },

  async registerRemotePush(requestPermission){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.registerRemotePush !== 'function') return false;
    try{ return !!(await candidate.registerRemotePush(!!requestPermission)); }
    catch(_){ return false; }
  },

  async syncWorkoutNotifications(items){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.syncWorkoutNotifications !== 'function') return false;
    try{ return !!(await candidate.syncWorkoutNotifications(items)); }
    catch(_){ return false; }
  },

  async cancelRest(){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.cancelRest !== 'function') return false;
    try{ await candidate.cancelRest(); return true; }
    catch(_){ return false; }
  },

  async updateWorkoutState(payload){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.updateWorkoutState !== 'function') return false;
    try{ return !!(await candidate.updateWorkoutState(payload || {})); }
    catch(_){ return false; }
  },

  async clearWorkoutState(){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.clearWorkoutState !== 'function') return false;
    try{ return !!(await candidate.clearWorkoutState()); }
    catch(_){ return false; }
  },

  async requestReview(){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.requestReview !== 'function') return false;
    try{ return !!(await candidate.requestReview()); }
    catch(_){ return false; }
  },

  offlineVoice(){
    const candidate = appRuntimeCompat.nativeBridge();
    return !!(candidate && candidate.offlineVoice);
  },

  async getVoiceModelStatus(language){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.getVoiceModelStatus !== 'function'){
      return {installed:false, unavailable:true, language:language || 'ru'};
    }
    try{ return await candidate.getVoiceModelStatus(language); }
    catch(_){ return {installed:false, unavailable:true, language:language || 'ru'}; }
  },

  async listTtsVoices(){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.listTtsVoices !== 'function') return [];
    try{
      const list = await candidate.listTtsVoices();
      return Array.isArray(list) ? list : [];
    }catch(_){ return []; }
  },

  async downloadVoiceModel(language, onStatus){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.downloadVoiceModel !== 'function') return false;
    try{ return !!(await candidate.downloadVoiceModel(language, onStatus)); }
    catch(_){ return false; }
  },

  async startVoiceRecognition(onResult, onError, onStatus){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.startVoiceRecognition !== 'function') return false;
    try{ return !!(await candidate.startVoiceRecognition(onResult, onError, onStatus)); }
    catch(_){ return false; }
  },

  async stopVoiceRecognition(){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.stopVoiceRecognition !== 'function') return false;
    try{ await candidate.stopVoiceRecognition(); return true; }
    catch(_){ return false; }
  },

  async stopSpeaking(){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.stopSpeaking !== 'function') return false;
    try{ await candidate.stopSpeaking(); return true; }
    catch(_){ return false; }
  },

  consumeProgramLink(){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.consumeProgramLink !== 'function') return '';
    try{ return String(candidate.consumeProgramLink() || ''); }
    catch(_){ return ''; }
  },

  consumeWorkoutResume(){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.consumeWorkoutResume !== 'function') return false;
    try{ return !!candidate.consumeWorkoutResume(); }
    catch(_){ return false; }
  },

  async installUpdate(url, expectedVersionCode){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.installUpdate !== 'function') return {status:'unsupported'};
    try{ return await candidate.installUpdate(url, expectedVersionCode); }
    catch(_){ return {status:'error'}; }
  },

  async cancelUpdate(){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.cancelUpdate !== 'function') return false;
    try{ return !!(await candidate.cancelUpdate()); }
    catch(_){ return false; }
  },

  async getUpdateState(){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.getUpdateState !== 'function') return {running:false, status:'idle'};
    try{ return await candidate.getUpdateState(); }
    catch(_){ return {running:false, status:'idle'}; }
  },

  async resumeUpdateInstall(expectedVersionCode){
    const candidate = appRuntimeCompat.nativeBridge();
    if(!candidate || typeof candidate.resumeUpdateInstall !== 'function') return {status:'unsupported'};
    try{ return await candidate.resumeUpdateInstall(expectedVersionCode); }
    catch(_){ return {status:'error'}; }
  }
});
