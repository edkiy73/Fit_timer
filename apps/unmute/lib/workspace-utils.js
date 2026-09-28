'use strict';

const { store } = require('../../../packages/core/server/store');

function parseJson(raw){
  if(!raw) return null;
  try{return JSON.parse(raw);}catch(_){return null;}
}

async function writeCommands(commands,batchSize=80){
  for(let i=0;i<commands.length;i+=batchSize){
    const batch=commands.slice(i,i+batchSize);
    const out=await store.pipe(batch);
    if(out.length!==batch.length) throw new Error('workspace_write_incomplete');
  }
}

async function manyJson(keys,batchSize=160){
  const out=[];
  for(let i=0;i<keys.length;i+=batchSize){
    const raws=await store.many(keys.slice(i,i+batchSize));
    for(const raw of raws) out.push(parseJson(raw));
  }
  return out;
}

async function nextCounter(key){
  const out=await store.pipe([['INCR',key]]);
  return Math.max(1,+out[0]||1);
}

function clone(value){
  return JSON.parse(JSON.stringify(value));
}

module.exports={store,parseJson,writeCommands,manyJson,nextCounter,clone};
