/* ================= СОБЫТИЯ ================= */
$('startMore').innerHTML = icon('more');
$('startMore').onclick = e => { e.stopPropagation(); toggleMenu($('startMenu')); };
$('progDescMore').onclick = ()=>{
  const box = $('progDescBox'), open = !box.classList.contains('open');
  box.classList.toggle('open', open);
  $('progDescMore').textContent = open ? t('common.collapse') : t('builder.showFull');
};
$('btnStart').onclick = async ()=>{
  // Отключённая программа не запрещена (её всё ещё можно запустить), но результат
  // нигде не осядет (см. countsToStats в finishWorkout) — предупреждаем ДО модалки
  // выбора способа, а не после сорока минут тренировки.
  if(!progActive(state.raw)){
    const go = await appConfirm(
      t('programs.disabledStart'),
      {okText: t('programs.startAnyway')}
    );
    if(!go) return;
  }
  const selectedPlanIdx = state.planIdx;
  state.current = customToProgram(state.raw, selectedPlanIdx);
  const sess = await sessionForProgram(state.raw.id);
  const planCount = normPlans(state.raw).length;
  const sessionPlanIdx = sess && planCount
    ? Math.min(Math.max(0, parseInt(sess.planIdx) || 0), planCount - 1)
    : selectedPlanIdx;
  state.startLoad = sess && Array.isArray(sess.load)
    ? sess.load
    : workoutLoadSnapshot(state.raw, sess ? sessionPlanIdx : selectedPlanIdx);
  // Для сводки незавершённой тренировки шаги нужно считать из того же варианта,
  // в котором она была сохранена. Сам экран программы при этом остаётся на варианте,
  // выбранном сейчас (например, на сегодняшнем дне).
  const selectedCurrent = state.current;
  if(sess) state.current = customToProgram(state.raw, sessionPlanIdx);
  const steps = buildSteps();
  state.current = selectedCurrent;
  setShown('startResume', !!sess);
  if(sess){
    const workDone = steps.slice(0, sess.stepIdx).filter(s => s.phase === 'work').length;
    const workAll = steps.filter(s => s.phase === 'work').length;
    $('startResumeSub').textContent =
      t('workout.resumeSummary',{done:workDone,all:workAll,age:sessionAgeText(sess.at)});
  }
  window.__pendingSession = sess ? {...sess, planIdx:sessionPlanIdx} : null;
  $('startModal').classList.add('open');
};
$('startModal').onclick = e => { if(e.target === $('startModal')) $('startModal').classList.remove('open'); };

async function resumeWorkoutFromNativeNotification(){
  // Warm process: the real workout engine is still alive. Do not rebuild the step or
  // restart its timer; simply return to the existing workout screen.
  if(state.live && state.steps && state.steps.length){
    show('scrWork');
    window.scrollTo(0, 0);
    return true;
  }

  const s = await loadSession();
  if(!s){
    appRuntimeCompat.clearWorkoutState();
    return false;
  }
  const p = customPrograms.find(x => x && x.id === s.pid);
  if(!p){
    await clearSession();
    appRuntimeCompat.clearWorkoutState();
    return false;
  }

  const plans = normPlans(p);
  const planIdx = plans.length
    ? Math.min(Math.max(0, parseInt(s.planIdx) || 0), plans.length - 1)
    : 0;
  state.raw = p;
  state.planIdx = planIdx;
  state.current = customToProgram(p, planIdx);
  state.startLoad = Array.isArray(s.load) ? s.load : workoutLoadSnapshot(p, planIdx);

  // Rebuild once to decide what should have happened while the WebView was dead.
  // We advance at most one step: only the timer that was already running had a native
  // deadline; the following step never started while JavaScript was gone.
  const preview = buildSteps();
  let stepIdx = Math.min(Math.max(0, parseInt(s.stepIdx) || 0), Math.max(0, preview.length - 1));
  let resumeDeadline = 0;
  const savedDeadline = Math.max(0, Number(s.stepDeadline) || 0);
  if(s.paused && Number(s.remaining) > 0){
    resumeDeadline = Date.now() + Math.max(1, Number(s.remaining)) * 1000;
  } else if(savedDeadline > 0){
    if(savedDeadline <= Date.now() && stepIdx < preview.length - 1) stepIdx++;
    else if(savedDeadline > Date.now()) resumeDeadline = savedDeadline;
  }

  startWorkout(stepIdx, s.elapsed, {skipPrep:true, resumeDeadline, sessionId:s.sessionId});
  return true;
}

$('startResume').onclick = ()=>{
  const s = window.__pendingSession;
  $('startModal').classList.remove('open');
  if(!s){ startWorkout(); return; }
  // stepIdx имеет смысл только внутри того варианта, где сессия была сохранена.
  // Сначала восстанавливаем вариант, затем строим его шаги в startWorkout().
  state.planIdx = s.planIdx;
  state.current = customToProgram(state.raw, state.planIdx);
  startWorkout(s.stepIdx, s.elapsed, {sessionId:s.sessionId});
};
$('startFresh').onclick = async ()=>{
  $('startModal').classList.remove('open');
  await clearSession();
  startWorkout();
};
$('startPick').onclick = ()=>{
  $('startModal').classList.remove('open');
  // временно собираем шаги, чтобы показать список упражнений
  state.steps = buildSteps();
  const list = $('pickList');
  list.innerHTML = '';
  workStepChoices().forEach(c => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pick-item';
    b.innerHTML = '<b></b>' + (c.meta ? `<small>${c.meta}</small>` : '');
    b.querySelector('b').textContent = c.label;
    b.onclick = async ()=>{
      $('pickStepModal').classList.remove('open');
      await clearSession();
      startWorkout(c.idx, 0);
    };
    list.appendChild(b);
  });
  $('pickStepModal').classList.add('open');
};
$('pickStepModal').onclick = e => { if(e.target === $('pickStepModal')) $('pickStepModal').classList.remove('open'); };
$('startBackTop').onclick = ()=> goTab(startFrom);
$('btnDone').onclick  = ()=>{ initAudio(); beep(990,.1); nextStep(); };
$('btnSkip').onclick  = nextStep;
$('btnPrev').onclick  = prevStep;
$('btnPrev').innerHTML = icon('chevL');
$('swapBadgeIcon').innerHTML = icon('chart'); // растущая кривая — «пора поднять планку»
$('btnExit').onclick  = exitWorkout;
$('exitModal').onclick = e => { if(e.target === $('exitModal')) $('exitModal').classList.remove('open'); };
$('exitSave').onclick = async ()=>{
  $('exitModal').classList.remove('open');
  await saveSession();
  tearDownWorkout();
  if(typeof syncNativeNotifications === 'function') syncNativeNotifications();
  appAlert(t('workout.sessionSaved'));
};
$('exitDrop').onclick = async ()=>{
  $('exitModal').classList.remove('open');
  await clearSession();
  tearDownWorkout();
};
$('btnPause').onclick = ()=> setPause(!state.paused);
/* ================= НАСТРОЙКИ =================
   Отдельный корневой экран без кнопки «Сохранить»: всё применяется сразу, поэтому
   внизу остаётся только док, а не вторая закреплённая полоса. */
