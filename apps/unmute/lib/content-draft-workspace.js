'use strict';

const {store,parseJson,writeCommands,manyJson,nextCounter,clone}=require('./workspace-utils');

const PREFIX='unmute:content:draft:v2';
const pointerKey=setId=>`${PREFIX}:set:${setId}:pointer`;
const generationCounterKey=setId=>`${PREFIX}:set:${setId}:generation`;
const activityKey=(setId,generation,id,revision)=>`${PREFIX}:set:${setId}:g:${generation}:activity:${id}:r:${revision}`;
const nodeKey=(setId,generation,roadmapId,id,version)=>`${PREFIX}:set:${setId}:g:${generation}:roadmap:${roadmapId}:node:${id}:v:${version}`;

function splitSet(set){
  const meta=clone(set);
  delete meta.activities;
  delete meta.roadmaps;
  delete meta.draftUpdatedAt;
  delete meta.publishedAt;

  const activityRefs={};
  for(const activity of set.activities || []){
    activityRefs[activity.id]=Math.max(1,+activity.revision||1);
  }

  const nodeRefs={};
  const roadmaps=(set.roadmaps || []).map(roadmap=>{
    const refs={};
    for(const node of roadmap.nodes || []) refs[node.id]=1;
    nodeRefs[roadmap.id]=refs;
    return {
      id:roadmap.id,
      title:clone(roadmap.title),
      nodeIds:(roadmap.nodes || []).map(node=>node.id)
    };
  });

  return {meta,activityRefs,nodeRefs,roadmaps};
}

async function readPointer(setId){
  return parseJson(await store.get(pointerKey(setId)));
}

async function replace(set){
  const setId=String(set.id||'').trim();
  if(!setId) throw new Error('bad_set_id');
  const generation=await nextCounter(generationCounterKey(setId));
  const parts=splitSet(set);
  const now=new Date().toISOString();

  const commands=[];
  for(const activity of set.activities || []){
    commands.push(['SET',activityKey(setId,generation,activity.id,Math.max(1,+activity.revision||1)),JSON.stringify(activity),'NX']);
  }
  for(const roadmap of set.roadmaps || []){
    for(const node of roadmap.nodes || []){
      commands.push(['SET',nodeKey(setId,generation,roadmap.id,node.id,1),JSON.stringify(node),'NX']);
    }
  }
  await writeCommands(commands);

  const pointer={
    schemaVersion:2,
    generation,
    draftRevision:1,
    updatedAt:now,
    meta:parts.meta,
    roadmaps:parts.roadmaps,
    activityRefs:parts.activityRefs,
    nodeRefs:parts.nodeRefs
  };
  await store.pipe([['SET',pointerKey(setId),JSON.stringify(pointer)]]);
  return pointer;
}

async function get(setId){
  const pointer=await readPointer(setId);
  if(!pointer || pointer.schemaVersion!==2) return null;
  const generation=pointer.generation;

  const activityIds=Object.keys(pointer.activityRefs || {});
  const activityKeys=activityIds.map(id=>activityKey(setId,generation,id,pointer.activityRefs[id]));
  const activities=(await manyJson(activityKeys)).filter(Boolean);
  if(activities.length!==activityIds.length) throw new Error('draft_activity_missing');

  const roadmaps=[];
  for(const roadmapMeta of pointer.roadmaps || []){
    const versions=(pointer.nodeRefs && pointer.nodeRefs[roadmapMeta.id]) || {};
    const keys=(roadmapMeta.nodeIds || []).map(id=>nodeKey(setId,generation,roadmapMeta.id,id,versions[id] || 1));
    const nodes=(await manyJson(keys)).filter(Boolean);
    if(nodes.length!==keys.length) throw new Error('draft_node_missing');
    roadmaps.push({
      id:roadmapMeta.id,
      title:clone(roadmapMeta.title),
      nodes
    });
  }

  return {
    ...clone(pointer.meta),
    roadmaps,
    activities,
    draftRevision:pointer.draftRevision,
    draftUpdatedAt:pointer.updatedAt
  };
}

async function ensure(setId,fallbackSet){
  let pointer=await readPointer(setId);
  if(pointer && pointer.schemaVersion===2) return pointer;
  if(!fallbackSet) return null;
  await store.withLock('lock:content-workspace:'+setId,async()=>{
    pointer=await readPointer(setId);
    if(pointer && pointer.schemaVersion===2) return;
    await replace(fallbackSet);
  },{ttl:20,retries:100,delay:50});
  return readPointer(setId);
}

async function getActivity(setId,id){
  const pointer=await readPointer(setId);
  if(!pointer) return null;
  const revision=Math.max(0,+((pointer.activityRefs||{})[id])||0);
  if(!revision) return null;
  const activity=parseJson(await store.get(activityKey(setId,pointer.generation,id,revision)));
  return activity ? {activity,draftRevision:pointer.draftRevision} : null;
}

