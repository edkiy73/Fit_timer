'use strict';
/* In-app Android updates for FetUre — the Core mechanism UnMute uses (Core admin/release.js reads the GitHub release,
 * Core ai.js sanitizes a channel, the phone decides with @appbase/core/app-update), with one difference: the published
 * state lives under FetUre's own key, not in Core `settings:ai`. FetUre shares the AppBase store with the other apps,
 * so writing Core settings from here would change FitTimer's / UnMute's update channels.
 *   GET  /api/config (→ /api/admin?public_config=1)  {update:{android:{direct,store}}}   public, no secrets
 *   POST /api/admin {action:'android_release_latest'}                                     admin key (Core admin)
 *   POST /api/admin {action:'feture.update.get'}                                          admin key
 *   POST /api/admin {action:'feture.update.publish', channel:'direct'|'store', release:{…}} admin key */
const {handleAdminRelease}=require('../../../packages/core/server/admin/release');
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
   const current=await readUpdate(store);
   if(action==='feture.update.get'){send(res,200,{ok:true,update:current});return true;}
   const channel=body.channel;
   if(channel!=='direct'&&channel!=='store'){fail(res,422,'invalid_channel');return true;}
   const release=sanitizeAndroidRelease(body.release,channel==='store');
   // The direct channel downloads only the immutable archive copy of a build: feture-latest is replaced by the next
   // build, and the phone would then reject the file as version_mismatch (FitTimer docs/mobile-release.md).
   if(channel==='direct'&&release.latestCode&&release.url!==`https://github.com/${ANDROID_RELEASE.repo}/releases/download/${ANDROID_RELEASE.archiveTag}/${ANDROID_RELEASE.archivePrefix}-${release.latestCode}.apk`){
    fail(res,422,'direct_url_must_be_archive');return true;
   }
   const next={...current,[channel]:release};
   await store.set(KEY,JSON.stringify(next));
   send(res,200,{ok:true,update:next});
  }catch{fail(res,503,'update_unavailable');}
  return true;
 };
}

module.exports={createUpdateAdmin,sendPublicUpdate,readUpdate,ANDROID_RELEASE,KEY};