const NOTIFICATION_PREFS_KEY = 'fitNotificationPrefsV1';
const NOTIFICATION_PREF_DEFAULTS = Object.freeze({
  workouts:true,
  trainer:true,
  progress:true,
  offers:true,
  emailNews:false,
  emailOffers:false
});
const notificationPreferenceStore = AppBaseNotifications.createPreferenceStore({
  key:NOTIFICATION_PREFS_KEY,
  defaults:NOTIFICATION_PREF_DEFAULTS,
  storage:localStorage
});
function getNotificationPrefs(){ return notificationPreferenceStore.get(); }
function syncNotificationSettings(){
  const prefs = getNotificationPrefs();
  const ids = {
    workouts:'notifWorkouts',
    trainer:'notifTrainer',
    progress:'notifProgress',
    offers:'notifOffers',
    emailNews:'emailNews',
    emailOffers:'emailOffers'
  };
  Object.keys(ids).forEach(key => {
    const btn = $(ids[key]);
    if(!btn) return;
    const on = prefs[key] !== false;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}
async function persistNotificationPrefs(prefs){
  try{ notificationPreferenceStore.set(prefs); }catch(_){}
  // Настройки относятся ко всему аккаунту, а не к отдельному профилю.
  // localStorage — быстрый локальный кэш; авторитетная копия для вошедшего аккаунта.
  try{
    if(account && account.email && typeof readAccountBucket === 'function'){
      const rec = await readAccountBucket();
      rec.bucket.notificationPrefs = Object.assign({}, NOTIFICATION_PREF_DEFAULTS, prefs);
      if(typeof bumpAccountMeta === 'function') bumpAccountMeta(rec.bucket, 'notificationPrefs');
      await writeAccountBucket(rec);
      if(typeof syncNotificationPrefsServer === 'function') syncNotificationPrefsServer('push').catch(()=>{});
      if(typeof queueAccountSync === 'function' && isPremium()) queueAccountSync();
    }
  }catch(_){}
}

async function setNotificationPref(key, value){
  const prefs = getNotificationPrefs();
  prefs[key] = !!value;
  await persistNotificationPrefs(prefs);
  syncNotificationSettings();
  if(['workouts','trainer','progress','offers'].includes(key) && value){
    const granted = await appRuntimeCompat.requestNotifications();
    if(!granted){
      prefs[key] = false;
      await persistNotificationPrefs(prefs);
      syncNotificationSettings();
      appAlert(t('notify.permissionDenied'));
      return;
    }
  }
  if(['workouts','trainer','progress','offers'].includes(key)
    && typeof syncNativeNotifications === 'function') syncNativeNotifications();
  if(['trainer','progress','offers'].includes(key)){
    if(value) syncRemotePushRegistration(true).catch(()=>{});
    else if(getNotificationPrefs().trainer===false&&getNotificationPrefs().progress===false&&getNotificationPrefs().offers===false) unregisterRemotePushServer().catch(()=>{});
  }
}
async function syncRemotePushRegistration(requestPermission){
  if(!account||!account.email||!account.syncToken)return false;
  const p=getNotificationPrefs(); if(p.trainer===false&&p.progress===false&&p.offers===false)return false;
  return appRuntimeCompat.registerRemotePush(!!requestPermission);
}
async function unregisterRemotePushServer(){
  if(!account||!account.email||!account.syncToken)return;
  const deviceId=await kvGet('deviceId'); if(!deviceId)return;
  try{await apiPost('/api/auth',{action:'push_device',email:account.email,deviceId,syncToken:account.syncToken,enabled:false});}catch(_){}
}
window.addEventListener('fitRemotePushToken',async e=>{
  const d=(e&&e.detail)||{};if(!d.token||!account||!account.email||!account.syncToken)return;
  let deviceId=await kvGet('deviceId');if(!deviceId){deviceId=newId();await kvSet('deviceId',deviceId);}
  try{await apiPost('/api/auth',{action:'push_device',email:account.email,deviceId,syncToken:account.syncToken,token:d.token,platform:d.platform,enabled:true});}catch(_){}
});
function syncSettingsForm(){
  // Настройки ИИ находятся в серверной админке; пользовательских ключей больше нет.
  syncNotificationSettings();
}
window.addEventListener('fitNotificationAction', e => {
  const n = e && e.detail && e.detail.notification;
  const extra = (n && n.extra) || (n && n.data) || (e && e.detail && e.detail.extra) || {};
  (async()=>{
    if(!account||!account.email||!account.syncToken)return;
    const deviceId=await kvGet('deviceId');if(!deviceId)return;
    try{await apiPost('/api/auth',{action:'notification_event',email:account.email,deviceId,
      syncToken:account.syncToken,event:'open',stage:String(extra.stage||extra.kind||'unknown')});}catch(_){}
  })();
  if(extra.stage === 'premium'){
    if(typeof openPremium === 'function') openPremium();
    return;
  }
  if(extra.stage === 'catalog-status'){
    goTab('scrTrainer');
    return;
  }
  if(extra.stage === 'trainer-program' && extra.linkId){
    if(typeof importProgramLink === 'function') importProgramLink(String(extra.linkId));
    return;
  }
  if(Array.isArray(extra.programIds) && extra.programIds.length){
    goTab('scrMenu');
    return;
  }
  if(extra.programId){
    const p = customPrograms.find(x => x && x.id === extra.programId);
    if(p){
      if(typeof openProgram === 'function') openProgram(p.id);
      else goTab('scrPrograms');
    }
  }
});
let settingsSaveT = 0;
function saveSettingsSoon(){
  clearTimeout(settingsSaveT);
  settingsSaveT = setTimeout(()=> saveUsers(), 350);
}
// Отсчёты живут в черновике профиля и уезжают в него по «Сохранить» — как имя и
// возраст. Раньше они правили текущего пользователя на лету прямо из настроек.
function readTimings(){
  if(!uDraft) return;
  const num = (id, def, lo, hi) => {
    const v = parseInt($(id).value);
    return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def;
  };
  uDraft.prepSec = num('uePrepSec', 5, 0, 30);
  uDraft.readySec = num('ueReadySec', 5, 0, 30);
  uDraft.sideSec = num('ueSideSec', 10, 3, 60);
}
async function nativeVoiceReady(){
  if(!appRuntimeCompat.offlineVoice()) return !!SR;
  const s = await appRuntimeCompat.getVoiceModelStatus(recognitionLang);
  return !!(s && s.installed);
}

async function chooseHandsFree(mode){
  if(mode === 'voice'){
    if(!appRuntimeCompat.offlineVoice() && !SR){
      appAlert(t('handsfree.unavailable'));
      return false;
    }
    if(appRuntimeCompat.offlineVoice() && !(await nativeVoiceReady())){
      await refreshVoicePackUI();
      appAlert(t('handsfree.packFirst'));
      return false;
    }
  }
  setHfMode(mode);
  if(mode === 'voice' && (await kvGet('voiceHint')) !== '1'){
    kvSet('voiceHint', '1');
    appAlert(t(appRuntimeCompat.offlineVoice() ? 'handsfree.readyNative' : 'handsfree.readyWeb'));
  }
  return true;
}

document.querySelectorAll('#ueLocaleSeg button').forEach(b => {
  b.onclick = async ()=>{
    const pref = normalizeLocalePreference(b.dataset.locale);
    if(uDraft) uDraft.locale = pref;
    syncUserForm();
    // Редактирование чужого профиля не должно внезапно переводить текущий интерфейс.
    if(!uDraft || uDraft.id !== currentUser) return;
    await setAppLocale(pref, {persist:false});
    await syncAccountLocale(appLocale);
    if((await kvGet('recognitionLangManual')) !== '1'){
      recognitionLang = appLocale;
      await kvSet('recognitionLang', recognitionLang);
      if(hfMode === 'voice') setHfMode('off');
      await refreshVoicePackUI();
    }
    syncHandsFreeUI();
    syncUserForm();
  };
});
window.addEventListener('appLocaleChanged', async ()=>{
  syncTtsLocaleToApp(true);
  syncHandsFreeUI();
  if(account && account.email) syncAccountLocale(appLocale);
  // Статический текст меняет applyI18n(), динамические карточки надо собрать заново.
  if(ROOT_TABS.includes(show._last)) prepTab(show._last);
  else if(show._last === 'scrStore'){
    await loadStoreServer();
    renderStoreFilters(); renderStore();
  } else if(show._last === 'scrStoreItem' && siItem){
    const id = siItem.id;
    await loadStoreServer();
    openStoreItem(id);
  }
});

document.querySelectorAll('#hfSeg button').forEach(b => {
  b.onclick = async ()=>{ await chooseHandsFree(b.dataset.hf); };
});
$('btnResume').onclick = ()=> setPause(false);
$('weightModalDone').onclick = ()=> commitWeightModal();

function clampVol(v, def){ v = Number(v); if(!isFinite(v)) v = def; return Math.max(0, Math.min(1, v)); }
function applyAudioFromUser(u){
  if(!u) return;
  prepSec = (u.prepSec == null) ? 5 : Math.max(0, Math.min(30, u.prepSec));
  readySec = (u.readySec == null) ? 5 : Math.max(0, Math.min(30, u.readySec));
  sideSec = (u.sideSec == null) ? 10 : Math.max(3, Math.min(60, u.sideSec));
  savedVoiceURI = u.voiceURI || '';
  voiceVol = clampVol((u.voiceVol == null ? 100 : u.voiceVol) / 100, 1);
  fxVol = clampVol((u.fxVol == null ? 100 : u.fxVol) / 100, 1);
  if(masterGain) masterGain.gain.value = fxVol;
  kvSet('voiceURI', savedVoiceURI);
}

function toggleSound(){
  soundOn = !soundOn;
  kvSet('soundOff', soundOn ? '0' : '1');
  if(!soundOn) stopSpeech();
  syncPrefs();
}

/* ---- один каскад «Звук → Голос / Звуки / Музыка», три места: старт (st), тренировка (snd), профиль (ue) ---- */
let fxVolMemory = 100; // громкость сигналов, которую помним, пока «Звуки» выключены

// заполняет каскад текущими значениями сессии (для st и snd — они делят одно состояние)
function fillLiveSoundCascade(p){
  $(p + 'SoundOn').classList.toggle('on', soundOn);
  $(p + 'VoiceOn').classList.toggle('on', voiceVol > 0);
  const fOn = fxVol > 0;
  if(fOn) fxVolMemory = Math.round(fxVol * 100);
  $(p + 'FxOn').classList.toggle('on', fOn);
  $(p + 'FxVol').value = fOn ? Math.round(fxVol * 100) : fxVolMemory;
  $(p + 'FxVolVal').textContent = (fOn ? Math.round(fxVol * 100) : fxVolMemory) + '%';
  $(p + 'Music').classList.toggle('on', musicMode);
  syncSoundCascade(p);
}

// сохраняет живое состояние в аудио-движок и в активный профиль
function persistLiveSound(){
  if(masterGain) masterGain.gain.value = fxVol;
  const u = curUser();
  if(u){ u.voiceVol = Math.round(voiceVol * 100); u.fxVol = Math.round(fxVol * 100); u.voiceURI = savedVoiceURI; saveUsers(); }
  kvSet('voiceURI', savedVoiceURI);
  syncPrefs();
}

// вешает обработчики на каскад с префиксом p (вызывается один раз на префикс, при старте)
function wireLiveSoundCascade(p){
  $(p + 'SoundOn').onclick = ()=>{
    soundOn = !soundOn;
    kvSet('soundOff', soundOn ? '0' : '1');
    if(!soundOn) stopSpeech();
    $(p + 'SoundOn').classList.toggle('on', soundOn);
    syncSoundCascade(p);
    syncPrefs();
  };
  $(p + 'VoiceOn').onclick = ()=>{
    const on = !$(p + 'VoiceOn').classList.contains('on');
    voiceVol = on ? 1 : 0;
    $(p + 'VoiceOn').classList.toggle('on', on);
    syncSoundCascade(p);
    persistLiveSound();
    if(on) speak(voiceIsEnglish() ? 'Voice enabled' : t('audio.voiceOn'));
  };
  $(p + 'FxOn').onclick = ()=>{
    const on = !$(p + 'FxOn').classList.contains('on');
    if(on){ fxVol = clampVol(fxVolMemory / 100, 1); }
    else { fxVolMemory = Math.round(fxVol * 100) || fxVolMemory; fxVol = 0; }
    $(p + 'FxOn').classList.toggle('on', on);
    $(p + 'FxVol').value = Math.round(fxVol * 100);
    $(p + 'FxVolVal').textContent = Math.round(fxVol * 100) + '%';
    syncSoundCascade(p);
    persistLiveSound();
    if(on) tick();
  };
  $(p + 'FxVol').oninput = e => {
    const v = parseInt(e.target.value) || 0;
    fxVol = clampVol(v / 100, 1);
    fxVolMemory = v || fxVolMemory;
    $(p + 'FxVolVal').textContent = v + '%';
    persistLiveSound();
    if(v > 0) tick();
  };
  $(p + 'Music').onclick = ()=>{
    musicMode = !musicMode;
    kvSet('musicMode', musicMode ? '1' : '0');
    if(musicMode) stopSpeech();
    $(p + 'Music').classList.toggle('on', musicMode);
    syncPrefs();
  };
}
function cloneSettingsBlock(sourceId, targetId, ids){
  const source=$(sourceId), target=$(targetId);
  if(!source || !target) return;
  target.innerHTML = source.innerHTML;
  Object.entries(ids || {}).forEach(([from,to])=>{
    const el=target.querySelector('#' + from);
    if(el) el.id=to;
  });
}
function mountWorkoutSettingsBlocks(){
  cloneSettingsBlock('soundSettingsCard','soundModalContent',{
    stSoundOn:'sndSoundOn', stSoundBox:'sndSoundBox', stVoiceOn:'sndVoiceOn',
    stVoiceChoice:'sndVoiceChoice', stMusic:'sndMusic', stFxOn:'sndFxOn',
    stFxField:'sndFxField', stFxVolVal:'sndFxVolVal', stFxVol:'sndFxVol'
  });
  cloneSettingsBlock('handsfreeSettingsCard','hfModalContent',{
    hfSeg:'hfModalSeg', hfHint:'hfModalHint', voicePackBox:'hfVoicePackBox',
    voiceRecLang:'hfVoiceRecLang', voicePackStatus:'hfVoicePackStatus',
    voicePackProgress:'hfVoicePackProgress', voicePackProgressBar:'hfVoicePackProgressBar',
    btnVoicePack:'btnHfVoicePack', btnHfCommands:'btnHfCommandsModal'
  });
}
mountWorkoutSettingsBlocks();
wireLiveSoundCascade('st');
wireLiveSoundCascade('snd');

async function availableTtsVoices(){
  if(appRuntimeCompat.hasNative('listTtsVoices')){
    const list = await appRuntimeCompat.listTtsVoices();
    return list.map(v=>({id:v.name,name:v.name,lang:v.language || '',network:!!v.network}));
  }
  try{
    return speechSynthesis.getVoices().map(v=>({id:v.voiceURI,name:v.name,lang:v.lang || '',network:!v.localService}));
  }catch(_){ return []; }
}

async function fillVoiceChoices(){
  const all = await availableTtsVoices();
  const prefix = voiceLang.toLowerCase().split('-')[0];
  const matching = all.filter(v=>String(v.lang).toLowerCase().startsWith(prefix));
  const local = matching.filter(v=>!v.network);
  const list = local.length ? local : matching;
  for(const id of ['stVoiceChoice','sndVoiceChoice']){
    const sel=$(id); if(!sel) continue;
    sel.innerHTML='';
    if(!list.length){
      const o=document.createElement('option'); o.value=''; o.textContent=t('audio.systemVoice'); sel.appendChild(o);
      continue;
    }
    list.forEach((v,i)=>{
      const o=document.createElement('option');
      o.value=v.id;
      o.textContent=(v.name || t('audio.voiceFallback',{count:i+1})) + (v.network ? ' · ' + t('audio.online') : '');
      sel.appendChild(o);
    });
    const exists=list.some(v=>v.id===savedVoiceURI);
    sel.value=exists ? savedVoiceURI : list[0].id;
    if(!exists){ savedVoiceURI=sel.value; await kvSet('voiceURI',savedVoiceURI); }
  }
  const u = curUser();
  if(u && u.voiceURI !== savedVoiceURI){
    u.voiceURI = savedVoiceURI;
    await saveUsers();
  }
}

async function syncTtsLocaleToApp(resetVoice){
  voiceLang = localeTag();
  await kvDel('voiceLangManual');
  await kvSet('voiceLang', voiceLang);
  if(resetVoice){
    savedVoiceURI='';
    await kvSet('voiceURI','');
  }
  await fillVoiceChoices();
}

let voicePackPollTimer = 0;
async function refreshVoicePackUI(progressEvent){
  const native = appRuntimeCompat.offlineVoice();
  ['voicePackBox','hfVoicePackBox'].forEach(id=>setShown(id,native));
  if(!native) return;
  if($('voiceRecLang')) $('voiceRecLang').value=recognitionLang;
  if($('hfVoiceRecLang')) $('hfVoiceRecLang').value=recognitionLang;

  let status = null;
  if(progressEvent && progressEvent.language === recognitionLang) status=progressEvent;
  else status = await appRuntimeCompat.getVoiceModelStatus(recognitionLang);

  const size = (status && status.sizeMb) || (recognitionLang==='en' ? 40 : 45);
  let label = status && status.installed ? t('voicepack.ready') : t('voicepack.downloadOnce',{size});
  let button = status && status.installed ? t('voicepack.downloaded') : t('voicepack.download');
  let disabled = !!(status && status.installed);
  if(status && status.status === 'queued'){
    label = t('voicepack.queued');
    button = t('voicepack.inQueue');
    disabled = true;
  }else if(status && status.status === 'downloading'){
    label = t('voicepack.downloading',{progress:Math.max(0,Math.min(100,status.progress||0))});
    button = t('voicepack.downloadingBtn');
    disabled = true;
  }else if(status && status.status === 'extracting'){
    label = t('voicepack.extracting');
    button = t('voicepack.almostReady');
    disabled = true;
  }else if(status && status.status === 'error'){
    label=t('voicepack.error');
    button=t('voicepack.retry');
    disabled=false;
  }
  setShown('btnVoiceTest', !!(status && status.installed));
  const pct = status && status.installed ? 100 : Math.max(0,Math.min(100,(status && status.progress)||0));
  const running = !!(status && ['queued','downloading','extracting'].includes(status.status));
  for(const row of [
    ['voicePackStatus','btnVoicePack','voicePackProgress','voicePackProgressBar'],
    ['hfVoicePackStatus','btnHfVoicePack','hfVoicePackProgress','hfVoicePackProgressBar']
  ]){
    const s=$(row[0]), b=$(row[1]), p=$(row[2]), bar=$(row[3]); if(!s||!b) continue;
    s.textContent=label;
    AppBaseUI.setBusy(b, running, {busyText:button, idleText:button, disabled});
    if(p) setShown(row[2], running);
    if(bar) bar.style.width = (status && status.status === 'queued' ? 3 : pct) + '%';
  }

  clearTimeout(voicePackPollTimer);
  if(status && ['queued','downloading','extracting'].includes(status.status)){
    voicePackPollTimer = setTimeout(()=>refreshVoicePackUI(), 800);
  }
}

async function downloadSelectedVoicePack(){
  if(!appRuntimeCompat.hasNative('downloadVoiceModel')) return;
  for(const id of ['btnVoicePack','btnHfVoicePack']){
    AppBaseUI.setBusy($(id), true, {busyText:t('voicepack.downloadingBtn')});
  }
  const ok=await appRuntimeCompat.downloadVoiceModel(recognitionLang, refreshVoicePackUI);
  await refreshVoicePackUI();
  if(!ok) appAlert(t('voicepack.startError'));
}

function openHfModal(){
  syncHandsFreeUI();
  if($('hfVoiceRecLang')) $('hfVoiceRecLang').value = recognitionLang;
  refreshVoicePackUI();
  $('hfModal').classList.add('open');
}
document.querySelectorAll('#hfModal [data-hf]').forEach(c => {
  c.onclick = async ()=>{
    const ok = await chooseHandsFree(c.dataset.hf);
    if(ok) $('hfModal').classList.remove('open');
  };
});
$('hfModal').onclick = e => { if(e.target === $('hfModal')) $('hfModal').classList.remove('open'); };

async function previewSelectedVoice(){
  const resumeRecognition = hfMode === 'voice' && $('scrWork').classList.contains('on');
  if(resumeRecognition){
    try{ await Promise.resolve(stopListening()); }catch(_){}
    await new Promise(resolve=>setTimeout(resolve, 100));
  }
  speak(t('audio.voiceSelected'), null, ()=>{
    if(!resumeRecognition) return;
    setTimeout(()=>{
      if(hfMode === 'voice' && $('scrWork').classList.contains('on')){
        voiceWanted = true;
        startListening();
      }
    }, 160);
  });
}
for(const id of ['stVoiceChoice','sndVoiceChoice']){
  if($(id)) $(id).onchange = async e=>{
    savedVoiceURI=e.target.value || '';
    persistLiveSound();
    for(const other of ['stVoiceChoice','sndVoiceChoice']) if($(other) && $(other)!==e.target) $(other).value=savedVoiceURI;
    await previewSelectedVoice();
  };
}
for(const id of ['voiceRecLang','hfVoiceRecLang']){
  if($(id)) $(id).onchange = async e=>{
    recognitionLang = e.target.value === 'en' ? 'en' : 'ru';
    kvSet('recognitionLang',recognitionLang);
    kvSet('recognitionLangManual','1');
    if(hfMode==='voice') setHfMode('off');
    await refreshVoicePackUI();
  };
}
if($('btnVoicePack')) $('btnVoicePack').onclick=downloadSelectedVoicePack;
if($('btnHfVoicePack')) $('btnHfVoicePack').onclick=downloadSelectedVoicePack;
window.addEventListener('fitVoiceModelStatus', e=>refreshVoicePackUI(e.detail));
$('btnSoundW').onclick = ()=>{ fillLiveSoundCascade('snd'); $('soundModal').classList.add('open'); };
$('soundModal').onclick = e => { if(e.target === $('soundModal')) $('soundModal').classList.remove('open'); };
$('btnMicW').onclick = openHfModal;
function openHfCommands(){
  $('hfModal').classList.remove('open');
  $('hfCommandsModal').classList.add('open');
}
['btnHfCommands','btnHfCommandsModal'].forEach(id => { if($(id)) $(id).onclick = openHfCommands; });
$('hfCommandsModal').onclick = e => { if(e.target === $('hfCommandsModal')) $('hfCommandsModal').classList.remove('open'); };

/* ---- проверка распознавания (Настройки → Управление без рук) ----
   Говоришь команду с привычного расстояния и видишь цепочку «что услышал
   телефон → что сделает приложение». Так понятно, где рвётся: микрофон не
   слышит (строк нет), слышит, но не то слово («не команда»), или слышит
   неуверенно. Работает только вне тренировки: тот же микрофон занят ею. */
let voiceTestOn = false;
const VT_KIND = {next:'handsfree.commandNext', pause:'handsfree.commandPause', resume:'handsfree.commandResume'};
function voiceTestRow(d){
  const box = $('voiceTestList');
  const row = document.createElement('div');
  const text = String(d.text || '').replace(/\[unk\]/g, '').trim();
  row.className = 'vt-row' + (d.accepted ? ' ok' : '');
  row.innerHTML = '<b></b><span></span>';
  row.querySelector('b').textContent = text ? `«${text}»` : t('voicetest.noise');
  row.querySelector('span').textContent = d.accepted && VT_KIND[d.kind] ? t(VT_KIND[d.kind])
    : d.kind && d.source === 'in_speech' ? t('voicetest.inSpeech')
    : d.kind ? t('voicetest.unsure') : t('voicetest.notCommand');
  box.prepend(row);
  while(box.children.length > 8) box.lastChild.remove();
}
function onVoiceTestHeard(e){ if(voiceTestOn) voiceTestRow(e.detail || {}); }
async function openVoiceTest(){
  if(state.live || !appRuntimeCompat.offlineVoice()) return;
  $('voiceTestList').innerHTML = '';
  $('voiceTestStatus').textContent = t('voicetest.listening');
  $('voiceTestModal').classList.add('open');
  voiceTestOn = true;
  const ok = await appRuntimeCompat.startVoiceRecognition(()=>{}, ()=>{ $('voiceTestStatus').textContent = t('voicetest.failed'); });
  if(!ok && voiceTestOn) $('voiceTestStatus').textContent = t('voicetest.failed');
  if(!voiceTestOn) appRuntimeCompat.stopVoiceRecognition(); // успели закрыть, пока микрофон поднимался
}
function stopVoiceTest(){
  if(!voiceTestOn) return;
  voiceTestOn = false;
  appRuntimeCompat.stopVoiceRecognition();
}
window.addEventListener('fitVoiceHeard', onVoiceTestHeard);
if($('btnVoiceTest')) $('btnVoiceTest').onclick = openVoiceTest;
$('voiceTestModal').onclick = e => { if(e.target === $('voiceTestModal')) $('voiceTestModal').classList.remove('open'); };
// окно закрывают кнопкой, тапом мимо и системным «назад» — микрофон
// отпускаем в любом из этих случаев, следя за самим окном
new MutationObserver(()=>{ if(!$('voiceTestModal').classList.contains('open')) stopVoiceTest(); })
  .observe($('voiceTestModal'), {attributes:true, attributeFilter:['class']});
// создание программы: одна кнопка + выбор способа
$('btnAddProgram').onclick = ()=> $('createModal').classList.add('open');
$('greetAva').onclick = ()=>{ const u = curUser(); if(u) openUserEdit(u.id); };
/* ---- каталог ---- */
$('btnStoreMenu').onclick = ()=> openStore('scrMenu');
$('storeBackTop').onclick = ()=> goTab(storeFrom);
$('storeQuery').oninput = ()=>{
  storeFilter.q = $('storeQuery').value;
  setShown('storeClear', !!storeFilter.q);
  renderStore();
};
$('storeClear').onclick = ()=>{
  $('storeQuery').value = '';
  storeFilter.q = '';
  setShown('storeClear', false);
  renderStore();
  $('storeQuery').focus();
};

$('createModal').onclick = e=>{ if(e.target === $('createModal')) $('createModal').classList.remove('open'); };
$('chManual').onclick = ()=>{ $('createModal').classList.remove('open'); openBuilder(); };
$('chAI').onclick = ()=>{ $('createModal').classList.remove('open'); initAIForm(); openAI('text'); };
$('chImport').onclick = ()=>{ $('createModal').classList.remove('open'); $('importCode').value=''; $('importModal').classList.add('open'); };
$('importModal').onclick = e=>{ if(e.target === $('importModal')) $('importModal').classList.remove('open'); };
$('btnDoImport').onclick = ()=> importProgramCode($('importCode').value);

/* ---- тренер: карточка на аккаунте, картотека, карточка подопечного ---- */
async function enableTrainerMode(){
  if(!trainerAccountReady()) return;
  trainer.handle = account.handle;
  trainer.on = true;
  // Первое включение: подставляем имя и фото из профиля, чтобы не набирать заново.
  // Дальше они живут отдельно — правка профиля лицо тренера не меняет.
  if(!trainer.name){
    const me = users.find(u => u.id === currentUser);
    if(me){ trainer.name = me.name || ''; trainer.photo = me.photo || ''; }
  }
  await saveTrainer();
  renderTrainerCard();
}
$('tglTrainer').onclick = async ()=>{
  if(!trainerAccountReady()){
    openLogin(enableTrainerMode, {
      label:t('trainer.needAccount'),
      msg:t('trainer.needAccountMsg')
    });
    return;
  }
  if(trainer.on){
    trainer.on = false;
    await saveTrainer();
    renderTrainerCard();
    return;
  }
  await enableTrainerMode();
};
/* Проверяем по УХОДУ из поля, а не на каждой букве: пока человек печатает
   «t.me/lena», адрес по дороге проходит через десяток заведомо неправильных
   состояний, и ругаться на каждое — значит мешать набирать.

   Непохожее на адрес не сохраняем вовсе. Раньше сюда писали что угодно, и это
   уезжало на страницу тренера, где превращалось в ссылку «https://хуй»: человек
   по ней нажимал и попадал в никуда. Лучше пусто, чем ссылка, которая врёт. */
$('coachLinks').onblur = async e => {
  const raw = e.target.value.trim();
  const ok = raw ? cleanLink(raw) : '';
  $('coachLinksErr').textContent = (raw && !ok)
    ? t('trainer.badLink')
    : '';
  if(raw && !ok) return;                 // оставляем набранное в поле, но не сохраняем
  // Схему в поле не показываем: её не набирали, и «https://» перед ником только
  // мешает прочитать, что там написано.
  e.target.value = (ok || '').replace(/^https?:\/\//i, '');
};
$('coachPhotoBtn').onclick = ()=> $('coachPhotoFile').click();
$('coachPhotoFile').onchange = e => {
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  shrinkImage(file, 240, async data => {
    if(!data){ appAlert(t('trainer.photoFailed')); return; }
    coachPhotoDraft = data;
    $('coachPhotoPrev').innerHTML = `<img src="${esc(data)}" alt="">`;
  });
};
// Только цифры и не больше двух: стаж — это «8» или «22», а не телефон.
// Поле текстовое намеренно — у number maxlength не работает вовсе.
$('coachYears').oninput = async e => {
  const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
  if(e.target.value !== digits) e.target.value = digits;
};

$('btnSaveCoach').onclick = async ()=>{
  if(!trainerAccountReady()){
    openLogin(enableTrainerMode, {
      label:t('trainer.needAccount'),
      msg:t('trainer.needAccountSaveMsg')
    });
    return;
  }
  const btn = $('btnSaveCoach');
  const rawLink = $('coachLinks').value.trim();
  const link = rawLink ? cleanLink(rawLink) : '';
  if(rawLink && !link){
    $('coachLinksErr').textContent = t('trainer.badLink');
    $('coachLinks').focus();
    return;
  }
  const handle = account.handle;
  const yearsRaw = $('coachYears').value.replace(/\D/g, '').slice(0, 2);
  const years = parseInt(yearsRaw, 10);
  trainer = Object.assign({}, trainer, {
    handle,
    name:clampLine($('coachName').value, LIM.coachName),
    photo:coachPhotoDraft || '',
    about:clampText($('coachAbout').value, LIM.coachAbout),
    years:(isFinite(years) && years > 0 && years <= 60) ? years : null,
    links:link || '',
    pageErr:null
  });
  btn.disabled = true;
  btn.textContent = t('common.saving');
  showSyncState('busy');
  await saveTrainer({deferSync:true});
  const ok = await pushProfile();
  if(ok){
    await saveTrainer({deferSync:true});
    if(isPremium()) queueAccountSync();
    showSyncState('ok');
    renderTrainerCard();
    btn.textContent = t('common.saved');
    setTimeout(()=>{ if(btn.textContent === t('common.saved')) btn.textContent = t('common.save'); }, 1500);
  } else {
    showSyncState('error');
    appAlert(trainer.pageErr || t('trainer.saveFailed'));
    btn.textContent = t('common.save');
  }
  btn.disabled = false;
};

// Ник над программой — это вход на страницу тренера, а не украшение: подопечный,
// получивший программу по ссылке, хочет знать, от кого она.
$('startByChip').onclick = ()=>{ const p = state.raw; if(p && p.by) openTrainer(p.by); };
$('tpBackTop').onclick = ()=> goBackTo(tpFrom || 'scrMenu');
$('pubBackTop').onclick = ()=> goBackTo(pubFrom || 'scrPrograms');
$('mcBackTop').onclick = ()=>{ switchMoreTab('coach'); goTab('scrAccount'); };
// Своя страница — ровно тем же экраном, каким её видит подопечный. Отдельный «просмотр
// профиля» разошёлся бы с настоящим через месяц.
$('btnToStore').onclick = ()=> openStore('scrPrograms');
$('btnMyCatalog').onclick = ()=> openMyCatalog();
// Ника без аккаунта терять нельзя — поэтому строка ведёт прямо туда, где его заводят.
$('coachNoAcc').onclick = ()=> { switchMoreTab('acc'); setTimeout(()=> openLogin(), 250); };
$('btnCoachWipe').onclick = wipeTrainerInfo;
$('btnMyPage').onclick = ()=> trainerOn() ? openTrainer(normHandle(trainer.handle))
  : appAlert(t('trainer.enableFirst'));
$('pubGives').oninput = e => { pubDraft.gives = clampText(e.target.value, LIM.gives); };
$('btnPublish').onclick = ()=> doPublish();
$('btnAddClient').onclick = async ()=>{
  const c = await addClient();
  renderClients();
  renderTrainerCard();
  openClient(clients.indexOf(c));
  setTimeout(()=> $('clName').select(), 120);
};

$('clBackTop').onclick = ()=> goBackTo('scrTrainer');
// Поля карточки сохраняются на лету: «Сохранить» здесь нечего ждать, а её отсутствие
// снимает весь разговор о несохранённом при выходе жестом.
$('clName').oninput = async e => {
  const c = curClient(); if(!c) return;
  c.name = clampLine(e.target.value, LIM.clientName);
  $('clTitle').textContent = c.name || t('clients.default');
  await saveClients();
};
$('clNote').oninput = async e => {
  const c = curClient(); if(!c) return;
  c.note = clampLine(e.target.value, LIM.clientNote);
  await saveClients();
};
// Кнопка всегда спрашивает, КАКУЮ программу отправить: их может быть несколько,
// и «отправить ещё раз» живёт у самой программы, а не здесь.
$('btnClSend').onclick = ()=>{
  const c = curClient(); if(!c) return;
  pickProgramForClient(c);
};
$('btnDelClient').onclick = async ()=>{
  const c = curClient(); if(!c) return;
  if(!(await appDialog(t('clients.removeClient',{name:c.name || t('clients.unnamed')}),
       {confirm: true, okText: t('clients.removeAction'), cancelText: t('common.keep')}))) return;
  clients = clients.filter(x => x.id !== c.id);
  clientIdx = -1;
  await saveClients();
  renderClients();
  renderTrainerCard();
  goBackTo('scrTrainer');
};

// Выбор программы для подопечного, когда её ещё нет. Тот же попап, что и «кому отправить»,
// только наоборот: подопечный известен, выбирают программу.
function pickProgramForClient(c){
  const box = $('pickClientList');
  box.innerHTML = '';
  const list = customPrograms.filter(p => p.id !== 'warmup');
  if(!list.length){
    const h = document.createElement('p');
    h.className = 'field-hint';
    h.textContent = t('clients.buildFirst');
    box.appendChild(h);
  }
  list.forEach(p => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice';
    b.innerHTML = '<b></b><small></small>';
    b.querySelector('b').textContent = p.name;
    const has = clProgs(c).find(x => x.pid === p.id);
    b.querySelector('small').textContent = has
      ? t('clients.sentAgain')
      : t('clients.exerciseCount',{count:(normPlans(p)[0].exercises || []).length});
    b.onclick = async ()=>{
      $('pickClientModal').classList.remove('open');
      await sendProgramToClient(c, p);
    };
    box.appendChild(b);
  });
  $('pickClientModal').querySelector('.mini-label').textContent = t('clients.chooseWhichProgram');
  $('pickClientModal').classList.add('open');
}
async function delCurrentPlan(){
  if(draft.plans.length <= 1) return;
  if(!(await appDialog(t('builder.deleteVariant'),
    {confirm: true, okText: t('common.delete'), cancelText: t('common.keep')}))) return;
  draft.plans.splice(planIdx, 1);
  planIdx = Math.max(0, planIdx - 1);
  if(draft.plans.length < 2) draft.rotate = false; // остался один вариант — очередь не нужна
  fillPlanFields();
  syncRotateUI();
}

/* ---- данные и правила ----
   Экран открывается из трёх мест: настроек, знакомства и подсказки про
   беременность. Возврат должен вести туда, откуда пришли, поэтому обратный
   путь запоминается функцией, а не берётся из истории. */
let legalBack = ()=> goTab('scrAccount');
const LEGAL_SECTIONS = {privacy: 'legalPrivacy', terms: 'legalTerms', health: 'legalHealth'};
function legalToggle(key, on){
  const body = $(LEGAL_SECTIONS[key]);
  const head = $('legalHead' + key[0].toUpperCase() + key.slice(1));
  const open = on == null ? body.classList.contains('hidden') : on;
  setShown(body, open);
  head.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function openLegal(section, back){
  legalBack = back || (()=> goTab('scrAccount'));
  Object.keys(LEGAL_SECTIONS).forEach(k => legalToggle(k, k === section));
  show('scrLegal');
  window.scrollTo(0, 0);
}
Object.keys(LEGAL_SECTIONS).forEach(k => {
  $('legalHead' + k[0].toUpperCase() + k.slice(1)).onclick = ()=> legalToggle(k);
});
$('legalBackTop').onclick = ()=> legalBack();
$('btnLegalDone').onclick = ()=> legalBack();
['workouts','trainer','progress','offers','emailNews','emailOffers'].forEach(key => {
  const btn = $({
    workouts:'notifWorkouts',
    trainer:'notifTrainer',
    progress:'notifProgress',
    offers:'notifOffers',
    emailNews:'emailNews',
    emailOffers:'emailOffers'
  }[key]);
  if(btn) btn.onclick = ()=> { setNotificationPref(key, !getNotificationPrefs()[key]); };
});
$('btnLegalPrivacy').onclick = ()=> openLegal('privacy');
$('btnLegalTerms').onclick   = ()=> openLegal('terms');
$('btnLegalHealth').onclick  = ()=> openLegal('health');
// трекер веса
$('btnAddWeight').onclick = ()=>{
  const last = stats.weights[stats.weights.length - 1];
  $('weightInput').value = last ? last.w : '';
  $('heightInput').value = stats.height || '';
  const lastOf = k => { for(let i = stats.weights.length - 1; i >= 0; i--) if(stats.weights[i][k]) return stats.weights[i][k]; return ''; };
  $('fatInput').value = lastOf('fat');
  $('muscInput').value = lastOf('musc');
  $('waistInput').value = lastOf('waist');
  $('hipsInput').value = lastOf('hips');
  $('chestInput').value = lastOf('chest');
  $('waModal').classList.add('open');
  setTimeout(()=> $('weightInput').focus(), 100);
};
$('waModal').onclick = e => { if(e.target === $('waModal')) $('waModal').classList.remove('open'); };
$('btnSaveWeight').onclick = async ()=>{
  const w = parseFloat(String($('weightInput').value).replace(',', '.'));
  if(!w || w < 20 || w > 300){ appAlert(t('progress.weightRange')); return; }
  const h = parseInt($('heightInput').value);
  if(h && h >= 100 && h <= 250) stats.height = h;
  const cm = id => {
    const v = parseFloat(String($(id).value).replace(',', '.'));
    return (v && v >= 30 && v <= 200) ? v : null;
  };
  // проценты состава тела: границы свои, иначе «18» в поле жира считалось бы промахом
  const pct = (id, lo, hi) => {
    const v = parseFloat(String($(id).value).replace(',', '.'));
    return (v && v >= lo && v <= hi) ? Math.round(v * 10) / 10 : null;
  };
  const today = localISO(new Date());
  let en = stats.weights.find(e => e.d === today);
  // вес и обхваты — сведения о здоровье, специальная категория: отмечаем согласие
  // в момент, когда человек впервые их вводит, а не абстрактно при установке
  if(!hasConsent('health')) recordConsent('health');
  if(!en){ en = {d: today}; stats.weights.push(en); }
  en.w = w;
  const waist = cm('waistInput'), hips = cm('hipsInput'), chest = cm('chestInput');
  const fat = pct('fatInput', 3, 70), musc = pct('muscInput', 10, 80);
  if(waist) en.waist = waist; else delete en.waist;
  if(hips) en.hips = hips; else delete en.hips;
  if(chest) en.chest = chest; else delete en.chest;
  if(fat) en.fat = fat; else delete en.fat;
  if(musc) en.musc = musc; else delete en.musc;
  stats.weights.sort((a2, b) => a2.d < b.d ? -1 : 1);
  await saveStats();
  $('waModal').classList.remove('open');
  renderWeight();
};
// навигация по календарю
// Подписка: витрина → оформление → успех. Оплату принимает магазин приложений,
// платёжные данные в приложение не попадают и у нас не хранятся.
function openPremium(){
  trackProductEvent('premium_opened').catch(()=>{});
  renderPremium(); $('premiumModal').classList.add('open');
  refreshServerSubscription(true).catch(()=>{});
}
$('btnPremium').onclick = openPremium;
$('btnPlanCard').onclick = openPremium;
$('premiumModal').onclick = e => { if(e.target === $('premiumModal')) $('premiumModal').classList.remove('open'); };
$('pmBuy').onclick = ()=>{
  trackProductEvent('purchase_started').catch(()=>{});
  const pr = priceTable(), cur = userCurrency();
  $('payWhat').textContent = pmPlan === 'year'
    ? t('premium.payYear',{price:money(pr.year,cur)})
    : t('premium.payMonth',{price:money(pr.month,cur)});
  $('payGo').textContent = t('premium.pay',{price:money(pr[pmPlan],cur)});
  $('payEmail').value = (account && account.email) || '';
  $('payModal').classList.add('open');
};
$('payModal').onclick = e => { if(e.target === $('payModal')) $('payModal').classList.remove('open'); };
$('payGo').onclick = completePurchase;
$('payEmail').addEventListener('keydown', e => { if(e.key === 'Enter') completePurchase(); });
$('premiumOkModal').onclick = e => { if(e.target === $('premiumOkModal')) $('premiumOkModal').classList.remove('open'); };
$('pokBio').onclick = async ()=>{ if(await bioEnable()) $('premiumOkModal').classList.remove('open'); };
$('tglBio').onclick = async ()=>{
  if(account.biometry && account.biometry.enabled) await bioDisable();
  else await bioEnable();
};
// Отмена продления не забирает оплаченное: срок дорабатывает до конца. Иначе это
// не отмена подписки, а изъятие уже купленного.
$('tglRenew').onclick = async ()=>{
  if(!account.sub) return;
  if(account.sub.autoRenew){
    const ok = await appDialog(
      t('premium.disableRenew',{date:humanDate(account.sub.until)}),
      {confirm: true, okText: t('premium.disableRenewAction'), cancelText: t('common.keep')});
    if(!ok) return;
  }
  account.sub.autoRenew = !account.sub.autoRenew;
  await saveAccount();
  renderPlan(); renderPremium();
};
$('loginGo').onclick = doLogin;
$('loginHaveCode').onclick = loginUseExistingCode;
const dropLogin = ()=>{
  loginDone = null;
  loginPending = null;
  loginFixedEmail = '';
  $('loginEmail').readOnly = false;
  pendingSub = null;   // ушёл с шага кода — подписки не случилось
  $('loginModal').classList.remove('open');
};
$('loginCancel').onclick = dropLogin;
$('loginModal').onclick = e => { if(e.target === $('loginModal')) dropLogin(); };
$('loginEmail').addEventListener('keydown', e => { if(e.key === 'Enter') doLogin(); });
$('loginCode').addEventListener('keydown', e => { if(e.key === 'Enter') doLogin(); });
$('loginHandle').addEventListener('input', e => {
  const at = e.target.value.startsWith('@');
  const body = e.target.value.replace(/^@+/, '').replace(/[^\wа-яё.\-]/gi, '').slice(0, 29);
  e.target.value = (at || body) ? '@' + body : '';
});
$('loginHandle').addEventListener('keydown', e => { if(e.key === 'Enter') doLogin(); });
$('btnLoginRow').onclick = ()=> openLogin();
$('btnSignOut').onclick = signOut;
// «Позже» — не отмена: дни, отмеченные до нажатия, уже лежат в программе, поэтому
// сохраняем и их, иначе выбор молча пропадёт
$('lockGo').onclick = ()=> tryUnlock();
// Биометрия не является авторизацией аккаунта. Если она недоступна или человек
// просто нажал «Отмена», запасной путь — обычный подтверждённый email + OTP.
$('lockMail').onclick = ()=> openLogin(
  ()=> $('lockModal').classList.remove('open'),
  {
    email:(account && account.email) || '',
    fixedEmail:true,
    label:t('lock.email'),
    msg:t('login.intro')
  }
);
window.addEventListener('fitAppForeground', e=>{
  maybeBiometricRelock(+((e && e.detail && e.detail.awayMs) || 0));
});

$('btnImportProgFile').onclick = ()=> $('importProgFile').click();
$('importProgFile').onchange = async e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!f) return;
  $('importModal').classList.remove('open');
  await importProgramFile(f);
};

$('btnExportAll').onclick = exportAllData;
$('btnImportAll').onclick = ()=> $('importAllFile').click();
$('btnWipeAccount').onclick = wipeAccount;
$('importAllFile').onchange = e => { const f = e.target.files && e.target.files[0]; if(f) importAllData(f); e.target.value=''; };
$('btnWeightHist').onclick = openWeightHist;
$('btnShareWeight').onclick = shareWeightChart;
$('btnAddPhoto').onclick = ()=> $('photoFile').click();
$('photoFile').onchange = e => {
  const f = e.target.files && e.target.files[0];
  if(f) addPhoto(f);
  e.target.value = '';
};
$('btnCompare').onclick = ()=> openCompare();
// переключатель метрик на вкладке «Тело»: график один, метрика выбирается здесь
$('weightSwitch').addEventListener('click', e => {
  const b = e.target.closest('.wm-chip');
  if(!b) return;
  weightMetric = b.dataset.k;
  renderWeight();
});
// самочувствие: тот же переключатель метрик, что и у веса
$('wellSwitch').addEventListener('click', e => {
  const b = e.target.closest('.wm-chip');
  if(!b) return;
  wellMetric = b.dataset.k;
  renderWellness();
});
$('btnAddWell').onclick = openWellAdd;
$('btnSaveWell').onclick = saveWell;
$('btnWellHist').onclick = openWellHist;
$('btnShareWell').onclick = shareWellChart;
$('wellHistSave').onclick = saveWellHist;
$('wellModal').onclick = e => { if(e.target === $('wellModal')) $('wellModal').classList.remove('open'); };
$('btnDeleteAllPhotos').onclick = deleteAllPhotos;
$('cmpA').onchange = renderCmp;
$('cmpB').onchange = renderCmp;
$('cmpDelA').onclick = ()=> delCmpPhoto('cmpA');
$('cmpDelB').onclick = ()=> delCmpPhoto('cmpB');
$('btnShareCmp').onclick = shareCompare;
$('cmpModal').onclick = e => { if(e.target === $('cmpModal')) $('cmpModal').classList.remove('open'); };
$('whSave').onclick = saveWeightHist;
$('whModal').onclick = e => { if(e.target === $('whModal')) $('whModal').classList.remove('open'); };
$('calPrev').onclick = ()=>{ calOffset--; renderCalendar(); };
$('calNext').onclick = ()=>{ calOffset++; renderCalendar(); };
// онбординг
// из знакомства «назад» ведёт обратно в знакомство, а не в настройки: человек
// ещё не завёл профиль, и вкладки внизу ему пока не принадлежат
$('obLegal1').onclick = ()=> openLegal('privacy', ()=> asTab(()=> show('scrOnboard')));
// Знакомство ведёт на главную, а не сразу в разминку: разминка никуда не денется —
// она уже в списке, — а начинать чужой сценарий за человека не стоит.
async function leaveOnboarding(){
  const freshProfile = await finishOnboardingCreate();
  trackProductEvent('onboarding_complete').catch(()=>{});
  if(pendingImport){
    importProgramCode(pendingImport);
    pendingImport = null;
    return;
  }
  if(pendingNativeLink){
    const id = pendingNativeLink;
    pendingNativeLink = null;
    importProgramLink(id);
    return;
  }
  if(pendingLink){
    const id = pendingLink;
    pendingLink = null;
    importProgramLink(id);
    return;
  }
  // Новый пользователь уже выразил намерение начать тренировку. Не заставляем его
  // сначала попадать на пустую «Сегодня», а ведём туда, где можно сразу выбрать
  // готовую программу, собрать свою или открыть разминку. После входа в существующий
  // аккаунт оставляем привычную главную — там уже есть личный план и история.
  goTab(freshProfile ? 'scrPrograms' : 'scrMenu');
}
$('obStart').onclick = ()=> leaveOnboarding();
// у человека уже может быть аккаунт — с прошлого телефона или после переустановки
$('obLogin').onclick = ()=> openLogin(()=> leaveOnboarding());
// пара уточнений
$('whoF').onclick = ()=>{ whoDraft.gender = 'f'; whoSyncForm(); };
$('whoM').onclick = ()=>{ whoDraft.gender = 'm'; whoSyncForm(); };
$('whoAge').oninput = ()=> whoSyncForm();
$('whoSave').onclick = ()=> whoFinish(true);
$('whoSkip').onclick = ()=> whoFinish(false);
$('whoModal').onclick = e => { if(e.target === $('whoModal')) whoFinish(false); };
// профили
function openStats(tab){
  switchStatsTab(tab || 'workouts');
  goTab('scrStats');
}
function switchStatsTab(tab){
  document.querySelectorAll('#statsTabs .tab').forEach(b => b.classList.toggle('act', b.dataset.tab === tab));
  setShown('tabWorkouts', tab === 'workouts');
  setShown('tabWeight', tab === 'weight');
  setShown('tabPhoto', tab === 'photo');
}
document.querySelectorAll('#statsTabs .tab').forEach(b => b.onclick = ()=> switchStatsTab(b.dataset.tab));

/* Вкладки раздела «Другое». Запоминаем выбранную вкладку: пока приложение
   открыто: если человек ушёл из «Аккаунта» в правила, «назад» должен вернуть его
   именно в «Аккаунт», а не каждый раз сбрасывать на «Профиль». */
let moreTab = 'me';
function switchMoreTab(key){
  if(!['me','sound','coach','acc'].includes(key)) key = 'me';
  moreTab = key;
  document.querySelectorAll('#moreTabs .tab').forEach(b => b.classList.toggle('act', b.dataset.more === key));
  ['me', 'sound', 'coach', 'acc'].forEach(k => setShown('morePane_' + k, k === key));
  if(key === 'coach') refreshTrainerProfile();
  if(key === 'acc') refreshServerSubscription(true).catch(()=>{});
}
document.querySelectorAll('#moreTabs .tab').forEach(b => b.onclick = ()=> switchMoreTab(b.dataset.more));
document.querySelectorAll('.qs-btn').forEach(b => b.onclick = ()=> openStats(b.dataset.tab));
document.querySelectorAll('.dock-btn').forEach(b => b.onclick = ()=> goTab(b.dataset.scr));
$('ueBackTop').onclick = ()=> leaveGuard(userDirty(), ()=> goTab('scrAccount'), t('profile.changes'));
$('btnAddUser').onclick = ()=> openUserEdit();
$('btnSaveUser').onclick = saveUser;
$('btnDelUser').onclick = deleteUser;
// тему показываем сразу: выбирать её вслепую, не видя результата, бессмысленно
document.querySelectorAll('#ueThemeSeg button').forEach(b => {
  b.onclick = ()=>{ uDraft.theme = b.dataset.theme; syncUserForm(); applyThemeFor(uDraft); };
});
$('ueGenderF').onclick = ()=>{ uDraft.gender = 'f'; syncUserForm(); };
$('ueGenderM').onclick = ()=>{ uDraft.gender = 'm'; syncUserForm(); };
// нет фото — сразу выбор файла; есть фото — меню «заменить / удалить»
$('uePhotoBtn').onclick = e => {
  e.stopPropagation();
  if(!uDraft.photo){ $('uePhotoFile').click(); return; }
  const menu = $('uePhotoMenu');
  const wasOpen = menu.classList.contains('open');
  closeAllMenus();
  if(wasOpen) return;
  menu.innerHTML = '';
  const mk = (h, fn, cls)=>{
    const b = document.createElement('button');
    if(cls) b.className = cls;
    b.innerHTML = h;
    b.onclick = ev => { ev.stopPropagation(); closeAllMenus(); fn(); };
    return b;
  };
  menu.append(
    mk(icon('camera') + t('profile.replacePhoto'), ()=> $('uePhotoFile').click()),
    mk(icon('trash') + t('profile.deletePhoto'), ()=>{ uDraft.photo = null; $('uePhotoFile').value = ''; syncUserForm(); }, 'danger')
  );
  menu.classList.add('open');
};

$('uePhotoFile').onchange = e=>{
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  shrinkImage(file, 240, dataUrl => { uDraft.photo = dataUrl; syncUserForm(); });
};

// переход на видео автоматически ставит тренировку на паузу
$('videoLink').addEventListener('click', ()=>{
  if($('scrWork').classList.contains('on')) setPause(true);
});
// одно слово: на 360 px «поделиться результатом» ломалось на две строки, а капслок
// в две строки внутри кнопки выглядит дёшево. Иконка и контекст экрана объясняют остальное
$('btnShareResult').onclick = shareResult;
$('finNote').oninput = e => { if(state.lastHist) state.lastHist.note = clampText(e.target.value, LIM.note); };
$('finNote').onchange = ()=> { if(state.lastHist) saveStats(); };
// заметка открывается по нажатию: пустое поле ввода не должно быть громче результата
$('finNoteToggle').onclick = ()=>{
  setShown('finNoteToggle', false);
  setShown('finNoteField', true);
  $('finNote').focus();
  // поле не должно остаться под клавиатурой
  setTimeout(()=>{ try{ $('finNote').scrollIntoView({block:'center', behavior:'smooth'}); }catch(e){} }, 260);
};
$('finProgCheckYes').onclick = ()=> applyProgCheck();
$('finProgCheckToggle').onclick = ()=> toggleProgCheckList();
// подсказка прокрутки на экране тренировки
$('scrollCue').innerHTML = icon('chevD');
$('stepDetails').addEventListener('scroll', refreshDetailsFade, {passive:true});
$('btnAgain').onclick = async ()=>{
  // у короткой тренировки это кнопка «Засчитать». Если после засчёта подошла
  // проверка прогресса, остаёмся на экране: иначе вопрос «Всё получилось?»
  // считался бы и тут же пропадал вместе с экраном, так и не показавшись.
  if(state.pendingFinish){
    settleQuickFinish(true);
    if(state.progCheck){
      $('finTitle').textContent = t('workout.great');
      $('btnAgain').className = 'btn-primary';
      $('btnAgain').textContent = t('finish.done');
      return;
    }
  }
  if(state.lastHist){ await saveStats(); state.lastHist = null; } // заметка фиксируется, дальше — только чтение
  document.body.classList.remove('phase-rest');
  goTab('scrMenu');
};
$('btnDiscardResult').onclick = ()=>{
  settleQuickFinish(false);           // ничего не записываем и тренеру не отправляем
  document.body.classList.remove('phase-rest');
  goTab('scrMenu');
};
/* ---- программа из видео ---- */
$('chYT').onclick = ()=>{ $('createModal').classList.remove('open'); openYouTube(); };
$('ytUrl').oninput = ytCheckUrl;
async function ytGuard(){
  const v = ($('ytUrl').value || '').trim();
  if(!v){ appAlert(t('video.addLink')); return false; }
  if(!ytCheckUrl()){
    const go = await appDialog(
      t('video.badUrl'),
      {confirm: true, okText: t('video.tryAnyway'), cancelText: t('video.checkAddress')}
    );
    return !!go;
  }
  return true;
}
async function ytCopyPrompt(){
  const btn = $('aiCopy');
  try{
    await navigator.clipboard.writeText(youtubePrompt());
    flashDone(btn);
  }catch(e){ appAlert(t('common.copyFailedManual')); }
}
async function ytApplyResult(){
  const raw = ($('aiResult').value || '').trim();
  if(!raw){ appAlert(MSG_AI_EMPTY()); return; }
  const kind = aiSrc === 'video' ? 'video.parse' : 'program.create';
  const checked = aiClientVerdict(kind, raw);
  if(!checked) return;
  const {program, errors} = parseProgramText(checked);
  if(errors.length){
    appAlert(MSG_AI_PARSE() + '\n\n' + t('video.parseProblems') + '\n— ' + errors.join('\n— '));
    return;
  }
  program.id = 'p' + Date.now();
  program.stats = {completions: 0};
  program.locale = appLocale === 'ru' ? 'ru' : 'en';
  program.name = versionedName(program.name || t('video.defaultProgram'));
  // сохраняем ссылку на источник в описании, если ИИ её не упомянул
  const link = ($('ytUrl').value || '').trim();
  if(link && !(program.desc || '').includes('http')){
    program.desc = ((program.desc || '') + ' ' + t('video.source') + ': ' + link).trim().slice(0, 1000);
  }
  customPrograms.push(program);
  await savePrograms();
  trackProductEvent('program_added').catch(()=>{});
  renderMine();
  $('aiResult').value = '';
  goTab('scrPrograms');
  appAlert(t('video.added',{name:program.name}));

}

/* ---- доработка через ИИ ---- */
// «Скопировать саму программу» означает буквально экспорт текущей программы в
// переносимом текстовом формате FitTimer. Никаких системных инструкций и скрытого
// задания здесь нет — полный AI-промт с пожеланием копирует соседняя кнопка.
$('aiCopyFull').onclick = async ()=>{
  const btn = $('aiCopyFull');
  const text = programToText(editAIProg);
  try{
    await navigator.clipboard.writeText(text);
    flashDone(btn);
  }catch(e){ appAlert(t('common.copyFailedRetry')); }
};
async function copyEditPrompt(){
  const btn = $('aiCopy');
  try{
    await navigator.clipboard.writeText(editAIPrompt());
    flashDone(btn);
  }catch(e){ appAlert(t('common.copyFailedManual')); }
}

$('swapBadge').onclick = openSwapHint;
$('swapOk').onclick = closeSwapHint;
$('swapAI').onclick = swapViaAI;
$('swapModal').onclick = e => { if(e.target === $('swapModal')) closeSwapHint(); };
$('swapCopy').onclick = async ()=>{
  const step = state.steps[state.stepIdx];
  if(!step || !step.swap) return;
  const text = `${step.swap.name}\n${step.swap.desc || ''}`.trim();
  try{
    await navigator.clipboard.writeText(text);
    $('swapCopy').textContent = t('common.copied');
  }catch(e){
    closeSwapHint();
    appAlert(t('common.copyManual'), {code: text});
  }
};

$('btnAddEx').onclick = ()=> $('addExModal').classList.add('open');
$('addExModal').onclick = e=>{ if(e.target === $('addExModal')) $('addExModal').classList.remove('open'); };
$('aemManual').onclick = ()=>{ $('addExModal').classList.remove('open'); addExManual(); };
$('aemAI').onclick = ()=>{ $('addExModal').classList.remove('open'); openExAI(); };

/* ---- окно ожидания генерации ---- */
let aiRunCtl = null, aiRunT0 = 0, aiRunTick = 0, aiRunOnCancel = null, aiRunCancelled = false;
// title — заголовок; onCancel — необязательный колбэк для многошаговых задач (генерация картинок)
function aiRunOpen(title, onCancel){
  aiRunCancelled = false;
  aiRunCtl = ('AbortController' in window) ? new AbortController() : null;
  aiRunOnCancel = onCancel || null;
  $('aiRunTitle').textContent = title || t('ai.workingDefault');
  $('aiRunText').textContent = t('ai.workingLong');
  $('aiRunTimer').textContent = '0:00';
  $('aiRunModal').classList.add('open');
  aiRunT0 = Date.now();
  clearInterval(aiRunTick);
  aiRunTick = setInterval(()=>{
    if(document.hidden) return;
    const s = Math.floor((Date.now() - aiRunT0) / 1000);
    $('aiRunTimer').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }, 1000);
}
// сообщение в окне ожидания: показываем, что идёт повторная попытка, а не зависание
function aiRunNote(text){
  const el = $('aiRunText');
  if(el) el.textContent = text;
}
function aiRunClose(){
  clearInterval(aiRunTick); aiRunTick = 0;
  aiRunOnCancel = null;
  $('aiRunModal').classList.remove('open');
}
$('aiRunCancel').onclick = ()=>{
  aiRunCancelled = true;
  try{ if(aiRunCtl) aiRunCtl.abort(); }catch(e){}
  aiRunCtl = null;
  const cb = aiRunOnCancel;
  aiRunClose();
  if(cb) cb();
};

async function aiRetryDialog(error){
  const detail = error && error.message ? error.message : t('common.unknownError');
  return appDialog(
    t('ai.runFailed',{error:detail}) + '\n\n' + t('ai.retryQuestion'),
    {confirm:true,okText:t('ai.retry'),cancelText:t('ai.editRequest')}
  );
}

// собрать ответ через Gemini, сразу применить и вернуться туда, откуда пришли
async function runSelfAI(promptFn, targetId, applyFn, title, kind){
  if(!premiumGate()) return;
  let prompt;
  try{ prompt = promptFn(); }catch(e){ appAlert(t('ai.buildRequestFailed')); return; }
  aiRunOpen(title);
  if(kind === 'video.parse') aiRunNote(t('video.processingSafe'));
  try{
    const text = await callGemini(prompt, aiRunCtl ? aiRunCtl.signal : undefined, kind);
    aiRunClose();
    if($(targetId)){ $(targetId).value = text; autoGrow($(targetId)); }
    await applyFn(); // сам разберёт ответ, покажет итог и вернёт на нужный экран
  }catch(e){
    aiRunClose();
    if(aiRunCancelled) return; // пользователь сам нажал «Отмена» — тогда молча
    // AbortError от сети/серверного таймаута — это ошибка, а не пользовательская
    // отмена. Раньше такой сбой выглядел ровно как «спиннер исчез и ничего нет».
    const retry = await aiRetryDialog(e);
    if(retry) return runSelfAI(promptFn, targetId, applyFn, title, kind);
    // «Изменить запрос» ничего не закрывает и ничего не очищает: человек остаётся
    // на том же AI-экране со всеми выбранными параметрами и текстом запроса.
  }
}
// Один обработчик на все источники: чем собрать промт и чем применить ответ,
// знает таблица AI_SOURCES, а не пять отдельных кнопок.
$('aiSelf').onclick = async ()=>{
  const c = AI_SOURCES[aiSrc];
  if(!c) return;
  if(c.guard && !(await c.guard())) return;
  runSelfAI(c.prompt, 'aiResult', c.apply, aiUiText(c.selfTitle), c.kind);
};
$('aiCopy').onclick = async ()=>{
  const c = AI_SOURCES[aiSrc];
  if(!c) return;
  if(c.guard && !(await c.guard())) return;
  c.copy();
};
$('aiApply').onclick = ()=>{
  const c = AI_SOURCES[aiSrc];
  if(c) c.apply();
};
$('aiBackTop').innerHTML = icon('chevL');
// Вкладка меняет способ, а не то, с чем работает человек: действия над
// упражнением должны быть на месте и здесь.
$('aiMore').innerHTML = icon('more');
$('aiMore').onclick = e => { e.stopPropagation(); toggleMenu($('aiMenu')); };
function buildAiMenu(){
  const box = $('aiMenu'); box.innerHTML = '';
  const mk = (html, fn, cls) => {
    const b = document.createElement('button');
    b.type = 'button';
    if(cls) b.className = cls;
    b.innerHTML = html;
    b.onclick = ev => { ev.stopPropagation(); closeAllMenus(); fn(); };
    box.appendChild(b);
  };
  // openBuilder() здесь звать НЕЛЬЗЯ: он перечитывает программу из сохранённых и
  // выбрасывает только что сделанную копию вместе со всей несохранённой правкой
  mk(icon('plus') + t('common.duplicate'), ()=>{ dupExerciseAt(exeIdx); asTab(()=> show('scrBuilder')); });
  mk(icon('trash') + t('common.delete'), async ()=>{
    await delExerciseAt(exeIdx);
    asTab(()=> show('scrBuilder'));
  }, 'danger');
}
$('aiBackTop').onclick = async ()=>{
  const c = AI_SOURCES[aiSrc];
  if(!c) return;
  if(aiScreenDirty(c.dirty)){
    const ok = await appDialog(t('ai.unsavedRequest'),
      {confirm: true, okText: t('common.leaveWithoutSaving'), cancelText: t('common.stay')});
    if(!ok) return;
  }
  c.back();
};

/* ---- картинки программы ---- */
$('imgBackTop').onclick = ()=> closeImages();
$('imgSelfGen').onclick = ()=> $('imgGenScopeModal').classList.add('open');
$('imgGenScopeModal').onclick = e => { if(e.target === $('imgGenScopeModal')) $('imgGenScopeModal').classList.remove('open'); };
$('imgGenAll').onclick = ()=>{
  $('imgGenScopeModal').classList.remove('open');
  generateAllImagesViaAI('all');
};
$('imgGenMissing').onclick = ()=>{
  $('imgGenScopeModal').classList.remove('open');
  generateAllImagesViaAI('missing');
};
$('imgPromptCopy').onclick = async ()=>{
  const btn = $('imgPromptCopy');
  try{
    await navigator.clipboard.writeText(imagesPromptText());
    flashDone(btn);
  }catch(e){ appAlert(t('common.copyFailedManual')); }
};
$('imgDone').onclick = ()=> closeImages();
$('imgPick').onclick = ()=> $('imgFiles').click();
$('imgFiles').onchange = e => {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  if(!files.length) return;
  const btn = $('imgPick'), restore = btnBusy(btn, t('images.processing',{done:0,total:files.length}));
  shrinkAll(files, 640, list => {
    imgTray = imgTray.concat(list);
    restore();
    renderTray();
    if(list.length) appAlert(t('images.uploaded',{count:list.length}));
  });
};
$('trayAuto').onclick = trayAutoAssign;
$('trayClear').onclick = async ()=>{
  if(!imgTray.length) return;
  const used = trayUsed();
  const removable = imgTray.filter(x => !used.has(x));
  if(!removable.length) return;
  if(!(await appDialog(t('images.removeQuestion'),
    {confirm: true, okText: t('images.removeAction'), cancelText: t('common.keep')}))) return;
  imgTray = imgTray.filter(x => used.has(x));
  renderTray();
};
$('slotModal').onclick = e => { if(e.target === $('slotModal')) $('slotModal').classList.remove('open'); };
$('slotRemove').onclick = ()=>{
  const s = imageSlots()[slotTarget];
  if(s) s.set(null);
  $('slotModal').classList.remove('open');
  renderSlots(); renderTray();   // счётчик «ещё не разложено» считается по местам
};
$('slotFromPhone').onclick = ()=> $('slotFile').click();
$('slotGenerateAI').onclick = generateSlotImageViaAI;
$('slotFile').onchange = e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!f) return;
  shrinkImage(f, 640, data => {
    if(!data){ appAlert(t('images.loadFailed')); return; }
    const s = imageSlots()[slotTarget];
    if(s) s.set(data);
    if(!imgTray.includes(data)) imgTray.push(data);
    $('slotModal').classList.remove('open');
    renderTray(); renderSlots();
  });
};

