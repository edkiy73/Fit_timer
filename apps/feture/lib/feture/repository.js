// @ts-check
'use strict';
const { requireOwner,requireAdult } = require('./permissions');
const { reject } = require('./errors');
const { cursorFor,command } = require('./validation');
const { interestState,INTEREST_ID,UUID } = require('./interest-model');
/** @param {unknown} value @returns {value is Record<string,unknown>} */
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
/** @param {unknown} value @param {number} max @returns {string} */
function text(value,max) {if(typeof value!=='string'||value.length>max)reject(503,'domain_unavailable');return /** @type {string} */(value);}
/** @param {unknown} value @returns {string} */
function timestamp(value) {const date=text(value,40);if(!Number.isFinite(Date.parse(date)))reject(503,'domain_unavailable');return date;}
/** Fixed tables/columns, parameterized owner equality, no generic SQL/table/query API.
 * Mutations use a single owner-scoped RPC transaction. No browser database access.
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
  /** @param {import('./contracts').Actor} actor @param {Record<string,unknown>} row @returns {import('./contracts').InterestDTO} */
  function interest(actor,row) {
    owned(actor,[row]);
    const interestId=text(row.interest_id,40);if(!INTEREST_ID.test(interestId))reject(503,'domain_unavailable');
    let state;
    try {state=interestState({stance:row.stance,experience:row.experience,boundary:row.boundary,boundaryNote:row.boundary_note,intensity:row.intensity,visibility:row.visibility,useForDiscovery:row.use_for_discovery});}
    catch {return reject(503,'domain_unavailable');}
    const {revision,source,test_version:testVersion,deleted}=row;
    if(typeof revision!=='number'||!Number.isSafeInteger(revision)||revision<1||typeof deleted!=='boolean'||source!=='manual'&&source!=='test'||source==='manual'&&testVersion!==null||source==='test'&&(typeof testVersion!=='string'||!UUID.test(testVersion)))reject(503,'domain_unavailable');
    if(deleted&&(state.stance!=='unknown'||state.experience!=='unspecified'||state.boundary!=='none'||state.boundaryNote!==null||state.intensity!==null||state.visibility!=='private'||state.useForDiscovery||source!=='manual'))reject(503,'domain_unavailable');
    return {...state,interestId,revision:/** @type {number} */(revision),source:/** @type {'manual'|'test'} */(source),testVersion:/** @type {string|null} */(testVersion),deleted:/** @type {boolean} */(deleted),updatedAt:timestamp(row.updated_at)};
  }
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
      const query=new URLSearchParams({select:'account_hash,interest_id,stance,experience,boundary,boundary_note,intensity,visibility,use_for_discovery,revision,source,test_version,deleted,updated_at',account_hash:'eq.'+actor.accountHash,order:'interest_id.asc',limit:String(page.limit+1)});
      if(page.after)query.append('interest_id','gt.'+page.after);
      const data=await rows('/rest/v1/feture_interest_states?'+query);owned(actor,data);
      if(data.length>page.limit+1)reject(503,'domain_unavailable');
      const items=data.slice(0,page.limit).map(row=>interest(actor,row));
      return {items,nextCursor:data.length>page.limit?cursorFor(items[items.length-1].interestId):null};
    },
    async mutateInterest(actor,input) {
      requireAdult(actor);
      const checked=command(input);
      if(checked.action!=='interests.set'&&checked.action!=='interests.delete')reject(422,'invalid_request');
      if(!transport.configured())reject(503,'domain_unavailable');
      let data;
      try {
        const response=await transport.request('/rest/v1/rpc/feture_interest_mutate',{method:'POST',headers:{'Content-Type':'application/json'},timeoutMs:8000,
          body:JSON.stringify({p_owner:actor.accountHash,p_operation:checked.operationId,p_interest:checked.interestId,p_expected:checked.expectedRevision,p_kind:checked.action==='interests.set'?'set':'delete',p_state:checked.action==='interests.set'?checked.state:null})});
        if(!response.ok)reject(503,'domain_unavailable');
        data=await response.json();
      } catch {return reject(503,'domain_unavailable');}
      if(!object(data))reject(503,'domain_unavailable');
      const value=/** @type {Record<string,unknown>} */(data);
      if(value.ok===false&&value.error==='invalid_request')reject(422,'invalid_request');
      if(value.ok===false&&value.error==='interest_not_found')reject(404,'interest_not_found');
      const entry=value.entry===null||value.entry===undefined?null:object(value.entry)?interest(actor,value.entry):reject(503,'domain_unavailable');
      if(entry&&entry.interestId!==checked.interestId)reject(503,'domain_unavailable');
      if(value.ok===false&&(value.error==='operation_conflict'||value.error==='revision_conflict'))return {ok:false,error:value.error,entry};
      if(value.ok!==true||!entry||typeof value.replayed!=='boolean'||typeof value.appliedRevision!=='number'||!Number.isSafeInteger(value.appliedRevision)||value.appliedRevision<1||value.appliedRevision>entry.revision)reject(503,'domain_unavailable');
      return {ok:true,replayed:/** @type {boolean} */(value.replayed),appliedRevision:/** @type {number} */(value.appliedRevision),appliedAt:timestamp(value.appliedAt),entry};
    }
  };
}
module.exports={createRepository};
