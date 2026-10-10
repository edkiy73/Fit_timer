// @ts-check
'use strict';
const {documentDTO,uuid}=require('./documents');
/** Public read uses only the published table/anon key. No draft or receipt read.
 * @param {string} base @param {string} key @param {URLSearchParams} query */
async function publicDocuments(base,key,query) {
 const locale=query.get('locale')||'ru',id=query.get('id');
 if(!['ru','en'].includes(locale)||id!==null&&!uuid(id)||Array.from(query.keys()).some(k=>!['resource','locale','id'].includes(k)))return {status:422,body:{error:'invalid_request'}};
 const params=new URLSearchParams({select:'id,document_key,locale,version,title,blocks,content_hash,requires_accept,published_at,effective_at',locale:'eq.'+locale,order:'document_key.asc,version.desc',limit:'100'});
 if(id)params.set('id','eq.'+id);else params.set('effective_at','lte.'+new Date().toISOString());
 const response=await fetch(base+'/rest/v1/'+(id?'feture_document_versions':'feture_document_current')+'?'+params,{headers:{apikey:key,Accept:'application/json'},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('documents_unavailable');const rows=await response.json();
 if(!Array.isArray(rows)||rows.length>100)throw Error('documents_unavailable');
 const docs=rows.map(documentDTO);if(docs.some(d=>d.locale!==locale||id&&d.id!==id))throw Error('documents_unavailable');
 if(id)return docs.length===1?{status:200,body:{ok:true,document:docs[0]}}:{status:404,body:{error:'document_not_found'}};
 const current=new Map();for(const doc of docs)if(!current.has(doc.key))current.set(doc.key,doc);
 return {status:200,body:{ok:true,documents:[...current.values()]}};
}
module.exports={publicDocuments};
