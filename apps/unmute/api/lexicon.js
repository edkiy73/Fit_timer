'use strict';

require('../lib/product');
const { store }=require('../../../packages/core/server/store');
const { send,fail,rateOk,rateOkScoped,sameSecret,cors }=require('../../../packages/core/server/util');
const Lexicon=require('../lib/lexicon-store');
const Release=require('../lib/content-release');

const MAX_BODY=8*1024*1024;
async function bodyOf(req){
  if(req.body && typeof req.body==='object') return req.body;
  const chunks=[]; let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>MAX_BODY) throw new Error('too_large');
    chunks.push(chunk);
  }
  return chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{};
}
function adminOk(req){
  const expected=process.env.ADMIN_KEY||'';
  if(!expected) return false;
  let given=String(req.headers['x-admin-key']||'');
  try{given=decodeURIComponent(given);}catch(_){return false;}
  return sameSecret(given,expected);
}

module.exports=async function lexiconHandler(req,res){
  if(cors(req,res)) return;
  if(!store.configured()) return fail(res,503,'no_store');

  if(req.method==='GET'){
    if(!(await rateOk(req,'lexicon-read',900))) return fail(res,429,'rate_limited');
    const action=String((req.query&&req.query.action)||'snapshot');
    const snapshot=await Release.getReleasedLexicon();
    if(!snapshot) return fail(res,404,'lexicon_not_published');

    if(action==='snapshot') return send(res,200,{ok:true,revision:snapshot.revision,publishedAt:snapshot.publishedAt,lexicon:snapshot});
    if(action==='lookup'){
      const q=String(req.query&&req.query.q||'').slice(0,120);
      if(!q) return fail(res,400,'missing_query');
      return send(res,200,{ok:true,revision:snapshot.revision,entries:Lexicon.lookup(snapshot,q)});
    }
    if(action==='meta') return send(res,200,{ok:true,revision:snapshot.revision,publishedAt:snapshot.publishedAt,count:snapshot.entries.length});
    return fail(res,400,'unknown_action');
  }

  if(req.method!=='POST') return fail(res,405,'method_not_allowed');
  if(!(await rateOkScoped(req,'lexicon-admin',120,'',3600,true))) return fail(res,429,'rate_limited');
  if(!process.env.ADMIN_KEY) return fail(res,503,'no_admin_key');
  if(!adminOk(req)) return fail(res,403,'bad_key');

  let body;
  try{body=await bodyOf(req);}
  catch(error){return fail(res,error&&error.message==='too_large'?413:400,'bad_body');}

  try{
    if(body.action==='draft_put'){
      const draft=await Lexicon.putDraft(body.lexicon);
      return send(res,200,{ok:true,draftUpdatedAt:draft.draftUpdatedAt,count:draft.entries.length});
    }
    if(body.action==='draft_get'){
      const draft=await Lexicon.getDraft();
      if(!draft) return fail(res,404,'draft_not_found');
      return send(res,200,{ok:true,draft});
    }
    if(body.action==='publish') return fail(res,409,'publish_via_content_admin');
    if(body.action==='status'){
      const [draft,published]=await Promise.all([Lexicon.getDraft(),Release.getReleasedLexicon()]);
      return send(res,200,{ok:true,draft:!!draft,draftUpdatedAt:draft&&draft.draftUpdatedAt||null,
        publishedRevision:published&&published.revision||0,publishedAt:published&&published.publishedAt||null,
        count:published&&published.entries.length||0});
    }
    return fail(res,400,'unknown_action');
  }catch(error){
    return fail(res,400,String((error&&error.message)||'lexicon_error').slice(0,180));
  }
};