async function updateActivity(setId,id,expectedRevision,updater,validateActivity){
  return store.withLock('lock:content-workspace:'+setId,async()=>{
    const pointer=await readPointer(setId);
    if(!pointer) throw new Error('draft_not_found');
    const currentRevision=Math.max(0,+((pointer.activityRefs||{})[id])||0);
    if(!currentRevision) throw new Error('activity_not_found');
    if(Number(expectedRevision)!==currentRevision) throw new Error('activity_revision_conflict');

    const current=parseJson(await store.get(activityKey(setId,pointer.generation,id,currentRevision)));
    if(!current) throw new Error('activity_not_found');
    const next=updater(clone(current));
    if(!next || typeof next!=='object' || Array.isArray(next)) throw new Error('bad_activity_update');
    if(next.id!==current.id) throw new Error('activity_id_immutable');

    let revision=currentRevision+1;
    while(await store.get(activityKey(setId,pointer.generation,id,revision))) revision++;
    next.revision=revision;
    if(validateActivity) validateActivity(next);

    const updatedPointer={
      ...pointer,
      draftRevision:Math.max(1,+pointer.draftRevision||1)+1,
      updatedAt:new Date().toISOString(),
      activityRefs:{...(pointer.activityRefs||{}),[id]:revision}
    };

    await store.pipe([
      ['SET',activityKey(setId,pointer.generation,id,revision),JSON.stringify(next),'NX'],
      ['SET',pointerKey(setId),JSON.stringify(updatedPointer)]
    ]);
    return {activity:next,draftRevision:updatedPointer.draftRevision};
  },{ttl:10,retries:80,delay:50});
}

async function createActivity(setId,roadmapId,nodeId,activity,validateActivity){
  return store.withLock('lock:content-workspace:'+setId,async()=>{
    const pointer=await readPointer(setId);
    if(!pointer) throw new Error('draft_not_found');
    if((pointer.activityRefs||{})[activity.id]) throw new Error('activity_exists');

    const roadmap=(pointer.roadmaps||[]).find(item=>item.id===roadmapId);
    if(!roadmap) throw new Error('roadmap_not_found');
    const versions=(pointer.nodeRefs&&pointer.nodeRefs[roadmapId])||{};
    const nodeVersion=Math.max(1,+versions[nodeId]||0);
    if(!nodeVersion) throw new Error('node_not_found');
    const currentNode=parseJson(await store.get(nodeKey(setId,pointer.generation,roadmapId,nodeId,nodeVersion)));
    if(!currentNode) throw new Error('node_not_found');

    const nextActivity={...clone(activity),revision:1};
    if(validateActivity) validateActivity(nextActivity);

    let nextNodeVersion=nodeVersion+1;
    while(await store.get(nodeKey(setId,pointer.generation,roadmapId,nodeId,nextNodeVersion))) nextNodeVersion++;
    const nextNode={...currentNode,activityIds:[...(currentNode.activityIds||[]),nextActivity.id]};

    const nodeRefs={...(pointer.nodeRefs||{}),[roadmapId]:{...versions,[nodeId]:nextNodeVersion}};
    const updatedPointer={
      ...pointer,
      draftRevision:Math.max(1,+pointer.draftRevision||1)+1,
      updatedAt:new Date().toISOString(),
      activityRefs:{...(pointer.activityRefs||{}),[nextActivity.id]:1},
      nodeRefs
    };

    await store.pipe([
      ['SET',activityKey(setId,pointer.generation,nextActivity.id,1),JSON.stringify(nextActivity),'NX'],
      ['SET',nodeKey(setId,pointer.generation,roadmapId,nodeId,nextNodeVersion),JSON.stringify(nextNode),'NX'],
      ['SET',pointerKey(setId),JSON.stringify(updatedPointer)]
    ]);
    return {activity:nextActivity,node:nextNode,draftRevision:updatedPointer.draftRevision};
  },{ttl:10,retries:80,delay:50});
}

async function reorderActivities(setId,roadmapId,nodeId,activityIds){
  return store.withLock('lock:content-workspace:'+setId,async()=>{
    const pointer=await readPointer(setId);
    if(!pointer) throw new Error('draft_not_found');
    const versions=(pointer.nodeRefs&&pointer.nodeRefs[roadmapId])||{};
    const currentVersion=Math.max(0,+versions[nodeId]||0);
    if(!currentVersion) throw new Error('node_not_found');
    const current=parseJson(await store.get(nodeKey(setId,pointer.generation,roadmapId,nodeId,currentVersion)));
    if(!current) throw new Error('node_not_found');

    const currentIds=current.activityIds||[];
    if(activityIds.length!==currentIds.length) throw new Error('activity_order_mismatch');
    if(new Set(activityIds).size!==activityIds.length) throw new Error('activity_order_duplicate');
    if(activityIds.some(id=>!currentIds.includes(id))) throw new Error('activity_order_mismatch');

    let nextVersion=currentVersion+1;
    while(await store.get(nodeKey(setId,pointer.generation,roadmapId,nodeId,nextVersion))) nextVersion++;
    const next={...current,activityIds:[...activityIds]};
    const updatedPointer={
      ...pointer,
      draftRevision:Math.max(1,+pointer.draftRevision||1)+1,
      updatedAt:new Date().toISOString(),
      nodeRefs:{...(pointer.nodeRefs||{}),[roadmapId]:{...versions,[nodeId]:nextVersion}}
    };
    await store.pipe([
      ['SET',nodeKey(setId,pointer.generation,roadmapId,nodeId,nextVersion),JSON.stringify(next),'NX'],
      ['SET',pointerKey(setId),JSON.stringify(updatedPointer)]
    ]);
    return {node:next,draftRevision:updatedPointer.draftRevision};
  },{ttl:10,retries:80,delay:50});
}

module.exports={
  replace,get,ensure,readPointer,getActivity,updateActivity,createActivity,reorderActivities,
  keys:{pointerKey,generationCounterKey,activityKey,nodeKey}
};
