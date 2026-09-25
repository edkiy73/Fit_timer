'use strict';

// Generic provider/protocol failure codes that mean "the AI answered, but the result is unusable".
const GENERIC_MALFORMED=/malformed_response|missing_fields|bad_image/;

function createAIActionRegistry(definitions,options){
  const opts=options&&typeof options==='object'?options:{};
  // Products add their own protocol validation codes; Core only knows the generic ones.
  const productMalformed=opts.malformedPattern instanceof RegExp?opts.malformedPattern:null;
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
    ids(){ return [...map.keys()]; },
    isMalformed(message){
      const text=String(message||'');
      return GENERIC_MALFORMED.test(text)||!!(productMalformed&&productMalformed.test(text));
    }
  });
}

module.exports={createAIActionRegistry};
