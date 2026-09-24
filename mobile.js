/* Тонкий мост к нативным функциям. В обычном браузере все методы безопасно
   переходят на web fallback, поэтому index.html остаётся общей кодовой базой. */
(function(){
  const cap = window.Capacitor;
  const native = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  if(native) document.documentElement.classList.add('native-app');
  const plugins = (cap && cap.Plugins) || {};
  const fitAudio = plugins.FitAudio;
  const fitSystem = plugins.FitSystem;
  const fitBiometric = plugins.FitBiometric;
  const fitWorkout = plugins.FitWorkout;
  const pushNotifications = plugins.PushNotifications;
  const REST_NOTIFICATION_ID = 901001;
  const PLAN_NOTIFICATION_MIN = 902000;
  const PLAN_NOTIFICATION_MAX = 902999;
  let speechResultHandle = null;
  let speechErrorHandle = null;
  let speechHeardHandle = null;
  let speechStatusHandle = null;
  let remotePushListenersInstalled = false;
  let pendingProgramLink = '';
  let pendingWorkoutResume = false;
  let appInactiveAt = 0;
  let updateProgressHandle = null;

  function programIdFromAppUrl(value){
    try{
      const url = new URL(String(value || ''));
      const configured = window.FIT_TIMER_CONFIG && window.FIT_TIMER_CONFIG.publicAppUrl;
      const expected = new URL(configured || 'https://fittimer99.vercel.app');
      if(url.protocol !== 'https:' || url.host !== expected.host) return '';
      const match = url.pathname.match(/^\/p\/([0-9a-z]{4,16})\/?$/);
      return match ? match[1] : '';
    }catch(_){ return ''; }
  }

  function rememberProgramLink(value){
    const id = programIdFromAppUrl(value);
    if(!id) return false;
    pendingProgramLink = id;
    try{ window.dispatchEvent(new CustomEvent('fitProgramLink', {detail:{id, url:String(value || '')}})); }catch(_){}
    return true;
  }

  function consumeProgramLink(){
    const id = pendingProgramLink;
    pendingProgramLink = '';
    return id;
  }

  function isWorkoutResumeUrl(value){
    try{
      const url = new URL(String(value || ''));
      return url.protocol === 'fittimer:' && url.host === 'workout' && /^\/resume\/?$/.test(url.pathname);
    }catch(_){ return false; }
  }

  function rememberWorkoutResume(value){
    if(!isWorkoutResumeUrl(value)) return false;
    pendingWorkoutResume = true;
    try{ window.dispatchEvent(new CustomEvent('fitWorkoutResumeRequest')); }catch(_){}
    return true;
  }

  function consumeWorkoutResume(){
    const value = pendingWorkoutResume;
    pendingWorkoutResume = false;
    return value;
  }

  function rememberAppUrl(value){
    if(rememberWorkoutResume(value)) return true;
    return rememberProgramLink(value);
  }

  if(native && plugins.App && plugins.App.addListener){
    try{ plugins.App.addListener('appUrlOpen', event=> rememberAppUrl(event && event.url)); }catch(_){}
    if(plugins.App.getLaunchUrl){
      try{ plugins.App.getLaunchUrl().then(result=> rememberAppUrl(result && result.url)).catch(()=>{}); }catch(_){}
    }
  }
  function installRemotePushListeners(){
    if(remotePushListenersInstalled||!native||!pushNotifications||!pushNotifications.addListener)return;
    remotePushListenersInstalled=true;
    pushNotifications.addListener('registration',token=>{try{window.dispatchEvent(new CustomEvent('fitRemotePushToken',{detail:{token:String((token&&token.value)||''),platform:(cap.getPlatform&&cap.getPlatform())||''}}));}catch(_){}});
    pushNotifications.addListener('pushNotificationActionPerformed',event=>{const n=(event&&event.notification)||{};try{window.dispatchEvent(new CustomEvent('fitNotificationAction',{detail:{notification:{extra:n.data||{},data:n.data||{}},remote:true}}));}catch(_){}});
  }
  async function registerRemotePush(requestPermission){
    if(!native||!pushNotifications)return false;
    installRemotePushListeners();
    try{let p=await pushNotifications.checkPermissions();if(p.receive==='prompt'&&requestPermission)p=await pushNotifications.requestPermissions();if(p.receive!=='granted')return false;await pushNotifications.register();return true;}catch(_){return false;}
  }

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

  async function syncWorkoutNotifications(items){
    if(!native || !plugins.LocalNotifications) return false;
    try{
      const permission = await plugins.LocalNotifications.checkPermissions();
      if(permission.display !== 'granted') return false;
      const pending = await plugins.LocalNotifications.getPending();
      const old = ((pending && pending.notifications) || [])
        .filter(n => n.id >= PLAN_NOTIFICATION_MIN && n.id <= PLAN_NOTIFICATION_MAX)
        .map(n => ({id:n.id}));
      if(old.length) await plugins.LocalNotifications.cancel({notifications:old});
      let exact = true;
      if(cap.getPlatform && cap.getPlatform() === 'android'){
        const setting = await plugins.LocalNotifications.checkExactNotificationSetting();
        exact = setting.exact_alarm === 'granted';
      }
      const list = (Array.isArray(items) ? items : []).slice(0, 60).map((item, i) => ({
        id: PLAN_NOTIFICATION_MIN + i,
        title: String(item.title || 'Fit Timer'),
        body: String(item.body || ''),
        largeBody: String(item.largeBody || item.body || ''),
        schedule: {at:new Date(item.at), allowWhileIdle:true},
        isExactNotification: exact,
        smallIcon: 'ic_stat_fittimer',
        iconColor: '#7047EB',
        extra: Object.assign({kind:'fittimer-notification'}, item.extra || {})
      })).filter(n => !isNaN(n.schedule.at.getTime()) && n.schedule.at.getTime() > Date.now() + 10000);
      if(list.length) await plugins.LocalNotifications.schedule({notifications:list});
      return true;
    }catch(_){ return false; }
  }

  async function updateWorkoutState(payload){
    if(!native || !fitWorkout || !fitWorkout.update) return false;
    try{ await fitWorkout.update(payload || {}); return true; }catch(_){ return false; }
  }

  async function clearWorkoutState(){
    if(!native || !fitWorkout || !fitWorkout.clear) return false;
    try{ await fitWorkout.clear(); return true; }catch(_){ return false; }
  }

  async function setSystemTheme(light){
    if(!native || !fitSystem) return false;
    try{ await fitSystem.setTheme({light:!!light}); return true; }catch(_){ return false; }
  }

  function blobBase64(blob){
    return new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = ()=> resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = ()=> reject(reader.error || new Error('file_read_failed'));
      reader.readAsDataURL(blob);
    });
  }

  // WebView не умеет надёжно передавать Blob через navigator.share. Кладём файл
  // во временный Cache и отдаём его системному Android/iOS Share Sheet.
  async function shareFile(blob, fileName, title, text){
    if(!native || !plugins.Filesystem || !plugins.Share || !blob) return false;
    try{
      const safe = String(fileName || 'fittimer-file').replace(/[^\wа-яёА-ЯЁ.\-]+/g, '-').slice(-100);
      const result = await plugins.Filesystem.writeFile({
        path: `fittimer-share-${Date.now()}-${safe}`,
        data: await blobBase64(blob),
        directory: 'CACHE'
      });
      await plugins.Share.share({
        title: title || 'Fit Timer',
        text: text || '',
        files: [result.uri],
        dialogTitle: 'Поделиться'
      });
      return true;
    }catch(_){ return false; }
  }

  // index.html исторически вызывает haptic на pointerdown почти всех кнопок.
  // В нативной оболочке считаем событие обработанным, но не вибрируем: иначе
  // pointerdown срабатывает даже когда жест превращается в скролл.
  function haptic(){
    return native;
  }

  function workoutHaptic(){
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
      const locale = (typeof voiceLang !== 'undefined' && voiceLang) ? voiceLang : 'ru-RU';
      const voice = (typeof savedVoiceURI !== 'undefined' && savedVoiceURI) ? savedVoiceURI : '';
      const result = await fitAudio.speak({text: String(text || ''), locale, voice});
      return result.spoken === true;
    }catch(_){ return false; }
  }

  async function stopSpeaking(){
    if(!native || !fitAudio) return;
    try{ await fitAudio.stopSpeaking(); }catch(_){}
  }

  async function stopVoiceRecognition(){
    if(!native || !fitAudio) return;
    try{ await fitAudio.stopRecognition(); }catch(_){}
    try{ if(speechResultHandle){ await speechResultHandle.remove(); speechResultHandle = null; } }catch(_){}
    try{ if(speechErrorHandle){ await speechErrorHandle.remove(); speechErrorHandle = null; } }catch(_){}
    try{ if(speechStatusHandle){ await speechStatusHandle.remove(); speechStatusHandle = null; } }catch(_){}
    try{ if(speechHeardHandle){ await speechHeardHandle.remove(); speechHeardHandle = null; } }catch(_){}
  }

  async function startVoiceRecognition(onResult, onError, onStatus){
    if(!native || !fitAudio) return false;
    await stopVoiceRecognition();
    if(!(await requestMicrophone())){
      if(onError) onError('permission');
      return false;
    }
    try{
      speechResultHandle = await fitAudio.addListener('speechResult', event=>{
        if(onResult && event && event.text) onResult(event.text, event);
      });
      speechErrorHandle = await fitAudio.addListener('speechError', event=>{
        if(onError) onError((event && event.error) || 'recognition');
      });
      speechStatusHandle = await fitAudio.addListener('speechStatus', event=>{
        if(onStatus) onStatus(event || {});
      });
      // что распознаватель услышал и во что это превратилось (в том числе «не
      // команда») — для проверки распознавания в настройках
      speechHeardHandle = await fitAudio.addListener('speechHeard', event=>{
        try{ window.dispatchEvent(new CustomEvent('fitVoiceHeard', {detail:event || {}})); }catch(_){}
      });
      const language = (typeof recognitionLang !== 'undefined' && recognitionLang) ? recognitionLang : 'ru';
      const started = await fitAudio.startRecognition({language});
      if(started && started.missingModel){
        if(onError) onError('model_missing');
        return false;
      }
      return !!(started && started.started);
    }catch(_){
      if(onError) onError('recognition');
      return false;
    }
  }

  async function getVoiceModelStatus(language){
    if(!native || !fitAudio) return {installed:false, unavailable:true, language};
    try{ return await fitAudio.getRecognitionModelStatus({language: language || 'ru'}); }
    catch(_){ return {installed:false, unavailable:true, language}; }
  }

  async function downloadVoiceModel(language, onStatus){
    if(!native || !fitAudio) return false;
    try{
      // Android WorkManager owns the transfer, so it keeps going when this screen
      // closes or the app goes to background. JS only observes status.
      try{ await requestNotifications(); }catch(_){}
      const result = await fitAudio.prepareRecognitionModel({language: language || 'ru'});
      if(onStatus) onStatus({
        language: language || 'ru',
        status: result && result.installed ? 'ready' : 'queued',
        progress: result && result.installed ? 100 : 0,
        installed: !!(result && result.installed),
        sizeMb: result && result.sizeMb
      });
      return !!result;
    }catch(_){ return false; }
  }

  async function deleteVoiceModel(language){
    if(!native || !fitAudio) return false;
    try{ const r = await fitAudio.deleteRecognitionModel({language:language || 'ru'}); return !!(r && r.deleted); }
    catch(_){ return false; }
  }

  async function listTtsVoices(){
    if(!native || !fitAudio) return [];
    try{ const r = await fitAudio.listVoices(); return (r && Array.isArray(r.voices)) ? r.voices : []; }
    catch(_){ return []; }
  }

  function installNativeOverrides(){
    installRemotePushListeners();
    if(native && plugins.LocalNotifications && plugins.LocalNotifications.addListener){
      try{
        plugins.LocalNotifications.addListener('localNotificationActionPerformed', event=>{
          try{ window.dispatchEvent(new CustomEvent('fitNotificationAction', {detail:event || {}})); }catch(_){}
        });
      }catch(_){}
    }
    if(!native || !fitAudio) return;

    // Системный Android TTS вместо ненадёжного speechSynthesis внутри WebView.
    window.speak = function(text, fallback, onDone){
      const done = ()=>{ if(onDone){ const fn = onDone; onDone = null; fn(); } };
      if(typeof soundOn !== 'undefined' && !soundOn){ done(); return; }
      if(typeof voiceVol !== 'undefined' && voiceVol <= 0){ if(fallback) fallback(); done(); return; }
      if(typeof musicMode !== 'undefined' && musicMode){ if(fallback) fallback(); done(); return; }
      if(typeof lastAppSoundT !== 'undefined') lastAppSoundT = Date.now() + 8000;
      speak(text).then(ok=>{
        if(typeof lastAppSoundT !== 'undefined') lastAppSoundT = Date.now() + 250;
        if(!ok && fallback) fallback();
        done();
      }).catch(()=>{ if(fallback) fallback(); done(); });
    };

    // Системный SpeechRecognizer вместо отсутствующего Web Speech API.
    window.startListening = function(){
      if(typeof voiceActive !== 'undefined' && voiceActive) return;
      if(typeof stopRequested !== 'undefined') stopRequested = false;
      if(typeof voiceActive !== 'undefined') voiceActive = true;
      startVoiceRecognition(
        (text,event)=>{
          if(typeof lastAppSoundT === 'undefined' || Date.now() >= lastAppSoundT){
            if(typeof applyVoiceCommand === 'function') applyVoiceCommand(event && event.kind ? {text, kind:event.kind} : text);
          }
        },
        error=>{
          if(typeof voiceActive !== 'undefined') voiceActive = false;
          if(error === 'permission'){
            if(typeof voiceWanted !== 'undefined') voiceWanted = false;
            if(typeof syncPrefs === 'function') syncPrefs();
            if(typeof appAlert === 'function') appAlert('Нет доступа к микрофону. Разреши микрофон для Fit Timer в настройках приложения.');
          }else if(error === 'model_missing'){
            if(typeof refreshVoicePackUI === 'function') refreshVoicePackUI();
          }else if(error === 'model'){
            if(typeof appAlert === 'function') appAlert('Не удалось запустить голосовое управление. Попробуй заново скачать голосовой пакет в настройках.');
          }
        },
        status=>{
          try{ window.dispatchEvent(new CustomEvent('fitVoiceModelStatus', {detail:status || {}})); }catch(_){}
        }
      ).then(ok=>{ if(!ok && typeof voiceActive !== 'undefined') voiceActive = false; });
    };
    window.stopListening = function(){
      if(typeof stopRequested !== 'undefined') stopRequested = true;
      if(typeof voiceActive !== 'undefined') voiceActive = false;
      const stopped = stopVoiceRecognition();
      if(typeof resetVoiceDedup === 'function') resetVoiceDedup();
      return stopped;
    };
    window.stopSpeech = function(){
      stopSpeaking();
      try{ if('speechSynthesis' in window) speechSynthesis.cancel(); }catch(_){}
    };

    // Автозавершение не связано с кнопкой, поэтому добавляем отдачу обёрткой.
    if(typeof window.finishWorkout === 'function'){
      const originalFinish = window.finishWorkout;
      window.finishWorkout = function(){ workoutHaptic(); return originalFinish.apply(this, arguments); };
    }
  }

  // Только реальные клики основных кнопок. Click не возникает после скролла.
  document.addEventListener('click', event=>{
    if(!native) return;
    const target = event.target.closest('#startResume, #startFresh, .pick-item, #btnDone, #btnSkip, #btnPrev, #btnPause, #btnResume');
    if(target && !target.disabled) workoutHaptic();
  }, true);

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installNativeOverrides, {once:true});
  else installNativeOverrides();

  if(native && fitSystem && fitSystem.addListener){
    try{
      updateProgressHandle = fitSystem.addListener('updateProgress', event=>{
        try{ window.dispatchEvent(new CustomEvent('fitUpdateProgress', {detail:event || {}})); }catch(_){}
      });
    }catch(_){}
  }

  // visibilitychange в WebView бывает запоздалым. Нативное событие приложения
  // немедленно освобождает микрофон, TTS, media loop, AudioContext и wake lock.
  if(native && plugins.App && plugins.App.addListener){
    plugins.App.addListener('appStateChange', event=>{
      const active = !!(event && event.isActive);
      if(!active){
        appInactiveAt = Date.now();
        try{ window.dispatchEvent(new CustomEvent('fitAppBackground')); }catch(_){}
        if(typeof window.stopListening === 'function') window.stopListening();
        else stopVoiceRecognition();
        stopSpeaking();
        try{ if(typeof stopHeadset === 'function') stopHeadset(); }catch(_){}
        try{ if(typeof releaseWake === 'function') releaseWake(); }catch(_){}
        try{ if(typeof audioCtx !== 'undefined' && audioCtx && audioCtx.state === 'running') audioCtx.suspend(); }catch(_){}
        return;
      }
      const awayMs = appInactiveAt ? Math.max(0, Date.now() - appInactiveAt) : 0;
      appInactiveAt = 0;
      try{ window.dispatchEvent(new CustomEvent('fitAppForeground', {detail:{awayMs}})); }catch(_){}
      try{
        const work = document.getElementById('scrWork');
        if(work && work.classList.contains('on')){
          if(typeof keepAwake === 'function') keepAwake();
          if(typeof startHandsFree === 'function') startHandsFree();
        }
        if(typeof window.syncNativeNotifications === 'function') window.syncNativeNotifications();
      }catch(_){}
    });
  }

  async function getAppInfo(){
    if(!native || !plugins.App || !plugins.App.getInfo) return null;
    try{
      const info=await plugins.App.getInfo();
      let distribution = '';
      if(fitSystem && fitSystem.getDistribution){
        try{
          const d = await fitSystem.getDistribution();
          distribution = String((d && d.channel) || '');
        }catch(_){}
      }
      return {
        version:String((info&&info.version)||''),
        build:Number((info&&info.build)||0)||0,
        distribution
      };
    }catch(_){ return null; }
  }

  async function openExternal(url){
    const value=String(url||'').trim();
    if(!value) return false;
    if(native && fitSystem && fitSystem.openExternal){
      try{ await fitSystem.openExternal({url:value}); return true; }catch(_){}
    }
    try{ window.open(value,'_blank','noopener'); return true; }catch(_){ return false; }
  }

  async function installUpdate(url, expectedVersionCode){
    if(!native || !fitSystem || !fitSystem.downloadUpdate) return {status:'unsupported'};
    try{
      return await fitSystem.downloadUpdate({
        url:String(url||''),
        expectedVersionCode:Math.max(0,Math.round(+expectedVersionCode||0))
      });
    }catch(_){ return {status:'error'}; }
  }

  // Состояние загрузки обновления хранит нативная сторона: интерфейс пересобирается
  // после сворачивания и должен продолжить показывать ту же загрузку, а не начать новую.
  async function getUpdateState(){
    if(!native || !fitSystem || !fitSystem.getUpdateState) return {running:false, status:'idle'};
    try{ return await fitSystem.getUpdateState(); }catch(_){ return {running:false, status:'idle'}; }
  }

  async function cancelUpdate(){
    if(!native || !fitSystem || !fitSystem.cancelUpdate) return false;
    try{ await fitSystem.cancelUpdate(); return true; }catch(_){ return false; }
  }

  async function resumeUpdateInstall(expectedVersionCode){
    if(!native || !fitSystem || !fitSystem.resumeUpdateInstall) return {status:'unsupported'};
    try{
      return await fitSystem.resumeUpdateInstall({
        expectedVersionCode:Math.max(0,Math.round(+expectedVersionCode||0))
      });
    }catch(_){ return {status:'error'}; }
  }

  async function requestReview(){
    if(!native || !fitSystem || !fitSystem.requestReview) return false;
    try{ await fitSystem.requestReview(); return true; }catch(_){ return false; }
  }

  async function biometricStatus(){
    if(!native || !fitBiometric || !fitBiometric.status) return {available:false, reason:'unsupported'};
    try{ return await fitBiometric.status(); }
    catch(_){ return {available:false, reason:'temporarily_unavailable'}; }
  }

  async function authenticateBiometric(options){
    if(!native || !fitBiometric || !fitBiometric.authenticate) return {ok:false, error:'unsupported'};
    try{ return await fitBiometric.authenticate(options || {}); }
    catch(_){ return {ok:false, error:'temporarily_unavailable'}; }
  }

  // The workout notification / Live Activity deliberately survives WebView process death.
  // App boot reconciles it against workoutSession after profile data is loaded, so a tap
  // can restore the interrupted workout instead of destroying the recovery surface here.
  window.FitNative = Object.freeze({
    isNative: native,
    getAppInfo,
    openExternal,
    installUpdate,
    resumeUpdateInstall,
    getUpdateState,
    cancelUpdate,
    requestReview,
    biometricStatus,
    authenticateBiometric,
    consumeProgramLink,
    consumeWorkoutResume,
    requestNotifications,
    registerRemotePush,
    scheduleRest,
    cancelRest,
    syncWorkoutNotifications,
    updateWorkoutState,
    clearWorkoutState,
    setSystemTheme,
    shareFile,
    haptic,
    workoutHaptic,
    requestMicrophone,
    speak,
    stopSpeaking,
    startVoiceRecognition,
    stopVoiceRecognition,
    getVoiceModelStatus,
    downloadVoiceModel,
    deleteVoiceModel,
    listTtsVoices,
    offlineVoice: native && !!fitAudio
  });
})();
