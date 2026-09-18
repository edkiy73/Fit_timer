/* Тонкий мост к нативным функциям. В обычном браузере все методы безопасно
   переходят на web fallback, поэтому index.html остаётся общей кодовой базой. */
(function(){
  const cap = window.Capacitor;
  const native = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  const plugins = (cap && cap.Plugins) || {};
  const REST_NOTIFICATION_ID = 901001;

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

  window.FitNative = Object.freeze({
    isNative: native,
    requestNotifications,
    scheduleRest,
    cancelRest,
    haptic
  });
})();
