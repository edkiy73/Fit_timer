#!/usr/bin/env node
// Targeted fix of the live main course (general-foundation), owner decisions 9, 10, 16:
//   - the Russian phrase (`source`) for written tasks the old importer lost (52 tasks);
//   - `displayAnswer` for lowercase answers («i didn't go» → «I didn't go.»);
//   - day 1 ends with three phrases said aloud.
// It reads the current admin draft, changes only these fields, uploads it and releases the
// course, so other edits made in the admin stay. Safe to re-run: a second run changes nothing.
// CI runs it after a change in main (.github/workflows/unmute-general-course-patch.yml); by hand:
//   ADMIN_KEY=... node scripts/patch-general-course.mjs [--api URL] [--source file-or-url] [--dry-run] [--no-publish]
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parseLegacySource, buildCourseSet, buildLexicon } from '../lib/legacy-import.mjs';
import { applyDayOneVoice, fillDisplayAnswers, fillMissingSources } from '../lib/general-course-patches.mjs';

const LEGACY_SOURCE_SHA='011572be908d64a1e092e63a821e407d85753205';
const LEGACY_SOURCE_URL='https://raw.githubusercontent.com/edkiy73/English/'+LEGACY_SOURCE_SHA+'/index.html';
const SET_ID='general-foundation';

function parseArgs(argv){
  const out={source:LEGACY_SOURCE_URL,api:'https://unmute99.vercel.app',publish:true,dryRun:false};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==='--source')out.source=argv[++i];
    else if(a==='--api')out.api=argv[++i];
    else if(a==='--no-publish')out.publish=false;
    else if(a==='--dry-run')out.dryRun=true;
    else if(a==='--help')out.help=true;
  }
  return out;
}

async function readSource(value){
  if(/^https?:\/\//i.test(value)){
    const response=await fetch(value);
    if(!response.ok)throw new Error('source_http_'+response.status);
    return response.text();
  }
  return fs.readFile(value,'utf8');
}

async function post(base,path,key,body){
  const response=await fetch(base.replace(/\/$/,'')+path,{
    method:'POST',
    headers:{'Content-Type':'application/json','X-Admin-Key':encodeURIComponent(key)},
    body:JSON.stringify(body)
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(path+':'+response.status+':'+(payload.error||'request_failed'));
  return payload;
}

/** Applies the three fixes to `set` in place and reports what changed. */
export function patchCourse(set,fresh){
  const sources=fillMissingSources(set,fresh);
  const displayAnswers=fillDisplayAnswers(set);
  const voice=applyDayOneVoice(set);
  return {sources:sources.length,displayAnswers,voice,changed:sources.length>0||displayAnswers>0||voice};
}

const args=parseArgs(process.argv.slice(2));
if(args.help){
  console.log('Usage: ADMIN_KEY=... node scripts/patch-general-course.mjs [--api URL] [--source file-or-url] [--dry-run] [--no-publish]');
  process.exit(0);
}

const Content=createRequire(import.meta.url)('../lib/content-store.js');
const model=parseLegacySource(await readSource(args.source));
const fresh=buildCourseSet(model,buildLexicon(model));
Content.validateSet(fresh);
console.log('fresh build: '+fresh.activities.length+' activities');
if(args.dryRun)process.exit(0);

const key=process.env.ADMIN_KEY||'';
if(!key)throw new Error('ADMIN_KEY_required');

const {draft}=await post(args.api,'/api/content',key,{action:'draft_get',id:SET_ID});
const report=patchCourse(draft,fresh);
console.log('phrases added: '+report.sources+' · display answers: '+report.displayAnswers+' · day 1 voice: '+(report.voice?'added':'already there'));
let release=report.changed;
if(report.changed){
  delete draft.draftUpdatedAt;
  Content.validateSet(draft);
  await post(args.api,'/api/content',key,{action:'draft_put',set:draft});
  console.log('draft uploaded: '+SET_ID);
}else{
  // A previous run may have uploaded the fix but failed to release it.
  const status=await post(args.api,'/api/content',key,{action:'status',id:SET_ID});
  release=Date.parse(status.draftUpdatedAt||'')>Date.parse(status.publishedAt||'');
  console.log(release?'fix uploaded earlier, not released yet':'nothing to change');
}
if(release&&args.publish){
  const result=await post(args.api,'/api/admin',key,{action:'content_publish',setIds:[SET_ID]});
  console.log('released: '+SET_ID+' · release r'+String(result.release&&result.release.revision||'?'));
}
