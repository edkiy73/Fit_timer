'use strict';
/* Admin → «2FA для сотрудников»: the test-only switch for the staff second factor (owner 29.10.2026).
 *   POST /api/admin {action:'feture.platform.staffFactor'}                    admin key → {ok, required, changedBy, changedAt}
 *   POST /api/admin {action:'feture.platform.staffFactor', required:false}    admin key → waive the staff factor (tests only)
 *   POST /api/admin {action:'feture.platform.staffFactor', required:true}     admin key → require it again
 * Reached only after Core's admin-key check; a staff member never gets here (/api/fe has no such command). Each change
 * is one row in feture.staff_factor_change (who/when). An unreachable database is 503 and changes nothing. */
/* Core is untyped CommonJS outside this typed tree: required by a computed path. */
const CORE='../../../../packages/core/server/';
const {send,fail}=require(CORE+'util');
const ACTION='feture.platform.staffFactor';

function createStaffFactorAdmin(){
 /** @param {string} action @param {Record<string,unknown>} body @param {any} res */
 return async(action,body,res)=>{
  if(action!==ACTION)return false;
  res.setHeader('Cache-Control','no-store');
  const extra=Object.keys(body||{}).filter(k=>k!=='action'&&k!=='required');
  if(extra.length||('required' in body&&typeof body.required!=='boolean')){fail(res,422,'invalid_request');return true;}
  try{
   const {database}=await import('../../server/core-guard.mjs');
   const {staffFactorState,setStaffFactor}=await import('../../server/staff-factor-switch.mjs');
   const db=database();
   if(!db){fail(res,503,'feture_unavailable');return true;}
   const state='required' in body?await setStaffFactor(db,/** @type {boolean} */(body.required),'admin key'):await staffFactorState(db);
   send(res,200,{ok:true,...state});
  }catch{fail(res,503,'feture_unavailable');}
  return true;
 };
}
module.exports={createStaffFactorAdmin};