/* ---- переключение способа прямо на экране ---- */
// упражнение: вручную ⇄ через ИИ. Введённое переносится в упражнение по дороге,
// поэтому спрашивать «а точно?» не о чем — ничего не теряется.
document.querySelectorAll('#exModeTabs .tab').forEach(b => {
  b.onclick = ()=>{
    if(b.dataset.m !== 'ai') return;
    document.querySelectorAll('#exModeTabs .tab').forEach(x => x.classList.toggle('act', x.dataset.m === 'manual'));
    if(!exDraft || exIdx < 0) return;
    // Упражнение ещё только заводят — «через ИИ» здесь значит «подбери мне
    // упражнение»: там чипы (формат, уровень, мышцы, инвентарь) и сколько штук.
    // Раньше отсюда вела правка уже существующего, и чипов человек не видел
    // вовсе: до них можно было добраться только кнопкой, которую мы убрали.
    if(exIsNew){
      const wish = $('exName').value.trim();
      dropFreshEx();
      exDraft = null; exIdx = -1; exOrig = '';
      asTab(()=>{ openExAI(); if(wish){ $('exaWish').value = wish; autoGrow($('exaWish')); } });
      return;
    }
    if(!numFieldsOk('scrExercise') || !exNameOk()) return;
    exIsNew = false;
    const list = curPlan().exercises;
    if(list[exIdx]) list[exIdx] = commitExercise();
    const keep = exIdx;
    exDraft = null; exIdx = -1; exOrig = '';
    renderExList();
    asTab(()=> openExEdAI(keep));
  };
});

