#!/usr/bin/env node
// Courses that live in code (the list below) are uploaded as drafts and released together,
// keeping every other published course. CI runs this after a course file changes in main
// (.github/workflows/unmute-content-release.yml); by hand:
//   ADMIN_KEY=... node scripts/release-courses.mjs [--api URL] [--dry-run] [--no-publish]
// A code course is owned by its file: a release replaces edits made to it in the admin.
import { buildA1StarterCourse } from '../lib/a1-starter-course.mjs';
import { createRequire } from 'node:module';

const COURSES = [buildA1StarterCourse];

function parseArgs(argv){
  const out={api:'https://unmute99.vercel.app',publish:true,dryRun:false};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==='--api')out.api=argv[++i];
    else if(a==='--no-publish')out.publish=false;
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
  console.log('Usage: ADMIN_KEY=... node scripts/release-courses.mjs [--api URL] [--dry-run] [--no-publish]');
  process.exit(0);
}

const Content=createRequire(import.meta.url)('../lib/content-store.js');
const courses=COURSES.map(build=>build());
for(const course of courses){
  Content.validateSet(course);
  console.log(course.id+': '+course.roadmaps[0].nodes.length+' days, '+course.activities.length+' activities');
}
if(args.dryRun)process.exit(0);

const key=process.env.ADMIN_KEY||'';
if(!key)throw new Error('ADMIN_KEY_required');

for(const course of courses){
  await post(args.api,'/api/content',key,{action:'draft_put',set:course});
  console.log('draft uploaded: '+course.id);
}
if(args.publish){
  const result=await post(args.api,'/api/admin',key,{action:'content_publish',setIds:courses.map(course=>course.id)});
  console.log('released: '+courses.map(course=>course.id).join(', ')+' · release r'+String(result.release&&result.release.revision||'?'));
}
