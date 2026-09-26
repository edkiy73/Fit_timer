import { createBridge } from '@appbase/core/mobile.js';
import { createTransport } from '@appbase/core/native-notifications.js';
import { createSpeech } from '@appbase/core/speech.js';
import { createCapabilities } from '@appbase/core/capabilities.js';

/* Тонкий мост к нативным функциям. В обычном браузере все методы безопасно
   переходят на web fallback, поэтому index.html остаётся общей кодовой базой. */
(function(){
  const cap = window.Capacitor;
  const native = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  if(native) document.documentElement.classList.add('native-app');
  const plugins = (cap && cap.Plugins) || {};
  // Product capability switches decide which native integrations are wired at all.
  const capabilities = createCapabilities(window.APP_CONFIG && window.APP_CONFIG.features);
  const fitAudio = capabilities.when('voice', plugins.FitAudio || null);
  const fitSystem = plugins.FitSystem;
  const fitBiometric = capabilities.when('biometrics', plugins.FitBiometric || null);
  const fitWorkout = plugins.FitWorkout;
  const pushNotifications = capabilities.when('notifications', plugins.PushNotifications || null);
  const localNotifications = capabilities.when('notifications', plugins.LocalNotifications || null);
  const mobileBridgeCore = createBridge({
        native,
        app:plugins.App || null,
        filesystem:capabilities.when('sharing', plugins.Filesystem || null),
        share:capabilities.when('sharing', plugins.Share || null),
        haptics:plugins.Haptics || null,
        system:fitSystem || null,
        biometric:fitBiometric || null,
        platform:()=> (cap.getPlatform && cap.getPlatform()) || 'web',
        openWeb:url=>{ try{ window.open(url,'_blank','noopener'); return true; }catch(_){ return false; } }
      });
  const nativeNotificationTransport = createTransport({
        native,
        local:localNotifications,
        push:pushNotifications || null,
        platform:()=> (cap.getPlatform && cap.getPlatform()) || 'web'
      });
  const REST_NOTIFICATION_ID = 901001;
  const PLAN_NOTIFICATION_MIN = 902000;
  const PLAN_NOTIFICATION_MAX = 902999;
  const WORKOUT_INACTIVITY_NOTIFICATION_ID = 903010;
  const WORKOUT_INACTIVITY_STATE_KEY = 'fitWorkoutInactivityV1';
  let remotePushListenersInstalled = false;
  let localNotificationListenersInstalled = false;
  let pendingProgramLink = '';
  let pendingWorkoutResume = false;
  let updateProgressHandle = null;

  function programIdFromAppUrl(value){
    try{
      const url = new URL(String(value || ''));
      const runtimeConfig = window.APP_CONFIG;
      const configured = runtimeConfig && runtimeConfig.publicAppUrl;
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

  if(mobileBridgeCore){
    mobileBridgeCore.onUrl(rememberAppUrl).catch(()=>{});
    mobileBridgeCore.launchUrl().then(url=>{ if(url) rememberAppUrl(url); }).catch(()=>{});
  }
  function installRemotePushListeners(){
    if(remotePushListenersInstalled||!native||!pushNotifications||!pushNotifications.addListener)return;
    remotePushListenersInstalled=true;
    pushNotifications.addListener('registration',token=>{try{window.dispatchEvent(new CustomEvent('fitRemotePushToken',{detail:{token:String((token&&token.value)||''),platform:(cap.getPlatform&&cap.getPlatform())||''}}));}catch(_){}});
    pushNotifications.addListener('pushNotificationActionPerformed',event=>{const n=(event&&event.notification)||{};try{window.dispatchEvent(new CustomEvent('fitNotificationAction',{detail:{notification:{extra:n.data||{},data:n.data||{}},remote:true}}));}catch(_){}});
  }

  function readWorkoutInactivityState(){
    try{
      const raw = JSON.parse(localStorage.getItem(WORKOUT_INACTIVITY_STATE_KEY) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    }catch(_){ return {}; }
  }

  function writeWorkoutInactivityState(value){
    try{ localStorage.setItem(WORKOUT_INACTIVITY_STATE_KEY, JSON.stringify(value || {})); }catch(_){}
  }

  function installLocalNotificationListeners(){
    const local = localNotifications;
    if(localNotificationListenersInstalled || !native || !local || !local.addListener) return;
    localNotificationListenersInstalled = true;
    local.addListener('localNotificationActionPerformed', event=>{
      const n = (event && event.notification) || {};
      const extra = n.extra || n.data || {};
      if(extra && extra.fitAction === 'resumeWorkout'){
        const st = readWorkoutInactivityState();
        if(!extra.sessionId || st.sessionId === extra.sessionId){
          st.fired = true;
          writeWorkoutInactivityState(st);
        }
        pendingWorkoutResume = true;
        try{ window.dispatchEvent(new CustomEvent('fitWorkoutResumeRequest')); }catch(_){}
        return;
      }
      try{ window.dispatchEvent(new CustomEvent('fitNotificationAction',{detail:{notification:{extra,data:extra},remote:false}})); }catch(_){}
    });
  }

  async function clearIosWorkoutInactivity(resetState){
    if(!nativeNotificationTransport || !cap.getPlatform || cap.getPlatform() !== 'ios') return;
    await nativeNotificationTransport.cancel([WORKOUT_INACTIVITY_NOTIFICATION_ID]);
    await nativeNotificationTransport.removeDelivered([WORKOUT_INACTIVITY_NOTIFICATION_ID]);
    if(resetState) writeWorkoutInactivityState({});
  }

  async function syncIosWorkoutInactivity(payload){
    if(!native || !localNotifications || !cap.getPlatform || cap.getPlatform() !== 'ios') return;
    installLocalNotificationListeners();
    const sessionId = String((payload && payload.sessionId) || '');
    const at = Math.max(0, Number(payload && payload.inactivityAt) || 0);
    if(!sessionId || !at){
      await clearIosWorkoutInactivity(false);
      return;
    }

    let st = readWorkoutInactivityState();
    if(st.sessionId !== sessionId) st = {sessionId, scheduledAt:0, fired:false};
    // If the previous deadline has already passed, that was this workout's one reminder.
    // Do not arm a second one when the user later returns and performs another action.
    if(!st.fired && Number(st.scheduledAt) > 0 && Date.now() >= Number(st.scheduledAt)) st.fired = true;

    await clearIosWorkoutInactivity(false);
    if(st.fired){
      writeWorkoutInactivityState(st);
      return;
    }

    st.scheduledAt = at;
    writeWorkoutInactivityState(st);
    if(at <= Date.now() + 1000) return;
    try{
      await localNotifications.schedule({notifications:[{
        id: WORKOUT_INACTIVITY_NOTIFICATION_ID,
        title: String(payload.inactivityTitle || 'Fit Timer'),
        body: String(payload.inactivityBody || ''),
        schedule: {at:new Date(at)},
        sound: '',
        interruptionLevel: 'active',
        extra: {kind:'workout-inactivity', fitAction:'resumeWorkout', sessionId}
      }]});
    }catch(_){}
  }
  async function registerRemotePush(requestPermission){
    if(!nativeNotificationTransport || !pushNotifications) return false;
    installRemotePushListeners();
    return nativeNotificationTransport.registerPush(!!requestPermission);
  }

  installLocalNotificationListeners();

  async function requestNotifications(){
    if(!nativeNotificationTransport) return false;
    return nativeNotificationTransport.localPermission(true);
  }

  async function scheduleRest(seconds, body){
    if(!native || !localNotifications || !(seconds > 0)) return false;
    if(!(await requestNotifications())) return false;
    try{
      const exact = await nativeNotificationTransport.exactAllowed();
      await nativeNotificationTransport.cancel([REST_NOTIFICATION_ID]);
      await nativeNotificationTransport.schedule([{
        id: REST_NOTIFICATION_ID,
        title: 'Отдых закончен',
        body: body || 'Пора переходить к следующему подходу.',
        schedule: {at: new Date(Date.now() + Math.ceil(seconds * 1000))},
        isExactNotification: exact,
        sound: null,
        smallIcon: 'ic_stat_fittimer',
        iconColor: '#7047EB',
        extra: {kind:'rest-finished'}
      }]);
      return true;
    }catch(_){ return false; }
  }

  async function cancelRest(){
    if(!nativeNotificationTransport) return;
    await nativeNotificationTransport.cancel([REST_NOTIFICATION_ID]);
  }

  async function syncWorkoutNotifications(items){
    if(!nativeNotificationTransport || !nativeNotificationTransport.hasLocal()) return false;
    if(!(await nativeNotificationTransport.localPermission(false))) return false;
    const exact = await nativeNotificationTransport.exactAllowed();
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
    return nativeNotificationTransport.replaceRange(
      PLAN_NOTIFICATION_MIN,
      PLAN_NOTIFICATION_MAX,
      list
    );
  }

  async function updateWorkoutState(payload){
    if(!native || !fitWorkout || !fitWorkout.update) return false;
    let ok = true;
    try{ await fitWorkout.update(payload || {}); }catch(_){ ok = false; }
    try{ await syncIosWorkoutInactivity(payload || {}); }catch(_){}
    return ok;
  }

  async function clearWorkoutState(){
    if(!native || !fitWorkout || !fitWorkout.clear) return false;
    try{ await clearIosWorkoutInactivity(true); }catch(_){}
    try{ await fitWorkout.clear(); return true; }catch(_){ return false; }
  }

  async function setSystemTheme(light){
    return mobileBridgeCore ? mobileBridgeCore.setTheme(!!light) : false;
  }

  // Product copy stays here; temporary-file and native Share mechanics live in Core.
  async function shareFile(blob, fileName, title, text){
    if(!mobileBridgeCore) return false;
    return mobileBridgeCore.shareBlob(blob, fileName, {
      title:title || 'Fit Timer',
      text:text || '',
      dialogTitle:'Поделиться'
    });
  }

  // index.html исторически вызывает haptic на pointerdown почти всех кнопок.
  // В нативной оболочке считаем событие обработанным, но не вибрируем: иначе
  // pointerdown срабатывает даже когда жест превращается в скролл.
  function haptic(){
    return native;
  }

  function workoutHaptic(){
    if(!mobileBridgeCore || !native) return false;
    mobileBridgeCore.impact('LIGHT').catch(()=>{});
    return true;
  }

  // Core owns the native speech transport; FitTimer keeps its default language and events.
  const speech = createSpeech({
        native,
        audio:fitAudio || null,
        defaultLanguage:'ru',
        defaultLocale:'ru-RU',
        beforeModelDownload:requestNotifications
      });

  async function startVoiceRecognition(onResult, onError, onStatus, language){
    return speech.startRecognition({
      onResult,
      onError,
      onStatus,
      // что распознаватель услышал и во что это превратилось (в том числе «не
      // команда») — для проверки распознавания в настройках
      onHeard:event=>{
        try{ window.dispatchEvent(new CustomEvent('fitVoiceHeard', {detail:event})); }catch(_){}
      }
    }, language);
  }

  function installNativeListeners(){
    installRemotePushListeners();
    if(native && localNotifications && localNotifications.addListener){
      try{
        localNotifications.addListener('localNotificationActionPerformed', event=>{
          try{ window.dispatchEvent(new CustomEvent('fitNotificationAction', {detail:event || {}})); }catch(_){}
        });
      }catch(_){}
    }
  }

  // Только реальные клики основных кнопок. Click не возникает после скролла.
  document.addEventListener('click', event=>{
    if(!native) return;
    const target = event.target.closest('#startResume, #startFresh, .pick-item, #btnDone, #btnSkip, #btnPrev, #btnPause, #btnResume');
    if(target && !target.disabled) workoutHaptic();
  }, true);

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installNativeListeners, {once:true});
  else installNativeListeners();

  if(native && fitSystem && fitSystem.addListener){
    try{
      updateProgressHandle = fitSystem.addListener('updateProgress', event=>{
        try{ window.dispatchEvent(new CustomEvent('fitUpdateProgress', {detail:event || {}})); }catch(_){}
      });
    }catch(_){}
  }

  // Core owns Capacitor lifecycle timing. FitTimer still owns what background/foreground means.
  if(mobileBridgeCore){
    mobileBridgeCore.onLifecycle(event=>{
      if(!event.active){
        try{ window.dispatchEvent(new CustomEvent('fitAppBackground')); }catch(_){}
        return;
      }
      try{ window.dispatchEvent(new CustomEvent('fitAppForeground', {detail:{awayMs:event.awayMs || 0}})); }catch(_){}
    }).catch(()=>{});
  }

  async function getAppInfo(){
    return mobileBridgeCore ? mobileBridgeCore.appInfo() : null;
  }

  async function openExternal(url){
    return mobileBridgeCore ? mobileBridgeCore.openExternal(url) : false;
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
    return mobileBridgeCore
      ? mobileBridgeCore.biometricStatus()
      : {available:false, reason:'unsupported'};
  }

  async function authenticateBiometric(options){
    return mobileBridgeCore
      ? mobileBridgeCore.authenticateBiometric(options || {})
      : {ok:false, error:'unsupported'};
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
    requestMicrophone:speech.requestMicrophone,
    speak:speech.speak,
    stopSpeaking:speech.stopSpeaking,
    startVoiceRecognition,
    stopVoiceRecognition:speech.stopRecognition,
    getVoiceModelStatus:speech.modelStatus,
    downloadVoiceModel:speech.downloadModel,
    deleteVoiceModel:speech.deleteModel,
    listTtsVoices:speech.listVoices,
    offlineVoice:speech.available()
  });
})();