// действия над открытым упражнением — в меню шапки, как у программы на экране старта
$('exMore').innerHTML = icon('more');
$('exMore').onclick = e => { e.stopPropagation(); toggleMenu($('exMenu')); };
function buildExMenu(){
  const box = $('exMenu'); box.innerHTML = '';
  const mk = (html, fn, cls) => {
    const b = document.createElement('button');
    if(cls) b.className = cls;
    b.innerHTML = html;
    b.onclick = e => { e.stopPropagation(); closeAllMenus(); fn(); };
    box.appendChild(b);
  };
  mk(icon('plus') + t('common.duplicate'), dupExercise);
  mk(icon('trash') + t('common.delete'), delExercise, 'danger');
}

// конструктор: вручную ⇄ через ИИ ⇄ из видео
document.querySelectorAll('#bModeTabs .tab').forEach(b => {
  b.onclick = async ()=>{
    const m = b.dataset.m;
    if(m === 'manual') return;
    const back = ()=> document.querySelectorAll('#bModeTabs .tab')
      .forEach(x => x.classList.toggle('act', x.dataset.m === 'manual'));
    // редактируем существующую программу → «через ИИ» = доработка этой же программы
    const existing = draft && draft.id && customPrograms.find(p => p.id === draft.id);
    if(programDirty()){
      const go = await appDialog(
        t('builder.unsavedProgram'),
        {confirm: true, okText: t('common.leaveWithoutSaving'), cancelText: t('common.stay')}
      );
      back();
      if(!go) return;
    } else back();
    if(existing && m === 'text'){ asTab(()=> openEditAI(existing)); return; }
    asTab(()=> switchCreateMode(m));
  };
});

