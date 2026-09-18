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

  function installNativeOverrides(){
    if(!native || !fitAudio) return;

    // WebView может отказать getUserMedia из-за расширенных constraints даже при
    // выданном Android-разрешении. Сначала подтверждаем runtime permission, затем
    // повторяем запрос с audio:true.
    try{
      const media = navigator.mediaDevices;
      if(media && media.getUserMedia && !media.__fitTimerWrapped){
        const originalGetUserMedia = media.getUserMedia.bind(media);
        media.getUserMedia = async constraints=>{
          if(constraints && constraints.audio && !(await requestMicrophone())){
            throw new DOMException('Microphone permission denied', 'NotAllowedError');
          }
          try{ return await originalGetUserMedia(constraints); }
          catch(error){
            if(constraints && constraints.audio !== true){
              return originalGetUserMedia({audio:true});
            }
            throw error;
          }
        };
        media.__fitTimerWrapped = true;
      }
    }catch(_){}

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
        text=>{
          if(typeof lastAppSoundT === 'undefined' || Date.now() >= lastAppSoundT){
            if(typeof applyVoiceCommand === 'function') applyVoiceCommand(text);
          }
        },
        error=>{
          if(typeof voiceActive !== 'undefined') voiceActive = false;
          if(error === 'permission'){
            if(typeof voiceWanted !== 'undefined') voiceWanted = false;
            if(typeof syncPrefs === 'function') syncPrefs();
            if(typeof appAlert === 'function') appAlert('Нет доступа к микрофону. Разреши микрофон для Fit Timer в настройках приложения.');
          }
        }
      ).then(ok=>{ if(!ok && typeof voiceActive !== 'undefined') voiceActive = false; });
    };
    window.stopListening = function(){
      if(typeof stopRequested !== 'undefined') stopRequested = true;
      if(typeof voiceActive !== 'undefined') voiceActive = false;
      stopVoiceRecognition();
      if(typeof resetVoiceDedup === 'function') resetVoiceDedup();
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

  // Два старых обработчика считают голос недоступным, если Web Speech API нет.
  // В capture-фазе пропускаем их и включаем нативный режим сами.
  document.addEventListener('click', event=>{
    if(!native || !fitAudio) return;
    const target = event.target.closest('[data-hf="voice"]');
    if(!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(typeof setHfMode === 'function') setHfMode('voice');
    const modal = document.getElementById('hfModal');
    if(modal && target.closest('#hfModal')) modal.classList.remove('open');
  }, true);

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installNativeOverrides, {once:true});
  else installNativeOverrides();

  window.FitNative = Object.freeze({
    isNative: native,
    requestNotifications,
    scheduleRest,
    cancelRest,
    haptic,
    workoutHaptic,
    requestMicrophone,
    speak,
    startVoiceRecognition,
    stopVoiceRecognition
  });
})();
