#!/usr/bin/env node
// Uploads the small A1 test course as a draft and (with --publish) releases it next to the
// already published courses. The release keeps every earlier published set.
import { buildA1StarterCourse, A1_STARTER_ID } from '../lib/a1-starter-course.mjs';

function parseArgs(argv){
  const out={api:'https://unmute99.vercel.app',publish:false,dryRun:false};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==='--api')out.api=argv[++i];
    else if(a==='--publish')out.publish=true;
    else if(a==='--dry-run')out.dryRun=true;
    else if(a==='--help')out.help=true;
  }
  return out;
}

async function post(base,path,key,body){
  const response=await fetch(base.replace(/\/$/,'')+path,{
    method:'POST',
    headers:{'Content-Type':'application/json','X-Admin-Key':encodeURIComponent(key)},
    body:JSON.stringify(body)
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(path+':'+response.status+':'+(payload.error||'request_failed')+(payload.sets?' '+JSON.stringify(payload.sets):''));
  return payload;
}

const args=parseArgs(process.argv.slice(2));
if(args.help){
  console.log('Usage: ADMIN_KEY=... node scripts/seed-a1-course.mjs [--api URL] [--dry-run] [--publish]');
  process.exit(0);
}

const course=buildA1StarterCourse();
console.log(A1_STARTER_ID+': '+course.roadmaps[0].nodes.length+' days, '+course.activities.length+' activities');
if(args.dryRun)process.exit(0);

const key=process.env.ADMIN_KEY||'';
if(!key)throw new Error('ADMIN_KEY_required');

console.log(await post(args.api,'/api/content',key,{action:'draft_put',set:course}));
if(args.publish){
  console.log(JSON.stringify(await post(args.api,'/api/admin',key,{action:'content_publish',setIds:[A1_STARTER_ID]})));
}else{
  console.log('Draft uploaded. Re-run with --publish to release it.');
}
