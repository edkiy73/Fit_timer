const fitTelemetry = AppBaseTelemetry.createTelemetry({
  async sendAnalytics(input){
    const body = {
      action:'analytics',
      event:String(input.event || ''),
      deviceId:await analyticsDeviceId(),
      platform:analyticsPlatform(),
      locale:(typeof appLocale !== 'undefined' && appLocale === 'en') ? 'en' : 'ru',
      premium:(typeof isPremium === 'function') ? !!isPremium() : false
    };
    const res = await fetch('/api/auth',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
      keepalive:true,
      cache:'no-store'
    });
    return !!res.ok;
  },

  async sendDiagnostic(input){
    const body = Object.assign({
      action:'client_error',
      build:String(window.FIT_TIMER_BUILD || '').slice(0,80),
      platform:analyticsPlatform(),
      locale:(typeof appLocale !== 'undefined' && appLocale === 'en') ? 'en' : 'ru'
    }, input);
    delete body.context;
    const res=await fetch('/api/auth',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
      keepalive:true,
      cache:'no-store'
    });
    return !!res.ok;
  }
});

function trackProductEvent(event, properties){
  return fitTelemetry.track(event, properties);
}

function reportClientError(kind, error, fallbackMessage, context){
  return fitTelemetry.capture(kind, error, fallbackMessage, context);
}
