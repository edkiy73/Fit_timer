'use strict';
/* In-app Android updates for FetUre — the Core mechanism UnMute uses (Core admin/release.js reads the GitHub release,
 * Core ai.js sanitizes a channel, the phone decides with @appbase/core/app-update), with one difference: the published
 * state lives under FetUre's own key, not in Core `settings:ai`. FetUre shares the AppBase store with the other apps,
 * so writing Core settings from here would change FitTimer's / UnMute's update channels.
 *   GET  /api/config (→ /api/admin?public_config=1)  {update:{android:{direct,store}}}   public, no secrets
 *   POST /api/admin {action:'android_release_latest'}                                     admin key (Core admin)
 *   POST /api/admin {action:'feture.update.get'}                                          admin key
 *   POST /api/admin {action:'feture.update.publish', channel:'direct'|'store', release:{…}} admin key
 * Every new build also publishes itself as a required direct update (publishLatestBuild, run by the jobs tick). */
const {handleAdminRelease,latestAndroidRelease}=require('../../../packages/core/server/admin/release');
const {sanitizeAndroidRelease}=require('../../../packages/core/server/ai');
const {send,fail}=require('../../../packages/core/server/util');

const KEY='feture:update:android:v1';
/** The APK built by .github/workflows/feture-android.yml (GitHub releases feture-latest / feture-apk-archive). */
const ANDROID_RELEASE=Object.freeze({
 repo:'edkiy73/Fit_timer',
 tag:'feture-latest',
 archiveTag:'feture-apk-archive',
 metaName:'FetUre-release.json',
 latestAsset:'FetUre-latest.apk',
 archivePrefix:'FetUre',
 userAgent:'FetUre-admin'
});

/** The immutable copy of a build the direct channel must point at (feture-latest is replaced by the next build, and
 * the phone would then reject the file as version_mismatch — FitTimer docs/mobile-release.md). @param {number} code */
const archiveApkUrl=code=>`https://github.com/${ANDROID_RELEASE.repo}/releases/download/${ANDROID_RELEASE.archiveTag}/${ANDROID_RELEASE.archivePrefix}-${code}.apk`;

/** @param {unknown} raw */
function sanitize(raw){
 const src=raw&&typeof raw==='object'?/** @type {Record<string,unknown>} */(raw):{};
 return {direct:sanitizeAndroidRelease(src.direct,false),store:sanitizeAndroidRelease(src.store,true)};
}

/** @param {{get(key:string):Promise<string|null|undefined>,set(key:string,value:string):Promise<unknown>}} store */
async function readUpdate(store){
 let saved=null;
 try{saved=JSON.parse(String(await store.get(KEY)||'null'));}catch{saved=null;}
 return sanitize(saved);
}

/** The one way a channel is published (the admin button and the server job): Core's sanitizer, the archive rule for
 * direct, the same KEY. @param {any} store @param {'direct'|'store'} channel @param {unknown} raw
 * @returns {Promise<{ok:true,update:{direct:any,store:any}}|{ok:false,error:string}>} */
async function saveChannel(store,channel,raw){
 const current=await readUpdate(store);
 const release=sanitizeAndroidRelease(raw,channel==='store');
 if(channel==='direct'&&release.latestCode&&release.url!==archiveApkUrl(release.latestCode))return {ok:false,error:'direct_url_must_be_archive'};
 const next={...current,[channel]:release};
 await store.set(KEY,JSON.stringify(next));
 return {ok:true,update:next};
}

/** Public part of /api/config: what the installed app compares its version with. */
/** @param {any} store @param {any} res */
async function sendPublicUpdate(store,res){
 res.setHeader('Cache-Control','public, max-age=60');
 let android;
 try{android=await readUpdate(store);}catch{android=sanitize(null);}
 return send(res,200,{update:{android}});
}

