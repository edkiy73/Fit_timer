import { createStorage } from '@appbase/core/storage.js';
import { authClient } from '../auth';
import { validateCourseSet, type CourseSet } from './schema';
import { resolveCourseEntitlement } from '../entitlements';

export interface ContentCatalogSet {
  id: string;
  slug: string;
  revision: number;
  title: Record<string,string>;
  description: Record<string,string> | null;
  level: Record<string,unknown>;
  access: unknown;
  defaultRoadmapId: string;
  publishedAt: string;
}

export interface ContentCatalog {
  schemaVersion: 1;
  updatedAt?: string;
  sets: ContentCatalogSet[];
}

const storage=createStorage({dbName:'unmute/content',storeName:'published'});
const CATALOG_CACHE='catalog';

async function authHeaders(): Promise<Record<string,string>> {
  const fields=await authClient.authFields();
  if(!fields) return {};
  return {
    'X-Fit-Email':fields.email,
    'X-Fit-Device':fields.deviceId,
    'X-Fit-Token':fields.syncToken
  };
}

async function fetchJson(url:string, init?:RequestInit): Promise<Record<string,unknown>> {
  const response=await fetch(url,init);
  let payload:Record<string,unknown>={};
  try{
    const parsed=await response.json();
    if(parsed && typeof parsed==='object') payload=parsed as Record<string,unknown>;
  }catch(_){}
  if(!response.ok) throw new Error(String(payload.error || 'content_request_failed'));
  return payload;
}

export async function loadCatalog(): Promise<ContentCatalog> {
  try{
    const payload=await fetchJson('/api/content?action=catalog');
    const catalog=payload.catalog as ContentCatalog;
    if(!catalog || !Array.isArray(catalog.sets)) throw new Error('bad_catalog');
    await storage.set(CATALOG_CACHE,JSON.stringify(catalog));
    return catalog;
  }catch(error){
    const cached=await storage.get(CATALOG_CACHE);
    if(cached){
      try{return JSON.parse(cached) as ContentCatalog;}catch(_){}
    }
    throw error;
  }
}

export async function loadSet(id:string): Promise<{set:CourseSet; access:'full'|'preview'; fromCache:boolean}> {
  const safe=String(id||'').trim().toLowerCase();
  const cacheKey=`set:${safe}`;
  try{
    const headers=await authHeaders();
    const payload=await fetchJson(`/api/content?action=set&id=${encodeURIComponent(safe)}`,{headers});
    const set=validateCourseSet(payload.set);
    const access=payload.access==='full'?'full':'preview';
    await storage.set(cacheKey,JSON.stringify({set,access}));
    return {set,access,fromCache:false};
  }catch(error){
    const cached=await storage.get(cacheKey);
    if(cached){
      try{
        const parsed=JSON.parse(cached) as {set:unknown;access?:unknown};
        const set=validateCourseSet(parsed.set);
        let access: 'full'|'preview'=parsed.access==='full'?'full':'preview';
        if(access==='full'&&set.access.mode==='entitlement'){
          const session=await authClient.getSession();
          access=resolveCourseEntitlement(set,session).full?'full':'preview';
        }
        return {set,access,fromCache:true};
      }catch(_){}
    }
    throw error;
  }
}

export async function retainLearnedActivities(
  setId:string,
  activityIds:readonly string[]
):Promise<void>{
  const safe=String(setId||'').trim().toLowerCase();
  const ids=[...new Set(activityIds.map(id=>String(id||'').trim().toLowerCase()).filter(Boolean))];
  if(!safe||!ids.length)return;
  const headers=await authHeaders();
  if(!Object.keys(headers).length)return;
  await fetchJson('/api/content',{
    method:'POST',
    headers:{'Content-Type':'application/json',...headers},
    body:JSON.stringify({
      action:'retain_learned',
      id:safe,
      activityIds:ids
    })
  });
}

export async function clearContentCache(): Promise<void> {
  await storage.clearAll();
}
