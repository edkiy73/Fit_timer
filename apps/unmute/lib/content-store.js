'use strict';

const { store } = require('../../../packages/core/server/store');
const Draft = require('./content-draft-workspace');

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

const CEFR=new Set(['pre-a1','a1','a2','b1','b2','c1','c2']);

function validateSetMeta(meta){
  assertObject(meta,'set_meta');
  if(meta.schemaVersion!==1) throw new Error('unsupported_schema');
  if(!cleanId(meta.id)) throw new Error('bad_set_id');
  if(!cleanId(meta.slug)) throw new Error('bad_set_slug');
  if(!isTextMap(meta.title)) throw new Error('missing_set_title');
  if(!cleanId(meta.defaultRoadmapId)) throw new Error('bad_default_roadmap');
  const level=meta.level&&typeof meta.level==='object'&&!Array.isArray(meta.level)?meta.level:{};
  if(level.from!==undefined && !CEFR.has(String(level.from))) throw new Error('bad_level_from');
  if(level.to!==undefined && !CEFR.has(String(level.to))) throw new Error('bad_level_to');
  if(!Array.isArray(level.labels)) throw new Error('bad_level_labels');
  const access=assertObject(meta.access,'access');
  if(access.mode==='entitlement'){
    if(!SKU.test(String(access.entitlement||'').trim().toLowerCase())) throw new Error('bad_entitlement');
    if(access.freePreview){
      if(access.freePreview.kind!=='first-days') throw new Error('bad_free_preview_kind');
      if(!Number.isInteger(access.freePreview.days)||access.freePreview.days<0) throw new Error('bad_free_preview_days');
      if(access.freePreview.learnedContentStaysAvailable!==true) throw new Error('free_review_must_stay_available');
    }
  }else if(access.mode!=='free'){
    throw new Error('bad_access_mode');
  }
  return meta;
}

function validateNode(node){
  assertObject(node,'node');
  const id=cleanId(node.id);
  if(!id) throw new Error('bad_node_id');
  if(!['lesson','practice','review','dialogue','checkpoint','bonus'].includes(node.kind)) throw new Error(`bad_node_kind:${id}`);
  if(!isTextMap(node.title)) throw new Error(`bad_node_title:${id}`);
  if(node.dayIndex!==undefined && (!Number.isInteger(node.dayIndex)||node.dayIndex<1)) throw new Error(`bad_day_index:${id}`);
  if(!Number.isInteger(node.order)||node.order<0) throw new Error(`bad_node_order:${id}`);
  if(!Array.isArray(node.prerequisites)||node.prerequisites.some(dep=>!cleanId(dep))) throw new Error(`bad_node_prerequisites:${id}`);
  if(!Array.isArray(node.activityIds)||node.activityIds.some(ref=>!cleanId(ref))) throw new Error(`bad_node_activities:${id}`);
  if(typeof node.optional!=='boolean') throw new Error(`bad_node_optional:${id}`);
  return node;
}

function isTextMap(value){
  return !!value && typeof value==='object' && !Array.isArray(value)
    && Object.values(value).some(item=>typeof item==='string' && item.trim());
}

function validateAnswer(answer,id){
  assertObject(answer,'answer');
  if(!Array.isArray(answer.accepted) || !answer.accepted.length || answer.accepted.some(value=>typeof value!=='string' || !value.trim())){
    throw new Error(`bad_answers:${id}`);
  }
  return answer;
}