/** @param {any} store */
function createUpdateAdmin(store){
 /** @param {string} action @param {Record<string,unknown>} body @param {any} res */
 return async(action,body,res)=>{
  if(action==='android_release_latest')return handleAdminRelease(action,res,ANDROID_RELEASE);
  if(action!=='feture.update.get'&&action!=='feture.update.publish')return false;
  res.setHeader('Cache-Control','no-store');
  try{
   if(action==='feture.update.get'){send(res,200,{ok:true,update:await readUpdate(store)});return true;}
   const channel=body.channel;
   if(channel!=='direct'&&channel!=='store'){fail(res,422,'invalid_channel');return true;}
   const saved=await saveChannel(store,channel,body.release);
   if(!saved.ok){fail(res,422,saved.error);return true;}
   send(res,200,{ok:true,update:saved.update});
  }catch{fail(res,503,'update_unavailable');}
  return true;
 };
}

/* New builds publish themselves (owner: every APK build is a required update, no button to press). The jobs tick calls
 * this; it looks at GitHub at most every AUTO_EVERY_MS (the time of the last look is kept under AUTO_KEY), and
 * publishes the newest build exactly as «Выпустить последнюю сборку» would, with minimumCode = latestCode, only when
 * its number is above the published one (never a downgrade) and its archive APK answers 200 (a release still
 * uploading never ships). Any failure is quiet: the next look retries. FETURE_AUTO_PUBLISH_APK=0 turns it off.
 * The store channel (Google Play) is never touched. */
const AUTO_KEY='feture:update:android:auto:v1';
const AUTO_EVERY_MS=5*60*1000;
const ARCHIVE_PREFIX=`https://github.com/${ANDROID_RELEASE.repo}/releases/download/${ANDROID_RELEASE.archiveTag}/`;

/** @param {any} store
 * @param {{fetch?:typeof fetch,env?:Record<string,string|undefined>,now?:number,log?:(line:string)=>void,timeoutMs?:number}} [opts]
 * @returns {Promise<{published:number}|{skipped:string}>} */
async function publishLatestBuild(store,opts={}){
 const env=opts.env||process.env;
 if(env.FETURE_AUTO_PUBLISH_APK==='0')return {skipped:'off'};
 const get=opts.fetch||fetch;
 const now=opts.now??Date.now();
 const timeoutMs=opts.timeoutMs??10_000;
 try{
  let last=0;
  try{last=Number(JSON.parse(String(await store.get(AUTO_KEY)||'null'))?.checkedAt)||0;}catch{last=0;}
  if(now>=last&&now-last<AUTO_EVERY_MS)return {skipped:'recent'};
  await store.set(AUTO_KEY,JSON.stringify({checkedAt:now}),3600);
  const build=await latestAndroidRelease(ANDROID_RELEASE,{fetch:get,signal:AbortSignal.timeout(timeoutMs)});
  const url=build.apkUrl;
  if(!url.startsWith(ARCHIVE_PREFIX)||url!==archiveApkUrl(build.versionCode))return {skipped:'bad_url'};
  if(build.versionCode<=(await readUpdate(store)).direct.latestCode)return {skipped:'current'};
  const head=await get(url,{method:'HEAD',redirect:'follow',headers:{'User-Agent':ANDROID_RELEASE.userAgent},signal:AbortSignal.timeout(timeoutMs)});
  if(head.status!==200)return {skipped:'not_uploaded'};
  // Checked again right before the write: an admin may have published meanwhile.
  const current=await readUpdate(store);
  if(build.versionCode<=current.direct.latestCode)return {skipped:'current'};
  // What update-admin.tsx sends for «Выпустить последнюю сборку», required: «что нового» from the build when it has
  // one, otherwise the text already published (the admin field starts with it).
  const saved=await saveChannel(store,'direct',{latestCode:build.versionCode,latestName:build.versionName,url,
   minimumCode:build.versionCode,messageRu:build.notes||current.direct.messageRu,messageEn:''});
  if(!saved.ok)return {skipped:saved.error};
  (opts.log||console.log)(`feture_apk_published ${build.versionName} (${build.versionCode}), required`);
  return {published:build.versionCode};
 }catch{return {skipped:'unavailable'};}
}

module.exports={createUpdateAdmin,sendPublicUpdate,readUpdate,publishLatestBuild,ANDROID_RELEASE,KEY,AUTO_KEY};