// создание программы: по описанию ⇄ из видео ⇄ вручную
function switchCreateMode(m){
  if(m === 'text'){ initAIForm(); openAI('text'); }
  else if(m === 'video'){ openYouTube(); }
  else if(m === 'manual'){ openBuilder(); window.scrollTo(0, 0); }
}
// Вкладки режима: раньше их было четыре набора с четырьмя почти одинаковыми
// обработчиками. Теперь набор один, кнопки в нём рисуются под источник, а слушает
// их сам контейнер — поэтому обработчик переживает перерисовку.
$('aiTabs').addEventListener('click', async e => {
  const b = e.target.closest('.tab');
  const c = AI_SOURCES[aiSrc];
  if(!b || !c) return;
  const cur = (aiSrc === 'video') ? 'video' : (aiSrc === 'text' ? 'text' : 'ai');
  if(b.dataset.m === cur) return;
  if(aiScreenDirty(c.dirty)){
    const ok = await appDialog(
      t('ai.unsavedSwitch'),
      {confirm: true, okText: t('common.switch'), cancelText: t('common.stay')}
    );
    markAITab();   // подсветку возвращаем на месте, ушёл человек или нет
    if(!ok) return;
  }
  if(b.dataset.m === 'manual'){ asTab(c.manual); return; }
  asTab(()=> switchCreateMode(b.dataset.m));
});
// ручной режим открывает конструктор с активной вкладкой «Вручную».
// Подписи вкладок НЕ меняются от того, новая программа или сохранённая: у
// сохранённой вкладка звалась «Доработать ИИ», а на самом экране ИИ — «Через ИИ»,
// и получалось, что нажал одно, а попал в другое.
function markBuilderTab(){
  const isEdit = !!(draft && draft.id && customPrograms.some(p => p.id === draft.id));
  setShown('bModeTabs', true);
  document.querySelectorAll('#bModeTabs .tab').forEach(x => {
    x.classList.toggle('act', x.dataset.m === 'manual');
    // у существующей программы «из видео» не нужен: он создаёт новую
    if(x.dataset.m === 'video') x.style.display = isEdit ? 'none' : '';
  });
}

