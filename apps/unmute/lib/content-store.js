'use strict';

const { store } = require('../../../packages/core/server/store');

const PREFIX = 'unmute:content:v1';
const CATALOG_KEY = `${PREFIX}:catalog`;
const ID = /^[a-z0-9][a-z0-9._-]*$/;
const SKU = /^[a-z0-9][a-z0-9._:-]*$/;

const json = value => JSON.stringify(value);
const parse = raw => {
  if(!raw) return null;
  try { return JSON.parse(raw); } catch(_) { return null; }
};

function cleanId(value){
  const id = String(value || '').trim().toLowerCase();
  return ID.test(id) ? id : '';
}

function assertObject(value, name){
  if(!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`invalid_${name}`);
  return value;
}

function validateSet(input){
  const set = assertObject(input, 'set');
  if(set.schemaVersion !== 1) throw new Error('unsupported_schema');
  if(!cleanId(set.id)) throw new Error('bad_set_id');
  if(!cleanId(set.slug)) throw new Error('bad_set_slug');
  if(!set.title || typeof set.title !== 'object') throw new Error('missing_set_title');
  if(!Array.isArray(set.roadmaps) || !set.roadmaps.length) throw new Error('missing_roadmaps');
  if(!Array.isArray(set.activities)) throw new Error('missing_activities');
  if(!cleanId(set.defaultRoadmapId)) throw new Error('bad_default_roadmap');

  const activities = new Map();
  for(const activity of set.activities){
    assertObject(activity, 'activity');
    const id = cleanId(activity.id);
    if(!id) throw new Error('bad_activity_id');
    if(activities.has(id)) throw new Error(`duplicate_activity:${id}`);
    if(typeof activity.type !== 'string' || !activity.type) throw new Error(`missing_activity_type:${id}`);
    if(!Number.isInteger(activity.revision) || activity.revision < 1) throw new Error(`bad_activity_revision:${id}`);
    if(!['preserve','reset'].includes(activity.revisionProgress)) throw new Error(`bad_revision_progress:${id}`);
    if(activity.type === 'choice'){
      if(!Array.isArray(activity.options) || activity.options.length < 2) throw new Error(`bad_choice_options:${id}`);
      if(!Number.isInteger(activity.correctIndex) || activity.correctIndex < 0 || activity.correctIndex >= activity.options.length){
        throw new Error(`bad_choice_answer:${id}`);
      }
    }
    activities.set(id, activity);
  }

  const roadmapIds = new Set();
  for(const roadmap of set.roadmaps){
    assertObject(roadmap, 'roadmap');
    const roadmapId = cleanId(roadmap.id);
    if(!roadmapId) throw new Error('bad_roadmap_id');
    if(roadmapIds.has(roadmapId)) throw new Error(`duplicate_roadmap:${roadmapId}`);
    roadmapIds.add(roadmapId);
    if(!Array.isArray(roadmap.nodes) || !roadmap.nodes.length) throw new Error(`missing_nodes:${roadmapId}`);

    const nodes = new Map();
    for(const node of roadmap.nodes){
      assertObject(node, 'node');
      const nodeId = cleanId(node.id);
      if(!nodeId) throw new Error(`bad_node_id:${roadmapId}`);
      if(nodes.has(nodeId)) throw new Error(`duplicate_node:${nodeId}`);
      if(node.dayIndex !== undefined && (!Number.isInteger(node.dayIndex) || node.dayIndex < 1)){
        throw new Error(`bad_day_index:${nodeId}`);
      }
      nodes.set(nodeId, node);
    }

    for(const [nodeId, node] of nodes){
      const deps = Array.isArray(node.prerequisites) ? node.prerequisites : [];
      for(const depRaw of deps){
        const dep = cleanId(depRaw);
        if(!nodes.has(dep)) throw new Error(`unknown_prerequisite:${nodeId}:${depRaw}`);
        if(dep === nodeId) throw new Error(`self_prerequisite:${nodeId}`);
      }
      const refs = Array.isArray(node.activityIds) ? node.activityIds : [];
      for(const activityRaw of refs){
        const activityId = cleanId(activityRaw);
        if(!activities.has(activityId)) throw new Error(`unknown_activity:${nodeId}:${activityRaw}`);
      }
    }

    const visiting = new Set(), visited = new Set();
    const visit = nodeId => {
      if(visited.has(nodeId)) return;
      if(visiting.has(nodeId)) throw new Error(`roadmap_cycle:${roadmapId}:${nodeId}`);
      visiting.add(nodeId);
      const node = nodes.get(nodeId);
      for(const depRaw of (node.prerequisites || [])) visit(cleanId(depRaw));
      visiting.delete(nodeId);
      visited.add(nodeId);
    };
    for(const nodeId of nodes.keys()) visit(nodeId);
  }

  if(!roadmapIds.has(cleanId(set.defaultRoadmapId))) throw new Error('unknown_default_roadmap');

  const access = assertObject(set.access, 'access');
  if(access.mode === 'entitlement'){
    if(!SKU.test(String(access.entitlement || '').trim().toLowerCase())) throw new Error('bad_entitlement');
    if(access.freePreview){
      if(access.freePreview.kind !== 'first-days') throw new Error('bad_free_preview_kind');
      if(!Number.isInteger(access.freePreview.days) || access.freePreview.days < 0) throw new Error('bad_free_preview_days');
      if(access.freePreview.learnedContentStaysAvailable !== true) throw new Error('free_review_must_stay_available');
    }
  }else if(access.mode !== 'free'){
    throw new Error('bad_access_mode');
  }

  return set;
}

