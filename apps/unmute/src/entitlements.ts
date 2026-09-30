import type { AuthSession } from '@appbase/core/auth.js';
import type { CourseSet } from './content/schema';

export type CourseEntitlementReason='free'|'owned'|'preview';

export interface CourseEntitlementState {
  full:boolean;
  reason:CourseEntitlementReason;
  sku:string|null;
}

export function activePremium(session:AuthSession|null|undefined,now:number):boolean{
  if(!session?.premium)return false;
  const sub=session.sub;
  if(sub&&typeof sub==='object'&&!Array.isArray(sub)){
    const until=(sub as {until?:unknown}).until;
    if(typeof until==='string'){
      const expires=Date.parse(until)||0;
      return expires>now;
    }
  }
  return true;
}

export function resolveCourseEntitlement(
  set:CourseSet,
  session:AuthSession|null|undefined,
  now=Date.now()
):CourseEntitlementState{
  if(set.access.mode==='free'){
    return {full:true,reason:'free',sku:null};
  }
  const sku=set.access.entitlement;
  if(session?.owned?.includes(sku)){
    return {full:true,reason:'owned',sku};
  }
  // UnMute Plus is a discount on courses (config/product.json → pricing.plusCourseDiscount),
  // not access to them: only a purchased course is open in full.
  return {full:false,reason:'preview',sku};
}

export function authEntitlementFingerprint(
  session:AuthSession|null|undefined,
  now=Date.now()
):string{
  if(!session)return 'anonymous';
  const owned=[...(session.owned??[])].map(value=>String(value).trim().toLowerCase()).filter(Boolean).sort();
  return [
    session.email,
    activePremium(session,now)?'plus':'free',
    owned.join(',')
  ].join('|');
}