/* ---- правка упражнения через ИИ ---- */
async function exeCopyPrompt(){
  const btn = $('aiCopy');
  try{
    await navigator.clipboard.writeText(exePrompt());
    flashDone(btn);
  }catch(e){ appAlert(t('common.copyFailedRetry')); }
}

/* ---- упражнение через ИИ ---- */
async function exaCopyPrompt(){
  const btn = $('aiCopy');
  try{
    await navigator.clipboard.writeText(exaPrompt());
    flashDone(btn);
  }catch(e){ appAlert(t('common.copyFailedManual')); }
}

// Новая строка заводится с рабочими значениями (повторения, 10, один подход) и
// сразу открывается в редакторе: одно голое поле названия посреди списка не даёт
// ничего — упражнение всё равно нужно настроить, а название у него первое поле.
function addExManual(){
  const list = curPlan().exercises;
  const nWarm = list.filter(e => e.warmup).length;
  if(list.length - nWarm >= MAX_MAIN){ appAlert(t('exercise.mainLimitAdd',{count:MAX_MAIN})); return; }
  const ex = blankExercise();
  // наследуем формат, подходы и отдых у предыдущего — при сборке они обычно одинаковые
  const prev = list.filter(e => !e.warmup).slice(-1)[0];
  if(prev){ ex.type = prev.type; ex.sets = prev.sets || 1; ex.rest = prev.rest; ex.value = prev.value; }
  list.push(ex);
  renderExList();
  openExercise(list.length - 1, true);
}

