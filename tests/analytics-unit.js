process.env.ALLOW_MEMORY_STORE='1';
const {recordAnalytics,removeAnalyticsDevice,analyticsStats}=require('../lib/analytics');

let bad=0;
const ok=(name,cond,extra)=>{if(!cond)bad++;console.log((cond?'  ok  ':' ПЛОХО')+'  '+name+(extra==null?'':' → '+extra));};

(async()=>{
  await recordAnalytics({event:'install',deviceId:'dev-a',platform:'android',locale:'ru'});
  await recordAnalytics({event:'install',deviceId:'dev-a',platform:'android',locale:'ru'});
  await recordAnalytics({event:'install',deviceId:'dev-b',platform:'web',locale:'en'});
  await recordAnalytics({event:'account_created',deviceId:'dev-a',platform:'android',locale:'ru'});
  await recordAnalytics({event:'workout_completed',deviceId:'dev-a',platform:'android',locale:'ru'});
  await recordAnalytics({event:'workout_3',deviceId:'dev-a',platform:'android',locale:'ru'});
  await recordAnalytics({event:'ai_used',deviceId:'dev-a',platform:'android',locale:'ru'});
  await recordAnalytics({event:'premium_opened',deviceId:'dev-a',platform:'android',locale:'ru',premium:true});
  const s=await analyticsStats(1);
  const today=s.rows[0];
  ok('события считаются',today.events.install.count===3,JSON.stringify(today.events.install));
  ok('unique не дублирует одно устройство',today.events.install.unique===2,JSON.stringify(today.events.install));
  ok('другое событие считается отдельно',today.events.workout_completed.count===1);
  ok('платформы агрегируются по событиям',today.platform.android===7&&today.platform.web===1,JSON.stringify(today.platform));
  ok('Premium-флаг хранится только агрегатом',today.premium===1,String(today.premium));
  ok('воронка считает устройство один раз за весь период',s.totals.install.unique===2&&s.totals.account_created.unique===1&&s.totals.ai_used.unique===1,JSON.stringify(s.totals));
  ok('cohort содержит только анонимные агрегаты',s.cohort.devices===2&&s.cohort.platform.android===1&&s.cohort.platform.web===1,JSON.stringify(s.cohort));
  await removeAnalyticsDevice('dev-b');
  const after=await analyticsStats(1);
  ok('analytics device удаляется по deviceId',after.cohort.devices===1,JSON.stringify(after.cohort));
  let rejected=false;
  try{await recordAnalytics({event:'email_opened',deviceId:'dev-a'});}catch(e){rejected=e&&e.message==='bad_event';}
  ok('неизвестное событие отклоняется',rejected);
  process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
