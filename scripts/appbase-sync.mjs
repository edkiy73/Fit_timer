#!/usr/bin/env node
/* Downstream AppBase update: copy Core files from an AppBase checkout into this product.

   node scripts/appbase-sync.mjs --from <appbase-dir> [--dry-run]

   Only files listed in config/appbase-manifest.json are touched. The consumed AppBase
   commit is recorded in config/appbase-version.json so every product states which Core
   it runs. Review the resulting diff and run the normal checks before merging:
   this is meant to produce a reviewable PR, never a silent bidirectional sync. */

import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const fromIndex = process.argv.indexOf('--from');
const DRY = process.argv.includes('--dry-run');
if(fromIndex < 0 || !process.argv[fromIndex + 1]){
  console.error('Usage: node scripts/appbase-sync.mjs --from <appbase-dir> [--dry-run]');
  process.exit(2);
}
const FROM = path.resolve(process.argv[fromIndex + 1]);

const manifest = JSON.parse(await readFile(path.join(ROOT, 'config/appbase-manifest.json'), 'utf8'));
const files = [...manifest.client, ...manifest.server];

function appbaseCommit(){
  try{ return execFileSync('git', ['rev-parse', 'HEAD'], {cwd:FROM, encoding:'utf8', stdio:['ignore','pipe','ignore']}).trim(); }
  catch(_){
    const source = path.join(FROM, 'APPBASE_SOURCE.json');
    return existsSync(source) ? 'snapshot-of-' + JSON.parse(readFileSync(source, 'utf8')).sourceCommit : 'unknown';
  }
}

const missing = files.filter(file => !existsSync(path.join(FROM, file)));
if(missing.length){
  console.error('AppBase checkout is missing Core files:\n- ' + missing.join('\n- '));
  process.exit(1);
}

const changed = [];
for(const file of files){
  const next = await readFile(path.join(FROM, file));
  const target = path.join(ROOT, file);
  const current = existsSync(target) ? await readFile(target) : null;
  if(current && Buffer.compare(current, next) === 0) continue;
  changed.push(file);
  if(!DRY){
    await mkdir(path.dirname(target), {recursive:true});
    await cp(path.join(FROM, file), target);
  }
}

const version = {appbaseCommit: appbaseCommit(), files: files.length};
if(!DRY) await writeFile(path.join(ROOT, 'config/appbase-version.json'), JSON.stringify(version, null, 2) + '\n', 'utf8');

console.log(changed.length
  ? `${DRY ? 'Would update' : 'Updated'} ${changed.length} Core file(s) from AppBase ${version.appbaseCommit}:\n- ${changed.join('\n- ')}`
  : `Core already matches AppBase ${version.appbaseCommit}`);
