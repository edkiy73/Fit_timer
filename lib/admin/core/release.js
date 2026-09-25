'use strict';

const { send, fail, clampLine } = require('../../util');

const ACTIONS = new Set(['android_release_latest']);

function safeRepo(value){
  const v=String(value||'');
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(v)?v:'';
}

function releaseConfig(input){
  input=input&&typeof input==='object'?input:{};
  const repo=safeRepo(input.repo);
  const tag=clampLine(input.tag,80);
  const archiveTag=clampLine(input.archiveTag,80);
  const metaName=clampLine(input.metaName,120);
  const latestAsset=clampLine(input.latestAsset,120);
  const archivePrefix=clampLine(input.archivePrefix,80);
  const userAgent=clampLine(input.userAgent,120)||'AppBase-admin';
  if(!repo||!tag||!archiveTag||!metaName||!latestAsset||!archivePrefix){
    throw new Error('release_config_invalid');
  }
  return {repo,tag,archiveTag,metaName,latestAsset,archivePrefix,userAgent};
}

function archivedApkUrl(url,versionCode,cfg){
  const want=`https://github.com/${cfg.repo}/releases/download/${cfg.archiveTag}/${cfg.archivePrefix}-${versionCode}.apk`;
  return String(url||'')===want?want:'';
}

async function latestAndroidRelease(input){
  const cfg=releaseConfig(input);
  const base=`https://github.com/${cfg.repo}/releases/download/${cfg.tag}`;
  const metaRes=await fetch(`${base}/${cfg.metaName}`,{
    redirect:'follow',
    headers:{'User-Agent':cfg.userAgent}
  });
  if(!metaRes.ok) throw new Error('release_metadata_'+metaRes.status);
  const meta=await metaRes.json().catch(()=>null);
  const versionCode=Math.max(0,Math.round(+(meta&&meta.versionCode)||0));
  const versionName=clampLine(meta&&meta.versionName,40);
  if(!versionCode||!versionName) throw new Error('release_metadata_invalid');
  return {
    versionCode,
    versionName,
    apkUrl:archivedApkUrl(meta&&meta.apkUrl,versionCode,cfg)||`${base}/${cfg.latestAsset}`,
    releaseUrl:`https://github.com/${cfg.repo}/releases/tag/${cfg.tag}`,
    commit:clampLine(meta&&meta.commit,80),
    builtAt:clampLine(meta&&meta.builtAt,80)
  };
}

async function handleAdminRelease(action,res,config){
  if(!ACTIONS.has(action)) return false;
  try{
    send(res,200,{ok:true,release:await latestAndroidRelease(config)});
  }catch(e){
    fail(res,502,'android_release_unavailable',{detail:String(e&&e.message||e).slice(0,120)});
  }
  return true;
}

module.exports={handleAdminRelease,latestAndroidRelease,releaseConfig,ACTIONS};
