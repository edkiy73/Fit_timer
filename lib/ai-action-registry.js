'use strict';

function createAIActionRegistry(definitions){
  const map=new Map();
  for(const raw of Array.isArray(definitions)?definitions:[]){
    const def=Object.assign({},raw);
    const id=String(def.id||'').trim();
    if(!id) throw new Error('ai_action_id_required');
    if(map.has(id)) throw new Error('ai_action_duplicate:'+id);
    const type=def.type==='image'?'image':'text';
    const bucket=['heavy','light','image'].includes(def.bucket)?def.bucket:'light';
    map.set(id,Object.freeze(Object.assign(def,{id,type,bucket})));
  }
  return Object.freeze({
    get(id){ return map.get(String(id||''))||null; },
    has(id){ return map.has(String(id||'')); },
    ids(){ return [...map.keys()]; }
  });
}

module.exports={createAIActionRegistry};