/* ---- экран упражнения ---- */
// Упражнение без названия — пустая строка в списке: по ней ничего не понять ни
// человеку, ни промту, ни экспорту. Поэтому имя обязательно, и спрашиваем о нём
// в момент сохранения, а не молча подставляем «Упражнение 3».
function exNameOk(){
  if($('exName').value.trim()) return true;
  appAlert(t('exercise.nameRequired'));
  $('exName').focus();
  return false;
}
$('exBackTop').onclick = ()=> leaveExercise();
// числовые поля проверяются перед сохранением: неверное значение больше не
// «исправляется» молча в единицу
$('btnSaveEx').onclick = ()=>{ if(numFieldsOk('scrExercise') && exNameOk()) saveExAndBack(); };
[['exValue','range',true],['exSets','int'],['exWeight','dec'],
 ['exStepReps','int'],['exMaxReps','int'],['exStepWeight','dec'],['exMaxWeight','dec'],
 ['exStepTime','int'],['exMaxTime','int']].forEach(([id,k,req])=> guardNum(id,k,req));
['bRoundRest','uePrepSec','ueReadySec','ueSideSec'].forEach(id => guardNum(id,'int'));

// дублируем то, что видно сейчас, вместе с несохранёнными правками формы
function dupExercise(){
  if(!exDraft || exIdx < 0) return;
  exIsNew = false;
  const list = curPlan().exercises;
  const nWarm = list.filter(x => x.warmup).length;
  if(exDraft.warmup ? nWarm >= MAX_WARM : list.length - nWarm >= MAX_MAIN){
    appAlert(exDraft.warmup
      ? t('exercise.warmLimitDuplicate',{count:MAX_WARM})
      : t('exercise.mainLimitDuplicate',{count:MAX_MAIN}));
    return;
  }
  if(!numFieldsOk('scrExercise') || !exNameOk()) return;
  if(list[exIdx]) list[exIdx] = commitExercise();
  list.splice(exIdx + 1, 0, cloneExerciseAsNew(list[exIdx]));
  exDraft = null; exIdx = -1; exOrig = '';
  afterExChange();
}
async function delExercise(){
  if(!exDraft || exIdx < 0) return;
  const nameTxt = (exDraft.name || '').trim() || t('exercise.this');
  if(!(await appDialog(t('exercise.deleteQuestion',{name:nameTxt}), {confirm: true, okText: t('common.delete'), cancelText: t('common.keep')}))) return;
  exIsNew = false;
  curPlan().exercises.splice(exIdx, 1);
  exDraft = null; exIdx = -1; exOrig = '';
  await afterExChange();
}

function saveExAndBack(){
  if(exFromWork){ saveExToWorkout(); return; }
  exIsNew = false;
  if(exDraft && exIdx >= 0){
    const list = curPlan().exercises;
    if(list[exIdx]) list[exIdx] = commitExercise();
  }
  exDraft = null; exIdx = -1; exOrig = '';
  renderExList();
  goBackTo('scrBuilder');
}

// выход без сохранения — с предупреждением, если что-томенялось
async function leaveExercise(){
  if(exDirty()){
    const go = await appDialog(
      exIsNew
        ? t('exercise.newUnsaved')
        : t('exercise.unsaved'),
      {confirm: true, okText: t('common.leaveWithoutSaving'), cancelText: t('common.stay')}
    );
    if(!go) return;
  }
  dropFreshEx();
  exDraft = null; exIdx = -1; exOrig = '';
  if(exFromWork){ backToWorkout(false); return; }
  renderExList();
  goBackTo('scrBuilder');
}
$('exName').oninput = e => { exDraft.name = e.target.value; };
// «Как считать» (повторения/время) и вес — независимы: переключение одного не
// трогает другое. != null везде вместо простой проверки на «истинность» — иначе
// явный 0 в шаге (значит «эта ось не растёт») JS воспримет как «не задано» и
// подставит дефолт заново
$('exTypeReps').onclick = ()=>{ exDraft.type = 'reps'; syncExType(); };
$('exTypeTime').onclick = ()=>{ exDraft.type = 'time'; syncExType(); };
$('exWeightOn').onclick = ()=>{
  exDraft.trackWeight = !exDraft.trackWeight;
  if(exDraft.trackWeight && exDraft.wStep == null) exDraft.wStep = 2;
  syncExType();
};

$('exProgToggle').onclick = ()=>{
  const box = $('exProgBox'), open = box.classList.contains('hidden');
  setShown(box, open);
  $('exProgToggle').classList.toggle('open', open);
};
$('exProgOn').onclick = ()=>{
  const on = !$('exProgOn').classList.contains('on');
  exDraft.progOn = on;
  if(on){
    // включили — проставляем дефолтный шаг для текущего формата, если его ещё вообще не было
    if(hasWeight(exDraft) && exDraft.wStep == null) exDraft.wStep = 2;
    if(exDraft.type !== 'time' && exDraft.repsStep == null) exDraft.repsStep = hasWeight(exDraft) ? 0 : 1;
    if(exDraft.type === 'time' && exDraft.timeStep == null) exDraft.timeStep = 5;
  }
  ['exStepReps','exStepWeight','exStepTime','exMaxReps','exMaxWeight','exMaxTime'].forEach(id => delete $(id).dataset.touched);
  renderProgControls();
  syncExDetailsSum();
};
['exStepReps','exStepWeight','exStepTime','exMaxReps','exMaxWeight','exMaxTime'].forEach(id => {
  $(id).oninput = ()=>{ $(id).dataset.touched = '1'; syncExProgSum(); syncExNowHints(); };
});
// база поменялась — итог пересчитывается тут же, иначе подсказка врёт до сохранения
['exValue','exWeight'].forEach(id => $(id).addEventListener('input', syncExNowHints));
$('exDual').onclick = ()=>{
  exDraft.dualProg = !exDraft.dualProg;
  $('exDual').classList.toggle('on', exDraft.dualProg);
  syncExDetailsSum();
};
$('exSwapOn').onclick = ()=>{
  exDraft.swapOn = !exDraft.swapOn;
  $('exSwapOn').classList.toggle('on', exDraft.swapOn);
  setShown('exSwapBox', exDraft.swapOn);
  if(exDraft.swapOn) autoGrow($('exSwapDesc'));
};
$('exSwapName').oninput = e => { exDraft.swapName = e.target.value; };
$('exSwapDesc').oninput = e => { exDraft.swapDesc = e.target.value; };
$('exWarm').onclick = ()=>{
  const list = curPlan().exercises;
  const nWarm = list.filter((e, i) => e.warmup && i !== exIdx).length;
  const nMain = list.filter((e, i) => !e.warmup && i !== exIdx).length;
  if(!exDraft.warmup && nWarm >= MAX_WARM){ appAlert(t('exercise.warmMax',{count:MAX_WARM})); return; }
  if(exDraft.warmup && nMain >= MAX_MAIN){ appAlert(t('exercise.mainMax',{count:MAX_MAIN})); return; }
  exDraft.warmup = !exDraft.warmup;
  $('exWarm').classList.toggle('on', exDraft.warmup);
  if(exDraft.warmup) exDraft.sets = 1;
  syncExWarm();
  renderProgControls(); // разминка блокирует «усложнять со временем» — обновляем сразу
};
$('exSide').onclick = ()=>{ exDraft.perSide = !exDraft.perSide; $('exSide').classList.toggle('on', exDraft.perSide); };
$('exDesc').oninput = e => { exDraft.desc = e.target.value; syncExDetailsSum(); };
$('exMistakes').oninput = e => { exDraft.mistakes = e.target.value; syncExDetailsSum(); };
$('exVideo').oninput = e => { exDraft.video = e.target.value; syncExDetailsSum(); };
$('exDetailsToggle').onclick = ()=>{
  const box = $('exDetailsBox'), open = box.classList.contains('hidden');
  box.classList.toggle('hidden', !open);
  $('exDetailsToggle').classList.toggle('open', open);
  if(open){ autoGrow($('exDesc')); autoGrow($('exMistakes')); }
};
$('exMediaBtn').onclick = ()=> $('exMediaFile').click();
$('exMediaNone').onclick = ()=>{
  dropExMedia(exDraft);
  $('exMediaFile').value = '';
  renderExMedia(); syncExDetailsSum();
};
// картинка упражнения через ИИ — по тому, что уже набрано в форме
$('exMediaAI').onclick = ()=>{
  const item = exImageItem(Object.assign({}, exDraft, {
    name:$('exName').value, desc:$('exDesc').value
  }));
  generateOneImageViaAI('ex', item, item.name, data => {
    setExImg(exDraft, data);
    renderExMedia(); syncExDetailsSum();
  });
};
$('exMediaFile').onchange = e => {
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  shrinkImage(file, 640, data => {
    if(!data){ appAlert(t('images.loadFailed')); return; }
    setExImg(exDraft, data);
    renderExMedia(); syncExDetailsSum();
  });
};

/* ---- сворачивание настроек программы ---- */
$('bImagesRow').onclick = ()=>{ if(premiumGate()) openImages(); };
$('bSettingsToggle').onclick = ()=>{
  syncRotateUI();
  fillPlanFields();
  show('scrProgSettings');
  window.scrollTo(0, 0);
};
function closeProgSettings(){
  commitPlanFields();
  draft.desc = clampText($('bDesc').value, LIM.progDesc);
  draft.name = clampLine($('bName').value, LIM.progName) || draft.name;
  syncSettingsSum();
  renderExList();
  goBackTo('scrBuilder');
}
$('psBackTop').onclick = closeProgSettings;
$('btnPsDone').onclick = ()=>{ if(numFieldsOk('scrProgSettings')) closeProgSettings(); };
function syncImagesSum(){
  const el = $('bImagesSum');
  if(!el || !draft) return;
  let total = 0, filled = 0;
  (draft.plans || []).forEach(pl => (pl.exercises || []).forEach(ex => {
    total++;
    if(ex.media && ex.media.kind === 'img') filled++;
  }));
  el.textContent = filled
    ? t('images.summaryFilled',{filled,total})
    : t('images.summaryEmpty',{total});
}
// Сводка говорит, что НАСТРОЕНО, а не как называются поля внутри. Круги и отдых
// между ними здесь обязательны: это первое, что человек хочет проверить перед
// стартом, а раньше их приходилось искать, открыв настройки.
function syncSettingsSum(){
  const bits = [];
  const plans = draft.plans || [];
  const pl = curPlan();
  const daysU = programDaysUnion(draft);
  if(daysU.length) bits.push(daysU.map(canonicalLabel).join('·'));
  else if(draft.rotate) bits.push(t('programs.sequence'));
  else bits.push(t('builder.anyDays'));
  if(draft.time) bits.push(draft.time);
  if(plans.length > 1) bits.push(storeCountText(plans.length,'variant'));
  const rounds = (pl && +pl.rounds) || 1;
  bits.push(storeCountText(rounds,'round'));
  const rr = (pl && +pl.roundRest) || 0;
  if(rounds > 1 && rr > 0) bits.push(t('builder.restSummary',{time:(rr % 60 === 0 ? (rr / 60) + ' ' + t('store.minuteShort') : rr + ' ' + t('store.secShort'))}));
  if(draft.progression) bits.push(t('builder.progressionAuto'));
  $('bSettingsSum').textContent = bits.join(' · ');
}
$('bTime').oninput = ()=>{ draft.time = $('bTime').value || ''; syncSettingsSum(); };
$('bDesc').oninput = e => {
  draft.desc = clampText(e.target.value, LIM.progDesc);
  $('bDescCount').textContent = draft.desc.length;
};
$('btnSaveProgram').onclick = ()=>{ if(numFieldsOk('scrBuilder')) saveProgram(); };
$('builderBackTop').onclick = ()=> leaveGuard(programDirty(), ()=>{ clearSnap('program'); goTab('scrPrograms'); }, t('builder.programChanges'));
// обложка программы
$('bCoverBtn').onclick = ()=> $('bCoverFile').click();
$('bCoverNone').onclick = ()=>{ draft.cover = null; $('bCoverFile').value=''; syncCover(); };
$('bCoverAI').onclick = ()=> generateOneImageViaAI('cover', null, t('images.coverProgram'), data => {
  draft.cover = data; $('bCoverFile').value = ''; syncCover();
});
$('bCoverFile').onchange = e=>{
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  shrinkImage(file, 320, dataUrl => { draft.cover = dataUrl; syncCover(); });
};
// сброс счётчика прохождений (в редактировании программы)
// сброс общего времени тренировок
// Кнопка называлась «сбросить общее время и счётчик», а стирала ВСЮ историю —
// вместе с календарём, неделями, сериями и достижениями. Теперь говорит правду
// и требует набрать фразу: восстановить это неоткуда.
$('btnResetTotal').onclick = async ()=>{
  const ok = await appDialog(
    t('stats.clearQuestion'),
    {confirm: true, okText: t('stats.clear'), cancelText: t('common.cancel'), type: t('account.deleteConfirmPhrase')}
  );
  if(!ok) return;
  stats.totalSec = 0;
  stats.count = 0;
  stats.history = [];
  await saveStats();
  renderStats();
};

let releaseResumeAt = Date.now();
async function refreshAfterForeground(){
  const now = Date.now();
  if(now - releaseResumeAt < 60000) return;
  releaseResumeAt = now;
  loadPublicConfig();
  refreshServerSubscription(true).catch(()=>{});
  if(account && account.email && account.syncToken){
    connectAccountSync().catch(()=>{});
    refreshTrainerProfile().catch(()=>{});
  }
  syncNativeNotifications().catch(()=>{});
}

document.addEventListener('visibilitychange', ()=>{
  const inWorkout = $('scrWork').classList.contains('on');
  if(document.visibilityState !== 'visible'){
    releaseWake();
    stopHandsFree();
    try{ if(audioCtx && audioCtx.state === 'running') audioCtx.suspend(); }catch(e){}
    stopSpeech();
    return;
  }
  if(inWorkout){
    keepAwake();
    try{ if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); }catch(e){}
    startHandsFree();
  }
  refreshAfterForeground().catch(()=>{});
  // Сами таймеры считают по Date.now и дедлайнам. В фоне ресурсы освобождаем, а
  // при возврате первый тик сразу догонит прошедшее время.
});

