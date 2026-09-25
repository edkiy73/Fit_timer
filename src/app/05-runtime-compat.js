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
  }
});
