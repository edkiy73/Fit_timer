#!/usr/bin/env node
import fs from 'node:fs/promises';
import { parseLegacySource,buildCourseSet,buildLexicon,validateImport } from '../lib/legacy-import.mjs';

const LEGACY_SOURCE_SHA='011572be908d64a1e092e63a821e407d85753205';
const LEGACY_SOURCE_URL='https://raw.githubusercontent.com/edkiy73/English/'+LEGACY_SOURCE_SHA+'/index.html';

function parseArgs(argv){
  const out={source:LEGACY_SOURCE_URL,api:'https://unmute99.vercel.app',publish:false,dryRun:false};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==='--source')out.source=argv[++i];
    else if(a==='--api')out.api=argv[++i];
    else if(a==='--publish')out.publish=true;
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

const args=parseArgs(process.argv.slice(2));
if(args.help){
  console.log('Usage: ADMIN_KEY=... node scripts/import-legacy-content.mjs [--source file-or-url] [--api URL] [--dry-run] [--publish]');
  process.exit(0);
}

const source=await readSource(args.source);
const model=parseLegacySource(source);
const lexicon=buildLexicon(model);
const course=buildCourseSet(model,lexicon);
const report=validateImport(model,course,lexicon);
console.log(JSON.stringify(report,null,2));

if(args.dryRun)process.exit(0);

const key=process.env.ADMIN_KEY||'';
if(!key)throw new Error('ADMIN_KEY_required');

console.log(await post(args.api,'/api/content',key,{action:'draft_put',set:course}));
console.log(await post(args.api,'/api/lexicon',key,{action:'draft_put',lexicon}));

if(args.publish){
  console.log(await post(args.api,'/api/content',key,{action:'publish',id:'general-foundation'}));
  console.log(await post(args.api,'/api/lexicon',key,{action:'publish'}));
}else{
  console.log('Drafts uploaded. Re-run with --publish after review.');
}
