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
  delete meta.draftRevision;
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

async function listSetIds(){
  const keys=await store.scan(`${PREFIX}:set:*:pointer`,1000);
  const prefix=`${PREFIX}:set:`, suffix=':pointer';
  return keys.map(key=>{
    if(!key.startsWith(prefix) || !key.endsWith(suffix)) return '';
    return key.slice(prefix.length,-suffix.length);
  }).filter(Boolean).sort();
}

async function updateMeta(setId,expectedDraftRevision,updater){
  return store.withLock('lock:content-workspace:'+setId,async()=>{
    const pointer=await readPointer(setId);
    if(!pointer) throw new Error('draft_not_found');
    const currentRevision=Math.max(1,+pointer.draftRevision||1);
    if(Number(expectedDraftRevision)!==currentRevision) throw new Error('set_revision_conflict');
    const nextMeta=updater(clone(pointer.meta));
    if(!nextMeta || typeof nextMeta!=='object' || Array.isArray(nextMeta)) throw new Error('bad_set_update');
    if(nextMeta.id!==pointer.meta.id) throw new Error('set_id_immutable');
    if(nextMeta.slug!==pointer.meta.slug) throw new Error('set_slug_immutable');
    const updated={
      ...pointer,
      draftRevision:currentRevision+1,
      updatedAt:new Date().toISOString(),
      meta:nextMeta
    };
    await store.pipe([['SET',pointerKey(setId),JSON.stringify(updated)]]);
    return updated;
  },{ttl:10,retries:80,delay:50});
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

async function getStructure(setId){
  const pointer=await readPointer(setId);
  if(!pointer) return null;
  const roadmaps=[];
  for(const roadmapMeta of pointer.roadmaps || []){
    const versions=(pointer.nodeRefs&&pointer.nodeRefs[roadmapMeta.id])||{};
    const keys=(roadmapMeta.nodeIds||[]).map(id=>nodeKey(setId,pointer.generation,roadmapMeta.id,id,versions[id]||1));
    const nodes=(await manyJson(keys)).filter(Boolean);
    if(nodes.length!==keys.length) throw new Error('draft_node_missing');
    roadmaps.push({
      id:roadmapMeta.id,
      title:clone(roadmapMeta.title),
      nodes
    });
  }
  return {
    meta:clone(pointer.meta),
    roadmaps,
    draftRevision:pointer.draftRevision,
    draftUpdatedAt:pointer.updatedAt
  };
}

async function getNode(setId,roadmapId,nodeId){
  const pointer=await readPointer(setId);
  if(!pointer) return null;
  const versions=(pointer.nodeRefs&&pointer.nodeRefs[roadmapId])||{};
  const version=Math.max(0,+versions[nodeId]||0);
  if(!version) return null;
  const node=parseJson(await store.get(nodeKey(setId,pointer.generation,roadmapId,nodeId,version)));
  return node ? {node,version,draftRevision:pointer.draftRevision} : null;
}

async function getActivities(setId,ids){
  const pointer=await readPointer(setId);
  if(!pointer) return [];
  const requested=[...new Set((ids||[]).map(String).filter(Boolean))];
  const keys=requested.map(id=>{
    const revision=Math.max(0,+((pointer.activityRefs||{})[id])||0);
    return revision ? activityKey(setId,pointer.generation,id,revision) : null;
  });
  const validKeys=keys.filter(Boolean);
  const values=await manyJson(validKeys);
  const byKey=new Map();
  let at=0;
  for(const key of keys){
    if(!key) continue;
    byKey.set(key,values[at++]);
  }
  return requested.map((id,index)=>{
    const key=keys[index];
    return key ? byKey.get(key) : null;
  }).filter(Boolean);
}

async function createNode(setId,roadmapId,node,validateNode){
  return store.withLock('lock:content-workspace:'+setId,async()=>{
    const pointer=await readPointer(setId);
    if(!pointer) throw new Error('draft_not_found');
    const roadmapIndex=(pointer.roadmaps||[]).findIndex(item=>item.id===roadmapId);
    if(roadmapIndex<0) throw new Error('roadmap_not_found');
    const roadmap=pointer.roadmaps[roadmapIndex];
    if((roadmap.nodeIds||[]).includes(node.id)) throw new Error('node_exists');
    if(validateNode) validateNode(node);

    const nextNode={...clone(node),order:(roadmap.nodeIds||[]).length};
    const roadmaps=pointer.roadmaps.slice();
    roadmaps[roadmapIndex]={...roadmap,nodeIds:[...(roadmap.nodeIds||[]),nextNode.id]};
    const nodeRefs={...(pointer.nodeRefs||{}),[roadmapId]:{...((pointer.nodeRefs&&pointer.nodeRefs[roadmapId])||{}),[nextNode.id]:1}};
    const updated={
      ...pointer,
      draftRevision:Math.max(1,+pointer.draftRevision||1)+1,
      updatedAt:new Date().toISOString(),
      roadmaps,nodeRefs
    };
    await store.pipe([
      ['SET',nodeKey(setId,pointer.generation,roadmapId,nextNode.id,1),JSON.stringify(nextNode),'NX'],
      ['SET',pointerKey(setId),JSON.stringify(updated)]
    ]);
    return {node:nextNode,version:1,draftRevision:updated.draftRevision};
  },{ttl:10,retries:80,delay:50});
}

async function updateNode(setId,roadmapId,nodeId,expectedVersion,updater,validateNode){
  return store.withLock('lock:content-workspace:'+setId,async()=>{
    const pointer=await readPointer(setId);
    if(!pointer) throw new Error('draft_not_found');
    const versions=(pointer.nodeRefs&&pointer.nodeRefs[roadmapId])||{};
    const currentVersion=Math.max(0,+versions[nodeId]||0);
    if(!currentVersion) throw new Error('node_not_found');
    if(Number(expectedVersion)!==currentVersion) throw new Error('node_revision_conflict');
    const current=parseJson(await store.get(nodeKey(setId,pointer.generation,roadmapId,nodeId,currentVersion)));
    if(!current) throw new Error('node_not_found');
    const next=updater(clone(current));
    if(!next || typeof next!=='object' || Array.isArray(next)) throw new Error('bad_node_update');
    if(next.id!==current.id) throw new Error('node_id_immutable');
    if(validateNode) validateNode(next);

    let nextVersion=currentVersion+1;
    while(await store.get(nodeKey(setId,pointer.generation,roadmapId,nodeId,nextVersion))) nextVersion++;
    const updated={
      ...pointer,
      draftRevision:Math.max(1,+pointer.draftRevision||1)+1,
      updatedAt:new Date().toISOString(),
      nodeRefs:{...(pointer.nodeRefs||{}),[roadmapId]:{...versions,[nodeId]:nextVersion}}
    };
    await store.pipe([
      ['SET',nodeKey(setId,pointer.generation,roadmapId,nodeId,nextVersion),JSON.stringify(next),'NX'],
      ['SET',pointerKey(setId),JSON.stringify(updated)]
    ]);
    return {node:next,version:nextVersion,draftRevision:updated.draftRevision};
  },{ttl:10,retries:80,delay:50});
}

async function deleteNode(setId,roadmapId,nodeId){
  return store.withLock('lock:content-workspace:'+setId,async()=>{
    const pointer=await readPointer(setId);
    if(!pointer) throw new Error('draft_not_found');
    const roadmapIndex=(pointer.roadmaps||[]).findIndex(item=>item.id===roadmapId);
    if(roadmapIndex<0) throw new Error('roadmap_not_found');
    const roadmap=pointer.roadmaps[roadmapIndex];
    const nodeIds=roadmap.nodeIds||[];
    if(!nodeIds.includes(nodeId)) throw new Error('node_not_found');
    if(nodeIds.length<=1) throw new Error('roadmap_requires_node');

    const versions=(pointer.nodeRefs&&pointer.nodeRefs[roadmapId])||{};
    const keys=nodeIds.filter(id=>id!==nodeId).map(id=>nodeKey(setId,pointer.generation,roadmapId,id,versions[id]||1));
    const others=(await manyJson(keys)).filter(Boolean);
    if(others.some(node=>(node.prerequisites||[]).includes(nodeId))) throw new Error('node_has_dependents');

    const roadmaps=pointer.roadmaps.slice();
    roadmaps[roadmapIndex]={...roadmap,nodeIds:nodeIds.filter(id=>id!==nodeId)};
    const nextVersions={...versions};
    delete nextVersions[nodeId];
    const updated={
      ...pointer,
      draftRevision:Math.max(1,+pointer.draftRevision||1)+1,
      updatedAt:new Date().toISOString(),
      roadmaps,
      nodeRefs:{...(pointer.nodeRefs||{}),[roadmapId]:nextVersions}
    };
    await store.pipe([['SET',pointerKey(setId),JSON.stringify(updated)]]);
    return {draftRevision:updated.draftRevision};
  },{ttl:10,retries:80,delay:50});
}

async function reorderNodes(setId,roadmapId,nodeIds,validateNode){
  return store.withLock('lock:content-workspace:'+setId,async()=>{
    const pointer=await readPointer(setId);
    if(!pointer) throw new Error('draft_not_found');
    const roadmapIndex=(pointer.roadmaps||[]).findIndex(item=>item.id===roadmapId);
    if(roadmapIndex<0) throw new Error('roadmap_not_found');
    const roadmap=pointer.roadmaps[roadmapIndex];
    const currentIds=roadmap.nodeIds||[];
    if(nodeIds.length!==currentIds.length || new Set(nodeIds).size!==nodeIds.length || nodeIds.some(id=>!currentIds.includes(id))){
      throw new Error('node_order_mismatch');
    }

    const versions=(pointer.nodeRefs&&pointer.nodeRefs[roadmapId])||{};
    const currentKeys=nodeIds.map(id=>nodeKey(setId,pointer.generation,roadmapId,id,versions[id]||1));
    const nodes=await manyJson(currentKeys);
    if(nodes.some(node=>!node)) throw new Error('node_not_found');

    const nextVersions={...versions};
    const commands=[];
    for(let index=0;index<nodes.length;index++){
      const current=nodes[index];
      const id=nodeIds[index];
      const next={...current,order:index};
      if(validateNode) validateNode(next);
      let version=Math.max(1,+versions[id]||1)+1;
      while(await store.get(nodeKey(setId,pointer.generation,roadmapId,id,version))) version++;
      nextVersions[id]=version;
      commands.push(['SET',nodeKey(setId,pointer.generation,roadmapId,id,version),JSON.stringify(next),'NX']);
    }

    const roadmaps=pointer.roadmaps.slice();
    roadmaps[roadmapIndex]={...roadmap,nodeIds:[...nodeIds]};
    const updated={
      ...pointer,
      draftRevision:Math.max(1,+pointer.draftRevision||1)+1,
      updatedAt:new Date().toISOString(),
      roadmaps,
      nodeRefs:{...(pointer.nodeRefs||{}),[roadmapId]:nextVersions}
    };
    commands.push(['SET',pointerKey(setId),JSON.stringify(updated)]);
    await writeCommands(commands);
    return {draftRevision:updated.draftRevision};
  },{ttl:15,retries:100,delay:50});
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
    const nodeVersion=Math.max(0,+versions[nodeId]||0);
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

async function detachActivity(setId,roadmapId,nodeId,activityId){
  return store.withLock('lock:content-workspace:'+setId,async()=>{
    const pointer=await readPointer(setId);
    if(!pointer) throw new Error('draft_not_found');
    const versions=(pointer.nodeRefs&&pointer.nodeRefs[roadmapId])||{};
    const currentVersion=Math.max(0,+versions[nodeId]||0);
    if(!currentVersion) throw new Error('node_not_found');
    const current=parseJson(await store.get(nodeKey(setId,pointer.generation,roadmapId,nodeId,currentVersion)));
    if(!current) throw new Error('node_not_found');
    const currentIds=current.activityIds||[];
    if(!currentIds.includes(activityId)) throw new Error('activity_not_attached');

    let nextVersion=currentVersion+1;
    while(await store.get(nodeKey(setId,pointer.generation,roadmapId,nodeId,nextVersion))) nextVersion++;
    const next={...current,activityIds:currentIds.filter(id=>id!==activityId)};
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
  replace,get,ensure,readPointer,listSetIds,updateMeta,getStructure,getNode,createNode,updateNode,deleteNode,reorderNodes,getActivities,getActivity,updateActivity,createActivity,detachActivity,reorderActivities,
  keys:{pointerKey,generationCounterKey,activityKey,nodeKey}
};