const draftKey = id => `${PREFIX}:set:${id}:draft`;
const pointerKey = id => `${PREFIX}:set:${id}:published`;
const revisionKey = (id, revision) => `${PREFIX}:set:${id}:rev:${revision}`;
const revisionCounterKey = id => `${PREFIX}:set:${id}:revision-counter`;

async function persistentSet(key, value){
  await store.pipe([['SET', key, value]]);
}

async function getCatalog(){
  const parsed = parse(await store.get(CATALOG_KEY));
  return parsed && Array.isArray(parsed.sets) ? parsed : {schemaVersion:1, sets:[]};
}

function catalogEntry(set){
  return {
    id:set.id,
    slug:set.slug,
    revision:set.revision,
    title:set.title,
    description:set.description || null,
    level:set.level || {},
    access:set.access,
    defaultRoadmapId:set.defaultRoadmapId,
    publishedAt:set.publishedAt
  };
}

async function putDraft(input){
  const set = validateSet(input);
  const id = cleanId(set.id);
  const draft = {...set, id, slug:cleanId(set.slug), draftUpdatedAt:new Date().toISOString()};
  await persistentSet(draftKey(id), json(draft));
  return draft;
}

async function getDraft(id){
  const key = cleanId(id);
  if(!key) return null;
  return parse(await store.get(draftKey(key)));
}

async function nextRevision(id){
  const key=cleanId(id);
  if(!key) throw new Error('bad_set_id');
  const pointer=parse(await store.get(pointerKey(key)));
  const current=Math.max(0,+(pointer&&pointer.revision)||0,+(await store.get(revisionCounterKey(key))||0));
  const out=await store.pipe([
    ['SET',revisionCounterKey(key),String(current)],
    ['INCR',revisionCounterKey(key)]
  ]);
  return Math.max(1,+out[1]||current+1);
}

async function stageDraft(id){
  const key=cleanId(id);
  if(!key) throw new Error('bad_set_id');
  const draft=await getDraft(key);
  if(!draft) throw new Error('draft_not_found');
  validateSet(draft);
  const revision=await nextRevision(key);
  const publishedAt=new Date().toISOString();
  const snapshot=validateSet({...draft,revision,publishedAt});
  delete snapshot.draftUpdatedAt;
  const result=await store.pipe([['SET',revisionKey(key,revision),json(snapshot),'NX']]);
  if(result[0] !== 'OK') throw new Error('revision_collision');
  return snapshot;
}

async function getRevision(id,revision){
  const key=cleanId(id);
  const rev=Math.max(0,+revision||0);
  if(!key||!rev) return null;
  const snapshot=parse(await store.get(revisionKey(key,rev)));
  return snapshot ? validateSet(snapshot) : null;
}

async function activateRevision(id,revision){
  const key=cleanId(id);
  const snapshot=await getRevision(key,revision);
  if(!snapshot) throw new Error('revision_not_found');
  await persistentSet(pointerKey(key),json({revision:snapshot.revision,publishedAt:snapshot.publishedAt}));
  const catalog=await getCatalog();
  const next=catalog.sets.filter(item=>item&&item.id!==key);
  next.push(catalogEntry(snapshot));
  next.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  await persistentSet(CATALOG_KEY,json({schemaVersion:1,updatedAt:snapshot.publishedAt,sets:next}));
  return snapshot;
}

async function publish(id){
  const key=cleanId(id);
  if(!key) throw new Error('bad_set_id');
  return store.withLock(`lock:content:${key}`,async()=>{
    const snapshot=await stageDraft(key);
    await activateRevision(key,snapshot.revision);
    return snapshot;
  },{ttl:10,retries:80,delay:50});
}

async function getPublished(id){
  const key=cleanId(id);
  if(!key) return null;
  const pointer=parse(await store.get(pointerKey(key)));
  const revision=Math.max(0,+(pointer&&pointer.revision)||0);
  return revision ? getRevision(key,revision) : null;
}

function previewSnapshot(set){
  if(set.access.mode === 'free') return set;
  const preview = set.access.freePreview;
  if(!preview || preview.kind !== 'first-days' || preview.days <= 0){
    return {...set, roadmaps:set.roadmaps.map(r => ({...r, nodes:[]})), activities:[]};
  }
  const allowedIds = new Set();
  const roadmaps = set.roadmaps.map(roadmap => {
    const visible = roadmap.nodes.filter(node => Number.isInteger(node.dayIndex) && node.dayIndex <= preview.days);
    const visibleIds = new Set(visible.map(node => node.id));
    const nodes = visible.map(node => ({
      ...node,
      prerequisites:(node.prerequisites || []).filter(id => visibleIds.has(id))
    }));
    for(const node of nodes) for(const id of (node.activityIds || [])) allowedIds.add(id);
    return {...roadmap, nodes};
  });
  const activities = set.activities.filter(activity => allowedIds.has(activity.id));
  return {...set, roadmaps, activities};
}

module.exports = {
  validateSet,
  cleanId,
  getCatalog,
  putDraft,
  getDraft,
  publish,
  stageDraft,
  activateRevision,
  getRevision,
  getPublished,
  previewSnapshot,
  keys:{CATALOG_KEY,draftKey,pointerKey,revisionKey,revisionCounterKey}
};
