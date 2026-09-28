'use strict';

require('../lib/product');
const crypto = require('crypto');
const { store } = require('../../../packages/core/server/store');
const { send, fail, rateOk, rateOkScoped, sameSecret, cors } = require('../../../packages/core/server/util');
const { hasOwned } = require('../../../packages/core/server/entitlements');
const Content = require('../lib/content-store');
const Release = require('../lib/content-release');

const MAX_BODY = 6 * 1024 * 1024;
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');

async function bodyOf(req){
  if(req.body && typeof req.body === 'object') return req.body;
  const chunks=[]; let size=0;
  for await(const chunk of req){
    size += chunk.length;
    if(size > MAX_BODY) throw new Error('too_large');
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

async function accountFromHeaders(req){
  const email = String(req.headers['x-fit-email'] || '').trim().toLowerCase().slice(0,120);
  const deviceId = String(req.headers['x-fit-device'] || '').trim().slice(0,80);
  const token = String(req.headers['x-fit-token'] || '');
  if(!email || !deviceId || !token) return null;
  const raw = await store.get(`a:${sha(email).slice(0,32)}`);
  let acc=null;
  try{ acc=JSON.parse(raw); }catch(_){}
  const dev = acc && acc.syncDevices && acc.syncDevices[deviceId];
  if(!dev || !sameSecret(sha(token), dev.h || '')) return null;
  return acc;
}

function adminOk(req){
  const expected = process.env.ADMIN_KEY || '';
  if(!expected) return false;
  let given = String(req.headers['x-admin-key'] || '');
  try{ given = decodeURIComponent(given); }catch(_){ return false; }
  return sameSecret(given, expected);
}

function roadmapOutline(set,full){
  const preview=set.access&&set.access.mode==='entitlement'&&set.access.freePreview;
  return (set.roadmaps||[]).map(roadmap=>({
    id:roadmap.id,
    title:roadmap.title,
    nodes:(roadmap.nodes||[]).map(node=>{
      const free=full
        || set.access.mode==='free'
        || (preview&&preview.kind==='first-days'&&Number.isInteger(node.dayIndex)&&node.dayIndex<=preview.days);
      return {
        id:node.id,
        kind:node.kind,
        title:node.title,
        dayIndex:node.dayIndex||null,
        order:node.order,
        optional:!!node.optional,
        locked:!free
      };
    })
  }));
}

module.exports = async function contentHandler(req,res){
  if(cors(req,res)) return;
  if(!store.configured()) return fail(res,503,'no_store');

  if(req.method === 'GET'){
    if(!(await rateOk(req,'content-read',600))) return fail(res,429,'rate_limited');
    const action = String((req.query && req.query.action) || 'catalog');

    if(action === 'catalog'){
      return send(res,200,{ok:true, catalog:await Release.getReleasedCatalog()});
    }

    if(action === 'set'){
      const id = Content.cleanId(req.query && req.query.id);
      if(!id) return fail(res,400,'bad_set_id');
      const set = await Release.getReleasedSet(id);
      if(!set) return fail(res,404,'set_not_found');

      let full = set.access.mode === 'free';
      if(!full && set.access.mode === 'entitlement'){
        const acc = await accountFromHeaders(req);
        full = !!acc && hasOwned(acc,set.access.entitlement);
      }
      return send(res,200,{
        ok:true,
        access:full?'full':'preview',
        outline:roadmapOutline(set,full),
        set:full?set:Content.previewSnapshot(set)
      });
    }

    return fail(res,400,'unknown_action');
  }

  if(req.method !== 'POST') return fail(res,405,'method_not_allowed');
  if(!(await rateOkScoped(req,'content-admin',120,'',3600,true))) return fail(res,429,'rate_limited');
  if(!process.env.ADMIN_KEY) return fail(res,503,'no_admin_key');
  if(!adminOk(req)) return fail(res,403,'bad_key');

  let body;
  try{ body=await bodyOf(req); }
  catch(error){ return fail(res,error && error.message === 'too_large' ? 413 : 400,'bad_body'); }

  try{
    switch(String(body.action || '')){
      case 'draft_put': {
        const draft=await Content.putDraft(body.set);
        return send(res,200,{ok:true,id:draft.id,draftUpdatedAt:draft.draftUpdatedAt});
      }
      case 'draft_get': {
        const draft=await Content.getDraft(body.id);
        if(!draft) return fail(res,404,'draft_not_found');
        return send(res,200,{ok:true,draft});
      }
      case 'publish':
        return fail(res,409,'publish_via_content_admin');
      case 'status': {
        const id=Content.cleanId(body.id);
        if(!id) return fail(res,400,'bad_set_id');
        const [draft,published]=await Promise.all([Content.getDraft(id),Release.getReleasedSet(id)]);
        return send(res,200,{ok:true,id,draft:!!draft,draftUpdatedAt:draft&&draft.draftUpdatedAt||null,
          publishedRevision:published&&published.revision||0,publishedAt:published&&published.publishedAt||null});
      }
      default: return fail(res,400,'unknown_action');
    }
  }catch(error){
    const code=String((error&&error.message)||'content_error').slice(0,160);
    return fail(res,400,code);
  }
};
