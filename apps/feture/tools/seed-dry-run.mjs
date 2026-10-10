// @ts-check
/** F05.1: offline review tool. It has no network client, credentials or mutation mode. */
import { readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';

const APP=resolve(dirname(fileURLToPath(import.meta.url)),'..');
/** @param {number} max */
const text=max=>z.string().trim().min(1).max(max).refine(value=>!/[\x00-\x1f\x7f]/.test(value));
const manifestSchema=z.object({
  schemaVersion:z.literal(1),datasetId:z.string().regex(/^feture-[a-z0-9-]{3,64}$/),
  generationVersion:text(40),expectedProjectRef:z.string().regex(/^[a-z0-9]{20}$/),expectedStage:z.literal('prelaunch'),
  provenance:z.object({kind:z.literal('synthetic-development'),source:text(200)}).strict(),
  catalog:z.object({path:z.literal('data/concept-catalog.json'),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
  profiles:z.array(z.object({seedKey:z.string().regex(/^[a-z0-9-]{2,40}$/),displayName:text(80),about:text(1000)}).strict()).max(10)
}).strict();
const interestSchema=z.object({id:z.string().regex(/^interest-[1-9]\d{0,2}-[1-9]\d{0,2}$/),title:text(160)}).strict();
const catalogSchema=z.object({version:z.literal(1),origin:text(200),categories:z.array(z.object({
  id:z.string().regex(/^category-[1-9]\d{0,2}$/),title:text(160),short:text(80),icon:text(40),
  color:z.string().regex(/^#[a-f0-9]{6}$/i),interests:z.array(interestSchema).min(1).max(100)
}).strict()).min(1).max(100),tests:z.array(z.unknown()).max(100)}).strict();
const tableName=z.enum(['feture_categories','feture_interests','feture_tests','feture_profiles','feture_interest_states','feture_posts','feture_profile_access','feture_test_responses','feture_dating_preferences']);
const inventorySchema=z.object({schemaVersion:z.literal(1),projectRef:z.string().regex(/^[a-z0-9]{20}$/),capturedOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),source:text(200),tables:z.array(z.object({
  table:tableName,rls:z.boolean(),columns:z.array(z.string().regex(/^[a-z_]+$/)).min(1),
  clientGrants:z.array(z.string().regex(/^(anon|authenticated|PUBLIC):(SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)$/)),rows:z.number().int().nonnegative().nullable()
}).strict()).max(9)}).strict();
/** @param {string} message @returns {never} */
const fail=message=>{throw new Error(message);};
/** @param {string} path @returns {string} */
function read(path){const file=realpathSync(resolve(APP,path));const local=relative(APP,file);if(local.startsWith('..')||isAbsolute(local))fail('source_outside_feture');const value=readFileSync(file,'utf8');if(Buffer.byteLength(value)>1024*1024)fail('source_too_large');return value;}
/** @param {unknown[]} ids */
function unique(ids){if(new Set(ids).size!==ids.length)fail('duplicate_seed_id');}
/** @param {{manifestPath:string;inventoryPath:string;projectRef:string;stage:string}} options */
export function dryRun({manifestPath,inventoryPath,projectRef,stage}){
  const manifestRaw=read(manifestPath),manifest=manifestSchema.parse(JSON.parse(manifestRaw));
  if(projectRef!==manifest.expectedProjectRef)fail('project_mismatch');
  if(stage!==manifest.expectedStage)fail('stage_mismatch');
  const inventoryRaw=read(inventoryPath);
  const inventory=inventorySchema.parse(JSON.parse(inventoryRaw));
  if(inventory.projectRef!==projectRef)fail('inventory_project_mismatch');
  unique(inventory.tables.map(t=>t.table));
  const catalogRaw=read(manifest.catalog.path);
  const digest=createHash('sha256').update(catalogRaw).digest('hex');
  if(digest!==manifest.catalog.sha256)fail('catalog_digest_mismatch');
  const catalog=catalogSchema.parse(JSON.parse(catalogRaw));
  unique(catalog.categories.map(c=>c.id));unique(catalog.categories.flatMap(c=>c.interests.map(i=>i.id)));unique(manifest.profiles.map(p=>p.seedKey));
  for(const category of catalog.categories)for(const interest of category.interests)if(!interest.id.startsWith('interest-'+category.id.slice(9)+'-'))fail('interest_category_mismatch');
  const targetTables=['feture_categories','feture_interests','feture_profiles'];
  const proposed=[catalog.categories.length,catalog.categories.reduce((sum,c)=>sum+c.interests.length,0),manifest.profiles.length];
  const blockers=new Set(['apply_not_implemented']);
  const tables=targetTables.map((table,index)=>{
    const current=inventory.tables.find(t=>t.table===table);
    if(!current)blockers.add('target_table_missing');
    if(!current?.rls)blockers.add('target_rls_missing');
    if(!current||!['dataset_id','seed_key','generation_version'].every(column=>current.columns.includes(column)))blockers.add('provenance_schema_missing');
    if(current?.rows===null)blockers.add('row_count_unknown');
    if(current?.rows)blockers.add('existing_rows_not_classified');
    if(table==='feture_profiles'&&current?.clientGrants.length)blockers.add('private_client_grants');
    return {table,proposedRows:proposed[index],observedRows:current?.rows??null,operation:'review-only',insertCount:null,updateCount:null,deleteCount:null};
  });
  return {mode:'offline-dry-run',schemaVersion:1,datasetId:manifest.datasetId,generationVersion:manifest.generationVersion,projectRef,stage,
    inventoryCapturedOn:inventory.capturedOn,inventoryIsSnapshot:true,inventorySha256:createHash('sha256').update(inventoryRaw).digest('hex'),manifestSha256:createHash('sha256').update(manifestRaw).digest('hex'),catalogSha256:digest,
    canApply:false,writes:0,blockers:[...blockers].sort(),tables,excludedTestDescriptors:catalog.tests.length,
    notes:['Proposed rows are candidates, not inserts. Existing rows are not inferred to belong to this dataset.','No Core accounts, posts, grants, media or test questionnaires are included.','Fresh server environment/schema/ownership checks and an atomic scoped transaction are required in F05.2.']};
}
/** @param {string[]} args */
function options(args){
  /** @type {Record<string,string>} */ const values={};
  for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!['--manifest','--inventory','--project-ref','--stage'].includes(key)||!value||value.startsWith('--')||Object.hasOwn(values,key))fail('invalid_arguments');values[key]=value;}
  if(!values['--project-ref']||!values['--stage'])fail('project_and_stage_required');
  return {manifestPath:values['--manifest']||'seed/development-manifest.json',inventoryPath:values['--inventory']||'seed/inventory-2026-10-10.json',projectRef:values['--project-ref'],stage:values['--stage']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try {console.log(JSON.stringify(dryRun(options(process.argv.slice(2))),null,2));}
  catch(error){const code=error instanceof z.ZodError?'invalid_seed_contract':error instanceof Error&&/^[a-z_]+$/.test(error.message)?error.message:'seed_input_unavailable';console.error(JSON.stringify({error:code,writes:0}));process.exitCode=1;}
}
