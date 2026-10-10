// @ts-check
/** Operator-only SQL generator. No network, credentials, automatic apply or arbitrary SQL targets. */
import { loadSeed } from './seed-dry-run.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
/** @typedef {{table:string;key:string;seedKey:string;value:Record<string,unknown>}} SeedRecord */
/** @param {{manifestPath:string;projectRef:string;stage:string;scope:'catalog'|'profiles';operation:'sync'|'cleanup'}} options */
export function payload(options){
  const {manifest,catalog}=loadSeed(options);
  /** @type {SeedRecord[]} */ let records=[];
  if(options.operation==='sync'){
    records=options.scope==='catalog'?catalog.categories.flatMap((c,position)=>[
      {table:'feture_categories',key:c.id,seedKey:c.id,value:{id:c.id,title:c.title,short_title:c.short,icon:c.icon,accent_color:c.color,position}},
      ...c.interests.map((i,position)=>({table:'feture_interests',key:i.id,seedKey:i.id,value:{id:i.id,category_id:c.id,title:i.title,position}}))
    ]):manifest.profiles.map(p=>{const key='seed:'+manifest.datasetId+':'+p.seedKey;return {table:'feture_profiles',key,seedKey:p.seedKey,value:{account_hash:key,display_name:p.displayName,about:p.about,dating_enabled:false}};});
  }
  return {datasetId:options.scope==='catalog'?'feture-reference-catalog-v1':manifest.datasetId,
    kind:options.scope==='catalog'?'reference-catalog':'synthetic-development',version:manifest.generationVersion,
    source:options.scope==='catalog'?'data/concept-catalog.json; exact bootstrap catalog from feture_appbase_shared_domain_initial':manifest.provenance.source,records};
}
/** @param {string} value */
const literal=value=>"'"+value.replaceAll("'","''")+"'";
/** @param {Parameters<typeof payload>[0] & {mode:'preview'|'apply';reviewToken?:string;adopt:boolean}} options */
export function sql(options){
  if(typeof options.adopt!=='boolean'||!['catalog','profiles'].includes(options.scope)||!['sync','cleanup'].includes(options.operation)||!['preview','apply'].includes(options.mode)||
    options.mode==='apply'&&!/^[a-f0-9]{64}$/.test(options.reviewToken||'')||options.mode==='preview'&&options.reviewToken||
    options.adopt&&(options.scope!=='catalog'||options.operation!=='sync'))throw new Error('invalid_seed_options');
  const data=payload(options);
  if(!/^[1-9][0-9]{0,5}$/.test(data.version))throw new Error('invalid_generation_version');
  return `begin;\nset local standard_conforming_strings=on;\nset local lock_timeout='3s';\nset local statement_timeout='15s';\nselect feture_seed.manage(${literal(JSON.stringify(data))}::jsonb,${literal(options.projectRef)},${literal(options.stage)},${literal(options.operation)},${options.mode==='apply'},${options.reviewToken?literal(options.reviewToken):'null'},${options.adopt});\ncommit;\n`;
}
/** @param {string[]} args */
function options(args){
  /** @type {Record<string,string>} */const v={};
  for(let i=0;i<args.length;i+=2){const k=args[i],value=args[i+1];if(!['--manifest','--project-ref','--stage','--scope','--operation','--mode','--review-token','--adopt-exact-catalog'].includes(k)||!value||value.startsWith('--')||Object.hasOwn(v,k))throw new Error('invalid_arguments');v[k]=value;}
  if(!v['--project-ref']||!v['--stage']||!v['--scope'])throw new Error('project_stage_scope_required');
  if(v['--adopt-exact-catalog']&&!['true','false'].includes(v['--adopt-exact-catalog']))throw new Error('invalid_arguments');
  return {manifestPath:v['--manifest']||'seed/development-manifest.json',projectRef:v['--project-ref'],stage:v['--stage'],
    scope:/** @type {'catalog'|'profiles'} */(v['--scope']),operation:/** @type {'sync'|'cleanup'} */(v['--operation']||'sync'),
    mode:/** @type {'preview'|'apply'} */(v['--mode']||'preview'),reviewToken:v['--review-token'],adopt:v['--adopt-exact-catalog']==='true'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{process.stdout.write(sql(options(process.argv.slice(2))));}
  catch{console.error(JSON.stringify({error:'invalid_seed_request',writes:0}));process.exitCode=1;}
}
