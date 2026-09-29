#!/usr/bin/env node
// Production readiness of UnMute: node scripts/check-production.mjs [--api URL]
// Fails when learners would see an empty app (course or lexicon not published, storage down);
// warns about services that only limit the launch (test mail sender, no AI provider).
const argIndex=process.argv.indexOf('--api');
const API=(argIndex>0?process.argv[argIndex+1]:'https://unmute99.vercel.app').replace(/\/$/,'');
const SET_ID='general-foundation';

async function get(path){
  const response=await fetch(API+path,{signal:AbortSignal.timeout(20000)});
  const body=await response.json().catch(()=>({}));
  return {status:response.status,body};
}

const errors=[],warnings=[];
const health=await get('/api/health');
if(health.body?.storage?.mode!=='redis'||!health.body?.storage?.connected)errors.push('storage is not connected Redis');
if(health.body?.services?.mail?.testDomain)warnings.push('mail uses the Resend test sender: codes reach only the Resend account owner');
if(!health.body?.services?.ai?.configured)warnings.push('no AI provider configured: AI conversation and answer explanations are unavailable');

const catalog=await get('/api/content');
if(!(catalog.body?.catalog?.sets||[]).some(set=>set&&set.id===SET_ID))errors.push('course '+SET_ID+' is not published (/api/content catalog is empty)');
const lexicon=await get('/api/lexicon?action=meta');
if(lexicon.status!==200||!lexicon.body?.count)errors.push('lexicon is not published (/api/lexicon '+lexicon.status+' '+(lexicon.body?.error||'')+')');

console.log(JSON.stringify({api:API,commit:health.body?.deployment?.commit||null,lexiconEntries:lexicon.body?.count||0,errors,warnings},null,2));
for(const warning of warnings)console.log('::warning::'+warning);
for(const error of errors)console.log('::error::'+error);
process.exit(errors.length?1:0);
