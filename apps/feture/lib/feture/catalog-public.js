// @ts-check
'use strict';
const {validateEntry}=require('./catalog-admin');
/** Verify only a reviewed immutable release is used in the public catalog.
 * @param {unknown} raw @param {Set<string>} allowed
 */
function publishedRelease(raw,allowed){
 if(raw===null||raw===undefined)return {version:1,entries:{}};
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('catalog_publication_invalid');
 const {version,entries}=/** @type {Record<string,unknown>} */(raw);
 if(typeof version!=='number'||!Number.isSafeInteger(version)||version<2||version>1000000
  ||!entries||typeof entries!=='object'||Array.isArray(entries))throw Error('catalog_publication_invalid');
 const topics=/** @type {Record<string,unknown>} */(entries);
 if(Object.keys(topics).length>allowed.size)throw Error('catalog_publication_invalid');
 /** @type {Record<string,{definition:string,synonyms:string[],relatedIds:string[]}>} */
 const safe={};
 for(const [id,entry] of Object.entries(topics)){
  if(!allowed.has(id))throw Error('catalog_publication_invalid');
  let checked;
  try{checked=validateEntry(entry);}catch{throw Error('catalog_publication_invalid');}
  if(checked.relatedIds.includes(id)||checked.relatedIds.some(x=>!allowed.has(x)))throw Error('catalog_publication_invalid');
  safe[id]=checked;
 }
 return {version,entries:safe};
}
module.exports={publishedRelease};