function validateActivity(activity){
  assertObject(activity,'activity');
  const id=cleanId(activity.id);
  if(!id) throw new Error('bad_activity_id');
  if(!Number.isInteger(activity.revision) || activity.revision<1) throw new Error(`bad_activity_revision:${id}`);
  if(!['preserve','reset'].includes(activity.revisionProgress)) throw new Error(`bad_revision_progress:${id}`);
  if(!Array.isArray(activity.tags)) throw new Error(`bad_activity_tags:${id}`);
  if(activity.lexiconRefs!==undefined && !Array.isArray(activity.lexiconRefs)) throw new Error(`bad_lexicon_refs:${id}`);

  switch(activity.type){
    case 'theory':
      if(!isTextMap(activity.body)) throw new Error(`bad_theory_body:${id}`);
      if(!['text','html','markdown'].includes(activity.format)) throw new Error(`bad_theory_format:${id}`);
      break;
    case 'choice':
      if(!isTextMap(activity.prompt)) throw new Error(`bad_choice_prompt:${id}`);
      if(!Array.isArray(activity.options) || activity.options.length<2 || activity.options.some(option=>!isTextMap(option))){
        throw new Error(`bad_choice_options:${id}`);
      }
      if(!Number.isInteger(activity.correctIndex) || activity.correctIndex<0 || activity.correctIndex>=activity.options.length){
        throw new Error(`bad_choice_answer:${id}`);
      }
      break;
    case 'text-input':
      if(!isTextMap(activity.prompt)) throw new Error(`bad_text_input_prompt:${id}`);
      validateAnswer(activity.answer,id);
      break;
    case 'translation':
      if(!['to-target','from-target'].includes(activity.direction)) throw new Error(`bad_translation_direction:${id}`);
      if(!isTextMap(activity.prompt)) throw new Error(`bad_translation_prompt:${id}`);
      validateAnswer(activity.answer,id);
      break;
    case 'speaking':
      if(!isTextMap(activity.prompt)) throw new Error(`bad_speaking_prompt:${id}`);
      if(activity.answer!==undefined) validateAnswer(activity.answer,id);
      break;
    case 'pattern-drill':
      if(!isTextMap(activity.pattern)) throw new Error(`bad_pattern:${id}`);
      if(!Array.isArray(activity.items) || !activity.items.length) throw new Error(`bad_pattern_items:${id}`);
      for(const item of activity.items){
        if(!item || !cleanId(item.id) || !isTextMap(item.prompt)) throw new Error(`bad_pattern_item:${id}`);
        validateAnswer(item.answer,id);
      }
      break;
    case 'dialogue':
      if(!isTextMap(activity.scene)) throw new Error(`bad_dialogue_scene:${id}`);
      if(!Array.isArray(activity.lines) || !activity.lines.length) throw new Error(`bad_dialogue_lines:${id}`);
      for(const line of activity.lines){
        if(!line || !cleanId(line.id) || !isTextMap(line.partner)) throw new Error(`bad_dialogue_line:${id}`);
        validateAnswer(line.answer,id);
      }
      break;
    case 'listening':
      if(typeof activity.text!=='string' || !activity.text.trim()) throw new Error(`bad_listening_text:${id}`);
      if(activity.answer!==undefined) validateAnswer(activity.answer,id);
      break;
    case 'review':
      assertObject(activity.source,'review_source');
      if(!Array.isArray(activity.source.activityIds) || !Array.isArray(activity.source.tags) || typeof activity.source.dueOnly!=='boolean'){
        throw new Error(`bad_review_source:${id}`);
      }
      break;
    case 'ai-conversation':
      if(!isTextMap(activity.topic)) throw new Error(`bad_ai_topic:${id}`);
      if(typeof activity.promptTemplate!=='string' || !activity.promptTemplate.trim()) throw new Error(`bad_ai_prompt:${id}`);
      if(!Array.isArray(activity.focus)) throw new Error(`bad_ai_focus:${id}`);
      break;
    default:
      throw new Error(`unknown_activity_type:${id}`);
  }
  return activity;
}

