const {sanitizeSettings}=require('../lib/ai');

let bad=0;
const ok=(name,cond,extra)=>{if(!cond)bad++;console.log((cond?'  ok  ':' ПЛОХО')+'  '+name+(extra==null?'':' → '+extra));};

const base=sanitizeSettings({
  update:{android:{
    latestCode:260001234,
    minimumCode:260001000,
    latestName:'1.0.1234',
    url:'https://github.com/edkiy73/Fit_timer/releases/download/latest-apk/FitTimer-latest.apk',
    messageRu:'Новая версия',
    messageEn:'New version'
  }}
});
ok('release version codes survive sanitize',base.update.android.latestCode===260001234&&base.update.android.minimumCode===260001000,JSON.stringify(base.update.android));
ok('direct https update URL allowed',base.update.android.url.includes('/latest-apk/FitTimer-latest.apk'),base.update.android.url);
ok('legacy flat release becomes direct channel',base.update.android.direct.latestCode===260001234,JSON.stringify(base.update.android.direct));
ok('store remains unpublished for a legacy direct config',base.update.android.store.latestCode===0,JSON.stringify(base.update.android.store));
ok('copy survives bounded sanitize',base.update.android.messageRu==='Новая версия'&&base.update.android.messageEn==='New version');

const bounded=sanitizeSettings({update:{android:{store:{latestCode:100,minimumCode:120,url:'market://details?id=ru.fittimer.app'}}}});
ok('store minimum cannot exceed latest',bounded.update.android.store.minimumCode===100,JSON.stringify(bounded.update.android.store));
ok('market URL allowed for store',bounded.update.android.store.url.startsWith('market://'),bounded.update.android.store.url);
ok('store config never leaks into legacy direct alias',bounded.update.android.latestCode===0,JSON.stringify(bounded.update.android));

const disabled=sanitizeSettings({update:{android:{
  direct:{latestCode:0,minimumCode:50,url:'javascript:alert(1)'},
  store:{latestCode:50,minimumCode:0,url:'javascript:alert(1)'}
}}});
ok('minimum disabled when latest is zero',disabled.update.android.direct.minimumCode===0,JSON.stringify(disabled.update.android.direct));
ok('unsafe direct update URL rejected',disabled.update.android.direct.url==='');
ok('unsafe store update URL rejected',disabled.update.android.store.url==='');

process.exit(bad?1:0);
