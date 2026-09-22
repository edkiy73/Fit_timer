const {sanitizeSettings}=require('../lib/ai');

let bad=0;
const ok=(name,cond,extra)=>{if(!cond)bad++;console.log((cond?'  ok  ':' ПЛОХО')+'  '+name+(extra==null?'':' → '+extra));};

const base=sanitizeSettings({
  update:{android:{
    latestCode:260001234,
    minimumCode:260001000,
    latestName:'1.0.1234',
    url:'https://play.google.com/store/apps/details?id=ru.fittimer.app',
    messageRu:'Новая версия',
    messageEn:'New version'
  }}
});
ok('release version codes survive sanitize',base.update.android.latestCode===260001234&&base.update.android.minimumCode===260001000,JSON.stringify(base.update.android));
ok('https update URL allowed',base.update.android.url.startsWith('https://play.google.com/'),base.update.android.url);
ok('copy survives bounded sanitize',base.update.android.messageRu==='Новая версия'&&base.update.android.messageEn==='New version');

const bounded=sanitizeSettings({update:{android:{latestCode:100,minimumCode:120,url:'market://details?id=ru.fittimer.app'}}});
ok('minimum cannot exceed latest',bounded.update.android.minimumCode===100,JSON.stringify(bounded.update.android));
ok('market URL allowed',bounded.update.android.url.startsWith('market://'),bounded.update.android.url);

const disabled=sanitizeSettings({update:{android:{latestCode:0,minimumCode:50,url:'javascript:alert(1)'}}});
ok('minimum disabled when latest is zero',disabled.update.android.minimumCode===0,JSON.stringify(disabled.update.android));
ok('unsafe update URL rejected',disabled.update.android.url==='');

process.exit(bad?1:0);
