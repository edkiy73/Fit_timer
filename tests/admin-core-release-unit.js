/* Core Admin release ownership regression. */
let bad=0;
function ok(name,cond){
  if(!cond) bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name);
}

const mod=require('../lib/admin/core/release');

(async()=>{
  ok('Core Admin owns Android release action',mod.ACTIONS.has('android_release_latest'));
  ok('Core release does not own product catalog actions',!mod.ACTIONS.has('catalog_ai_create'));

  const cfg=mod.releaseConfig({
    repo:'example/app',
    tag:'latest',
    archiveTag:'archive',
    metaName:'App-release.json',
    latestAsset:'App-latest.apk',
    archivePrefix:'App',
    userAgent:'Example-admin'
  });
  ok('release config remains product-injected',
    cfg.repo==='example/app'&&cfg.metaName==='App-release.json'&&cfg.archivePrefix==='App');

  let rejected=false;
  try{mod.releaseConfig({repo:'bad repo'});}catch(e){rejected=e&&e.message==='release_config_invalid';}
  ok('invalid product release config is rejected',rejected);

  const res={statusCode:0,setHeader(){},end(){}};
  const handled=await mod.handleAdminRelease('catalog_ai_create',res,cfg);
  ok('release handler ignores product-domain action',handled===false&&res.statusCode===0);

  process.exit(bad?1:0);
})().catch(e=>{
  console.error(e);
  process.exit(1);
});
