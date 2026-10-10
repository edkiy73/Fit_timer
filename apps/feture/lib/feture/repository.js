// @ts-check
'use strict';
const { requireOwner,requireAdult } = require('./permissions');
const { reject } = require('./errors');
const { cursorFor } = require('./validation');
/** @param {unknown} value @returns {value is Record<string,unknown>} */
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
/** @param {unknown} value @param {number} max @returns {string} */
function text(value,max) {if(typeof value!=='string'||value.length>max)reject(503,'domain_unavailable');return /** @type {string} */(value);}
/** @param {unknown} value @returns {string} */
function timestamp(value) {const date=text(value,40);if(!Number.isFinite(Date.parse(date)))reject(503,'domain_unavailable');return date;}
/** Fixed tables/columns, parameterized owner equality, no generic SQL/table/query API.
 * No writes to the old interest schema. A02 replaces this read DTO along with the canonical model.
 * @param {import('./contracts').Transport} transport @returns {import('./contracts').Repository}
 */
function createRepository(transport) {
  /** @param {string} path @returns {Promise<Record<string,unknown>[]>} */
  async function rows(path) {
    if(!transport.configured())reject(503,'domain_unavailable');
    try {
      const response=await transport.request(path,{timeoutMs:8000});
      const data=await response.json();
      if(!Array.isArray(data)||!data.every(object))reject(503,'domain_unavailable');
      return data;
    } catch {return reject(503,'domain_unavailable');}
  }
  /** @param {import('./contracts').Actor} actor @param {Record<string,unknown>[]} data */
  function owned(actor,data) {if(data.some(row=>row.account_hash!==actor.accountHash))reject(503,'domain_unavailable');}
  return {
    async getProfile(actor) {
      requireOwner(actor,actor.accountHash);
      const query=new URLSearchParams({select:'account_hash,display_name,about,created_at,updated_at',account_hash:'eq.'+actor.accountHash,limit:'1'});
      const data=await rows('/rest/v1/feture_profiles?'+query);owned(actor,data);
      if(data.length>1)reject(503,'domain_unavailable');
      const row=data[0];if(!row)return null;
      return {displayName:text(row.display_name,80),about:text(row.about,4000),createdAt:timestamp(row.created_at),updatedAt:timestamp(row.updated_at)};
    },
    async listInterests(actor,page) {
      requireAdult(actor);
      if(!Number.isInteger(page.limit)||page.limit<1||page.limit>50||page.after!==null&&!/^interest-[1-9]\d{0,2}-[1-9]\d{0,2}$/.test(page.after))reject(422,'invalid_request');
      const query=new URLSearchParams({select:'account_hash,interest_id,status,intensity,visibility,updated_at',account_hash:'eq.'+actor.accountHash,order:'interest_id.asc',limit:String(page.limit+1)});
      if(page.after)query.append('interest_id','gt.'+page.after);
      const data=await rows('/rest/v1/feture_interest_states?'+query);owned(actor,data);
      if(data.length>page.limit+1)reject(503,'domain_unavailable');
      const items=data.slice(0,page.limit).map(row=>{
        const interestId=text(row.interest_id,40);
        const status=text(row.status,30),visibility=text(row.visibility,10);
        if(!/^interest-[1-9]\d{0,2}-[1-9]\d{0,2}$/.test(interestId)||!['unknown','curious','fantasy','want_to_try','experienced','soft_limit','hard_limit','not_interested'].includes(status)||!['private','public','granted'].includes(visibility)||row.intensity!==null&&(typeof row.intensity!=='number'||!Number.isInteger(row.intensity)||row.intensity<0||row.intensity>100))reject(503,'domain_unavailable');
        return {interestId,status,visibility,intensity:/** @type {number|null} */(row.intensity),updatedAt:timestamp(row.updated_at)};
      });
      return {items,nextCursor:data.length>page.limit?cursorFor(items[items.length-1].interestId):null};
    }
  };
}
module.exports={createRepository};