function validateSet(input){
  const set = assertObject(input, 'set');
  validateSetMeta(set);
  if(!Array.isArray(set.roadmaps) || !set.roadmaps.length) throw new Error('missing_roadmaps');
  if(!Array.isArray(set.activities)) throw new Error('missing_activities');

  const activities = new Map();
  for(const activity of set.activities){
    const checked=validateActivity(activity);
    const id=cleanId(checked.id);
    if(activities.has(id)) throw new Error(`duplicate_activity:${id}`);
    activities.set(id, checked);
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
      const checked=validateNode(node);
      const nodeId=cleanId(checked.id);
      if(nodes.has(nodeId)) throw new Error(`duplicate_node:${nodeId}`);
      nodes.set(nodeId,checked);
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
  const set=validateSet(input);
  const id=cleanId(set.id);
  const draft={...set,id,slug:cleanId(set.slug)};
  await Draft.replace(draft);
  return Draft.get(id);
}

async function legacyDraft(id){
  const key=cleanId(id);
  if(!key) return null;
  return parse(await store.get(draftKey(key)));
}

async function getDraft(id){
  const key=cleanId(id);
  if(!key) return null;
  const normalized=await Draft.get(key);
  if(normalized) return normalized;
  return legacyDraft(key);
}

async function ensureDraftWorkspace(id){
  const key=cleanId(id);
  if(!key) throw new Error('bad_set_id');
  let pointer=await Draft.readPointer(key);
  if(pointer) return pointer;
  const fallback=await legacyDraft(key);
  if(!fallback) throw new Error('draft_not_found');
  validateSet(fallback);
  return Draft.ensure(key,fallback);
}

async function listDraftSetIds(){
  const ids=new Set(await Draft.listSetIds());
  const legacyKeys=await store.scan(`${PREFIX}:set:*:draft`,1000);
  for(const key of legacyKeys){
    const prefix=`${PREFIX}:set:`, suffix=':draft';
    if(key.startsWith(prefix)&&key.endsWith(suffix)) ids.add(key.slice(prefix.length,-suffix.length));
  }
  return [...ids].filter(cleanId).sort();
}

async function updateDraftSetMeta(id,expectedDraftRevision,updater){
  const key=cleanId(id);
  await ensureDraftWorkspace(key);
  return Draft.updateMeta(key,expectedDraftRevision,current=>{
    const next=updater(current);
    validateSetMeta(next);
    return next;
  });
}

async function getDraftStructure(id){
  const key=cleanId(id);
  await ensureDraftWorkspace(key);
  return Draft.getStructure(key);
}

async function getDraftNode(id,roadmapId,nodeId){
  const key=cleanId(id);
  await ensureDraftWorkspace(key);
  const nodeResult=await Draft.getNode(key,cleanId(roadmapId),cleanId(nodeId));
  if(!nodeResult) return null;
  const activities=await Draft.getActivities(key,nodeResult.node.activityIds || []);
  return {...nodeResult,activities};
}

async function createDraftNode(id,roadmapId,node){
  const key=cleanId(id);
  await ensureDraftWorkspace(key);
  return Draft.createNode(key,cleanId(roadmapId),node,validateNode);
}

async function updateDraftNode(id,roadmapId,nodeId,expectedVersion,updater){
  const key=cleanId(id);
  await ensureDraftWorkspace(key);
  return Draft.updateNode(key,cleanId(roadmapId),cleanId(nodeId),expectedVersion,updater,validateNode);
}

async function deleteDraftNode(id,roadmapId,nodeId){
  const key=cleanId(id);
  await ensureDraftWorkspace(key);
  return Draft.deleteNode(key,cleanId(roadmapId),cleanId(nodeId));
}

async function reorderDraftNodes(id,roadmapId,nodeIds){
  const key=cleanId(id);
  await ensureDraftWorkspace(key);
  return Draft.reorderNodes(key,cleanId(roadmapId),nodeIds.map(cleanId),validateNode);
}

async function getDraftActivity(id,activityId){
  const key=cleanId(id);
  await ensureDraftWorkspace(key);
  return Draft.getActivity(key,cleanId(activityId));
}

async function updateDraftActivity(id,activityId,expectedRevision,updater){
  const key=cleanId(id), aid=cleanId(activityId);
  await ensureDraftWorkspace(key);
  return Draft.updateActivity(key,aid,expectedRevision,updater,validateActivity);
}

async function createDraftActivity(id,roadmapId,nodeId,activity){
  const key=cleanId(id);
  await ensureDraftWorkspace(key);
  return Draft.createActivity(key,cleanId(roadmapId),cleanId(nodeId),activity,validateActivity);
}

async function detachDraftActivity(id,roadmapId,nodeId,activityId){
  const key=cleanId(id);
  await ensureDraftWorkspace(key);
  return Draft.detachActivity(key,cleanId(roadmapId),cleanId(nodeId),cleanId(activityId));
}

async function reorderDraftActivities(id,roadmapId,nodeId,activityIds){
  const key=cleanId(id);
  await ensureDraftWorkspace(key);
  return Draft.reorderActivities(key,cleanId(roadmapId),cleanId(nodeId),activityIds.map(cleanId));
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
  delete snapshot.draftRevision;
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
  validateSetMeta,
  validateNode,
  validateSet,
  validateActivity,
  cleanId,
  getCatalog,
  putDraft,
  getDraft,
  ensureDraftWorkspace,
  listDraftSetIds,
  updateDraftSetMeta,
  getDraftStructure,
  getDraftNode,
  createDraftNode,
  updateDraftNode,
  deleteDraftNode,
  reorderDraftNodes,
  getDraftActivity,
  updateDraftActivity,
  createDraftActivity,
  detachDraftActivity,
  reorderDraftActivities,
  publish,
  stageDraft,
  activateRevision,
  getRevision,
  getPublished,
  previewSnapshot,
  keys:{CATALOG_KEY,draftKey,pointerKey,revisionKey,revisionCounterKey}
};
