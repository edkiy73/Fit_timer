/* Тонкий мост к нативным функциям. В обычном браузере все методы безопасно
   переходят на web fallback, поэтому index.html остаётся общей кодовой базой. */
(function(){
  const cap = window.Capacitor;
  const native = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  const plugins = (cap && cap.Plugins) || {};
  const fitAudio = plugins.FitAudio;
  const REST_NOTIFICATION_ID = 901001;
  let speechResultHandle = null;
  let speechErrorHandle = null;

  async function requestNotifications(){
    if(!native || !plugins.LocalNotifications) return false;
    try{
      const current = await plugins.LocalNotifications.checkPermissions();
      const result = current.display === 'prompt'
        ? await plugins.LocalNotifications.requestPermissions()
        : current;
      return result.display === 'granted';
    }catch(_){ return false; }
  }

  async function scheduleRest(seconds, body){
    if(!native || !plugins.LocalNotifications || !(seconds > 0)) return false;
    if(!(await requestNotifications())) return false;
    try{
      let exact = true;
      if(cap.getPlatform && cap.getPlatform() === 'android'){
        const setting = await plugins.LocalNotifications.checkExactNotificationSetting();
        exact = setting.exact_alarm === 'granted';
      }
      await plugins.LocalNotifications.cancel({notifications:[{id:REST_NOTIFICATION_ID}]});
      await plugins.LocalNotifications.schedule({notifications:[{
        id: REST_NOTIFICATION_ID,
        title: 'Отдых закончен',
        body: body || 'Пора переходить к следующему подходу.',
        schedule: {at: new Date(Date.now() + Math.ceil(seconds * 1000))},
        isExactNotification: exact,
        sound: null,
        smallIcon: 'ic_stat_fittimer',
        iconColor: '#7047EB',
        extra: {kind:'rest-finished'}
      }]});
      return true;
    }catch(_){ return false; }
  }

  async function cancelRest(){
    if(!native || !plugins.LocalNotifications) return;
    try{ await plugins.LocalNotifications.cancel({notifications:[{id:REST_NOTIFICATION_ID}]}); }catch(_){}
  }

  function haptic(){
    if(!native || !plugins.Haptics) return false;
    try{ plugins.Haptics.impact({style:'LIGHT'}); return true; }catch(_){ return false; }
  }

  async function requestMicrophone(){
    if(!native) return true;
    if(!fitAudio) return false;
    try{
      const result = await fitAudio.requestMicrophone();
      return result.granted === true;
    }catch(_){ return false; }
  }

  async function speak(text){
    if(!native || !fitAudio) return false;
    try{
      const result = await fitAudio.speak({text: String(text || ''), locale: 'ru-RU'});
      return result.spoken === true;
    }catch(_){ return false; }
  }

  async function stopVoiceRecognition(){
    if(!native || !fitAudio) return;
    try{ await fitAudio.stopRecognition(); }catch(_){}
    try{ if(speechResultHandle){ await speechResultHandle.remove(); speechResultHandle = null; } }catch(_){}
    try{ if(speechErrorHandle){ await speechErrorHandle.remove(); speechErrorHandle = null; } }catch(_){}
  }

  async function startVoiceRecognition(onResult, onError){
    if(!native || !fitAudio) return false;
    await stopVoiceRecognition();
    if(!(await requestMicrophone())){
      if(onError) onError('permission');
      return false;
    }
    try{
      speechResultHandle = await fitAudio.addListener('speechResult', event=>{
        if(onResult && event && event.text) onResult(event.text);
      });
      speechErrorHandle = await fitAudio.addListener('speechError', event=>{
        if(onError) onError((event && event.error) || 'recognition');
      });
      await fitAudio.startRecognition({locale: 'ru-RU'});
      return true;
    }catch(_){
      if(onError) onError('recognition');
      return false;
    }
  }

  window.FitNative = Object.freeze({
    isNative: native,
    requestNotifications,
    scheduleRest,
    cancelRest,
    haptic,
    requestMicrophone,
    speak,
    startVoiceRecognition,
    stopVoiceRecognition
  });
})();