// статичные иконки
$('btnPause').innerHTML = icon('pause');
$('btnMicW').innerHTML = icon('mic');
// каталог, а не магазин: сумка для покупок обещает кассу, которой здесь нет
$('storeIcoMenu').innerHTML = $('storeIcoProg').innerHTML = icon('book');
$('storeArrowMenu').innerHTML = $('storeArrowProg').innerHTML = icon('chevR');
$('storeBackTop').innerHTML = icon('chevL');
$('siBackTop').innerHTML = icon('chevL');
$('storeSearchIco').innerHTML = icon('search');
$('storeClear').innerHTML = icon('close');
$('btnResetTotal').innerHTML = icon('reset');
$('btnAddWeight').innerHTML = icon('plus');
$('btnAddWell').innerHTML = icon('plus');
$('qsIco1').innerHTML = icon('chart');
$('qsIco2').innerHTML = icon('weight');
$('qsIco3').innerHTML = icon('camera');
// Кнопки «иконка + подпись» задаются кодом, а не data-i18n (иконку applyI18n стёр бы).
// Раньше подпись ставилась один раз при запуске и при смене языка оставалась прежней:
// экран результата выходил английским, а «Поделиться» — русским.
function renderIconLabels(){
  $('btnAddProgram').innerHTML = icon('plus') + '<span>' + esc(t('programs.newShort')) + '</span>';
  $('btnShareResult').innerHTML = icon('share') + '<span>' + esc(t('finish.share')) + '</span>';
  $('finNoteToggle').innerHTML = icon('pencil') + '<span>' + esc(t('finish.addNote')) + '</span>';
  $('btnAddPhoto').innerHTML = icon('camera') + esc(t('progress.addPhoto'));
  $('btnCompare').innerHTML = icon('image') + esc(t('progress.comparePhotos'));
  $('btnDeleteAllPhotos').innerHTML = icon('trash') + esc(t('progress.deleteAllPhotosBtn'));
}
renderIconLabels();
window.addEventListener('appLocaleChanged', renderIconLabels);
$('btnResume').innerHTML = icon('play');
$('calPrev').innerHTML = icon('chevL');
$('calNext').innerHTML = icon('chevR');
$('ueBackTop').innerHTML = icon('chevL');
$('builderBackTop').innerHTML = icon('chevL');
$('exBackTop').innerHTML = icon('chevL');
$('bSettingsChev').innerHTML = icon('chevR');
$('psBackTop').innerHTML = icon('chevL');
$('imgBackTop').innerHTML = icon('chevL');
$('bImagesChev').innerHTML = icon('chevR');
$('exDetailsChev').innerHTML = icon('chevR');
$('exProgChev').innerHTML = icon('chevR');
$('startBackTop').innerHTML = icon('chevL');
$('legalBackTop').innerHTML = icon('chevL');
// экраны запроса к ИИ: одна регистрация на экран
[{screen:'scrAI', answer:'aiAnswer', actions:'aiActions', result:'aiResult', copy:['aiCopy', 'aiCopyFull']},
 {screen:'scrImages'}].forEach(setupAIAnswer);

// иконки прямо в разметке: <span data-icon="copy"></span> — один проход на весь документ,
// чтобы не заводить по строке JS на каждую новую кнопку
document.querySelectorAll('[data-icon]').forEach(el => {
  const n = el.dataset.icon;
  if(ICONS[n]) el.innerHTML = icon(n);
});

/* ---- витрина «Сегодня»: мягкий паралакс блика на прокрутке ----
   Единственная задача движения — показать, что страница длиннее экрана.
   При prefers-reduced-motion блик стоит на месте (см. стили). */
(function(){
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce) return;
  let tick = false;
  window.addEventListener('scroll', ()=>{
    if(tick) return;
    tick = true;
    requestAnimationFrame(()=>{
      tick = false;
      if(show._last !== 'scrMenu') return;
      const el = $('scGlow');
      if(el) el.style.setProperty('--par', Math.min(90, window.scrollY * 0.28) + 'px');
    });
  }, {passive: true});
})();

// стартовое состояние навигации: «Сегодня» с доком внизу
show('scrMenu', false);

// параметры запуска: ?import=FIT1..., /p/<id> (legacy ?p=<id>) и ярлыки ?today / ?create
let pendingImport = null;
let pendingLink = null;
let pendingNativeLink = null;
let pendingNativeWorkoutResume = false;
let workoutResumeReady = false;
let programLinksReady = false;
let pendingAction = null;

window.addEventListener('fitWorkoutResumeRequest', ()=>{
  try{
    if(window.FitNative && window.FitNative.consumeWorkoutResume) window.FitNative.consumeWorkoutResume();
  }catch(_){}
  if(workoutResumeReady){
    resumeWorkoutFromNativeNotification().catch(()=>{});
    return;
  }
  pendingNativeWorkoutResume = true;
});

window.addEventListener('fitProgramLink', e => {
  const id = String((e && e.detail && e.detail.id) || '');
  if(!/^[0-9a-z]{4,16}$/.test(id)) return;
  try{
    if(window.FitNative && window.FitNative.consumeProgramLink) window.FitNative.consumeProgramLink();
  }catch(_){}
  if(programLinksReady){
    importProgramLink(id);
    return;
  }
  pendingNativeLink = id;
});

try{
  const sp = new URLSearchParams(location.search);
  const q = sp.get('import');
  if(q && q.startsWith('FIT1.')) pendingImport = q;
  const pathLink = String(location.pathname || '').match(/^\/p\/([0-9a-z]{4,16})\/?$/);
  if(pathLink) pendingLink = pathLink[1];
  const sp_p = sp.get('p');
  if(!pendingLink && sp_p && /^[0-9a-z]{4,16}$/.test(sp_p)) pendingLink = sp_p;
  if(sp.has('today')) pendingAction = 'today';
  if(sp.has('create')) pendingAction = 'create';
  if(pendingImport || pendingLink || pendingAction){
    history.replaceState({scr: 'scrMenu'}, '', '/'); // чистим адрес после разбора ссылки
  }
  if(window.FitNative && window.FitNative.consumeProgramLink){
    const nativeId = String(window.FitNative.consumeProgramLink() || '');
    if(/^[0-9a-z]{4,16}$/.test(nativeId)) pendingNativeLink = nativeId;
  }
  if(window.FitNative && window.FitNative.consumeWorkoutResume){
    pendingNativeWorkoutResume = !!window.FitNative.consumeWorkoutResume();
  }
}catch(e){}

(async ()=>{
  // Замок обязан появиться раньше, чем под ним что-то отрисуется, а общее чтение
  // аккаунта асинхронное. Поэтому признак замка снимаем синхронно, до первого await.
  try{
    const raw = localStorage.getItem('account');
    const saved = raw && JSON.parse(raw);
    if(window.FitNative && window.FitNative.isNative
      && saved && saved.biometry && saved.biometry.enabled && saved.biometry.kind === 'native'){
      $('lockModal').classList.add('open');
    }
  }catch(e){}
  // Язык нужен до онбординга и первой отрисовки экранов.
  await loadAppLocale();
  trackInstallOnce().catch(()=>{});
  // Аккаунт не переопределяет язык устройства: по умолчанию приложение всегда
  // следует системе. account.locale нужен серверу и письмам как эффективный язык.
  await loadAccount();
  // Старый TWA/WebAuthn credential относится к прежнему browser origin и не
  // переносится в локальный Capacitor runtime. Снимаем старый флаг один раз:
  // пользователь сможет включить новую нативную защиту в настройках.
  if(account && account.biometry && account.biometry.enabled && account.biometry.kind !== 'native'){
    account.biometry = null;
    rememberAccount();
    await saveAccount();
    await saveKnown();
    $('lockModal').classList.remove('open');
  }
  loadPublicConfig();
  syncRemotePushRegistration(false).catch(()=>{});
  bioOK = await bioSupported();
  if(lockNeeded()) openLock();
  // пользователи: миграция со старой схемы профилей f/m
  try{ users = JSON.parse(await kvGet('users')) || []; }catch(e){ users = []; }
  const hadLegacyBirth = users.some(u => u && Object.prototype.hasOwnProperty.call(u, 'birth'));
  let migratedProfilePrefs = false;
  users.forEach(u => {
    migrateUserAge(u);
    if(!['system','ru','en'].includes(u && u.locale)){
      u.locale = 'system';
      migratedProfilePrefs = true;
    }
  });
  if(hadLegacyBirth || migratedProfilePrefs) await saveUsers();
  if(!users.length){
    // старые данные есть — тихая миграция; совсем чистая установка — онбординг
    const hasLegacy = (await kvGet('customPrograms_f')) !== null
      || (await kvGet('customPrograms')) !== null
      || (await kvGet('migrated')) === '1';
    if(!hasLegacy){
      voiceWanted = false; soundOn = true;
      musicMode = false;
      syncPrefs();
      applyThemeFor({theme:'system'});
      document.body.classList.remove('booting');
      startOnboarding();
      return;
    }
    users = [{id:'f', name:t('profile.defaultNumber',{count:1}), gender:'f', age:null, photo:null, theme:'system', locale:'system'}];
    if((await kvGet('customPrograms_m')) !== null){
      users.push({id:'m', name:t('profile.defaultNumber',{count:2}), gender:'m', age:null, photo:null, theme:'system', locale:'system'});
    }
    await saveUsers();
  }
  currentUser = (await kvGet('currentUser')) || (await kvGet('profile')) || users[0].id;
  if(!users.some(u => u.id === currentUser)) currentUser = users[0].id;
  // До первой динамической отрисовки включаем язык и тему активного профиля:
  // пользователь не должен видеть дефолтный экран, пока восстанавливается его состояние.
  await setAppLocale(profileLocalePreference(curUser()), {persist:false, silent:true});
  applyThemeFor(curUser());
  await loadIdentity();
  await loadData();
  await loadPhotos();
  await ensureWarmup();
  applyProgressionAll();
  renderUsers();
  renderMine();
  renderStats();
  renderWeight();
  renderWellness();
  renderPhotos();
  // scrMenu показывается ещё до асинхронной загрузки данных. После загрузки
  // обязательно собираем его повторно, иначе на чистом/медленном старте часть
  // карточек остаётся в состоянии до loadData().
  renderGreeting();
  renderToday();
  checkSchedules();
  // Критичные локальные данные уже восстановлены — дальше идут только второстепенные
  // настройки и сеть, поэтому основной интерфейс можно показать без дефолтного флэша.
  document.body.classList.remove('booting');
  const hasScheduledWorkout = customPrograms.some(p => p && p.id !== 'warmup'
    && progActive(p) && planDays(p).length);
  if(hasScheduledWorkout && getNotificationPrefs().workouts !== false){
    appRuntimeCompat.requestNotifications().then(ok => { if(ok) syncNativeNotifications(); });
  } else syncNativeNotifications();
  hfMode = (await kvGet('hfMode')) || (((await kvGet('voiceCtl')) === '1' && !!SR) ? 'voice' : 'off');
  // Удалённый режим мог остаться в старой резервной копии или localStorage.
  if(!['off', 'voice', 'headset'].includes(hfMode)){
    hfMode = 'off';
    kvSet('hfMode', 'off');
  }
  voiceWanted = hfMode === 'voice';
  syncHandsFreeUI();
  soundOn = (await kvGet('soundOff')) !== '1';
  voiceLang = localeTag();
  savedVoiceURI = (await kvGet('voiceURI')) || '';
  recognitionLang = (await kvGet('recognitionLang')) || appLocale;
  if(!['ru','en'].includes(recognitionLang)) recognitionLang='ru';
  musicMode = (await kvGet('musicMode')) === '1';
  applyAudioFromUser(curUser());
  await syncTtsLocaleToApp(false);
  await refreshVoicePackUI();
  syncPrefs();
  const u = curUser();
  applyThemeFor(u);
  syncSettingsForm();

  // Only now are profile/program/session data and workout preferences ready. A notification
  // tap can restore locally without waiting for subscription/trainer network requests.
  workoutResumeReady = true;
  if(pendingNativeWorkoutResume){
    pendingNativeWorkoutResume = false;
    await resumeWorkoutFromNativeNotification();
  } else if(appRuntimeCompat.hasNative('clearWorkoutState')){
    // If Android/iOS kept a native surface but there is no matching saved session, it is stale.
    const bootSession = await loadSession();
    if(!bootSession) appRuntimeCompat.clearWorkoutState();
  }

  // Серверное состояние обновляем уже поверх готового локального интерфейса.
  await refreshServerSubscription(true);
  if(account.email && account.syncToken){
    await connectAccountSync();
    await refreshTrainerProfile();
  }
  programLinksReady = true;
  if(pendingImport){
    importProgramCode(pendingImport);
    pendingImport = null;
    return;
  }
  if(pendingLink){
    const id = pendingLink;
    pendingLink = null;
    importProgramLink(id);
    return;
  }
  if(pendingAction === 'today'){
    pendingAction = null;
    // ярлык «Тренировка дня»: открываем сегодняшнюю невыполненную, иначе первую по расписанию
    const today = DAYS[(new Date().getDay() + 6) % 7];
    const doneT = new Set(stats.history.filter(h => h.d === localISO(new Date())).map(h => h.pid));
    const sched = customPrograms.filter(p => planDays(p).includes(today));
    const pick = sched.find(p => !doneT.has(p.id)) || sched[0];
    if(pick){ openStart(pick); return; }
  }
  if(pendingAction === 'create'){
    pendingAction = null;
    $('createModal').classList.add('open');
  }
})();

