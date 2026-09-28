import { createStorage } from '@appbase/core/storage.js';
import { authClient } from '../auth';
import { validateCourseSet, type CourseSet } from './schema';

export interface ContentRoadmapOutlineNode {
  id:string;
  kind:'lesson'|'practice'|'review'|'dialogue'|'checkpoint'|'bonus';
  title:Record<string,string>;
  dayIndex?:number;
  order:number;
  prerequisites:string[];
  optional:boolean;
}

export interface ContentRoadmapOutline {
  id:string;
  title:Record<string,string>;
  nodes:ContentRoadmapOutlineNode[];
}

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

function outlineFromSet(set:CourseSet):ContentRoadmapOutline[]{
  return set.roadmaps.map(roadmap=>({
    id:roadmap.id,
    title:roadmap.title,
    nodes:roadmap.nodes.map(node=>({
      id:node.id,
      kind:node.kind,
      title:node.title,
      dayIndex:node.dayIndex,
      order:node.order,
      prerequisites:node.prerequisites,
      optional:node.optional,
    }))
  }));
}

function normalizeOutline(input:unknown,set:CourseSet):ContentRoadmapOutline[]{
  if(!Array.isArray(input))return outlineFromSet(set);
  const roadmaps:ContentRoadmapOutline[]=[];
  for(const raw of input){
    if(!raw||typeof raw!=='object')continue;
    const value=raw as Partial<ContentRoadmapOutline>;
    if(typeof value.id!=='string'||!value.title||typeof value.title!=='object'||!Array.isArray(value.nodes))continue;
    const nodes:ContentRoadmapOutlineNode[]=[];
    for(const rawNode of value.nodes){
      if(!rawNode||typeof rawNode!=='object')continue;
      const node=rawNode as Partial<ContentRoadmapOutlineNode>;
      if(
        typeof node.id!=='string'||
        typeof node.kind!=='string'||
        !node.title||typeof node.title!=='object'||
        !Number.isInteger(node.order)
      )continue;
      nodes.push({
        id:node.id,
        kind:node.kind as ContentRoadmapOutlineNode['kind'],
        title:node.title as Record<string,string>,
        dayIndex:Number.isInteger(node.dayIndex)?node.dayIndex:undefined,
        order:node.order as number,
        prerequisites:Array.isArray(node.prerequisites)?node.prerequisites.filter((id):id is string=>typeof id==='string'):[],
        optional:node.optional===true,
      });
    }
    roadmaps.push({id:value.id,title:value.title as Record<string,string>,nodes});
  }
  return roadmaps.length?roadmaps:outlineFromSet(set);
}

export async function loadSet(id:string): Promise<{set:CourseSet; outline:ContentRoadmapOutline[]; access:'full'|'preview'; fromCache:boolean}> {
  const safe=String(id||'').trim().toLowerCase();
  const cacheKey=`set:${safe}`;
  try{
    const headers=await authHeaders();
    const payload=await fetchJson(`/api/content?action=set&id=${encodeURIComponent(safe)}`,{headers});
    const set=validateCourseSet(payload.set);
    const outline=normalizeOutline(payload.outline,set);
    const access=payload.access==='full'?'full':'preview';
    await storage.set(cacheKey,JSON.stringify({set,outline,access}));
    return {set,outline,access,fromCache:false};
  }catch(error){
    const cached=await storage.get(cacheKey);
    if(cached){
      try{
        const parsed=JSON.parse(cached) as {set:unknown;outline?:unknown;access?:unknown};
        const set=validateCourseSet(parsed.set);
        return {
          set,
          outline:normalizeOutline(parsed.outline,set),
          access:parsed.access==='full'?'full':'preview',
          fromCache:true
        };
      }catch(_){}
    }
    throw error;
  }
}

export async function clearContentCache(): Promise<void> {
  await storage.clearAll();
}
