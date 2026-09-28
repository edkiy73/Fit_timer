'use strict';

const crypto = require('crypto');
const { send, fail } = require('../../../packages/core/server/util');
const Content = require('./content-store');
const Lexicon = require('./lexicon-store');
const Release = require('./content-release');
const BulkLexicon = require('./lexicon-bulk');

const LEGACY_SHA = '011572be908d64a1e092e63a821e407d85753205';
const LEGACY_URL = 'https://raw.githubusercontent.com/edkiy73/English/' + LEGACY_SHA + '/index.html';

async function defaultLoadLegacySource(){
  const response = await fetch(LEGACY_URL, {signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw new Error('legacy_source_http_' + response.status);
  return response.text();
}

async function defaultImporter(){
  return import('./legacy-import.mjs');
}

async function loadCoverage(){
  return import('./lexicon-coverage.mjs');
}

const ACTIVITY_TYPES=new Set([
  'theory','choice','text-input','translation','speaking','pattern-drill','dialogue','listening','review','ai-conversation'
]);

function newActivity(type){
  if(!ACTIVITY_TYPES.has(type)) throw new Error('bad_activity_type');
  const suffix=crypto.randomUUID().replace(/-/g,'').slice(0,12);
  const id='activity.'+type+'.'+suffix;
  const base={id,revision:1,type,tags:[],revisionProgress:'preserve',lexiconRefs:[]};
  switch(type){
    case 'theory': return {...base,title:{ru:'Новый материал'},body:{ru:'Новый материал'},format:'text'};
    case 'choice': return {...base,prompt:{ru:'Новый вопрос'},options:[{ru:'Вариант 1'},{ru:'Вариант 2'}],correctIndex:0};
    case 'text-input': return {...base,prompt:{ru:'Новый вопрос'},answer:{accepted:['answer'],nearMiss:true,caseSensitive:false}};
    case 'translation': return {...base,direction:'to-target',prompt:{ru:'Новая фраза'},answer:{accepted:['answer'],nearMiss:true,caseSensitive:false}};
    case 'speaking': return {...base,prompt:{ru:'Произнеси фразу'},speechLocale:'en-US'};
    case 'pattern-drill': return {...base,pattern:{ru:'Новый паттерн'},items:[{id:id+'.item-1',prompt:{ru:'Пример'},answer:{accepted:['answer'],nearMiss:true,caseSensitive:false}}]};
    case 'dialogue': return {...base,scene:{ru:'Новый диалог'},lines:[{id:id+'.line-1',partner:{ru:'Реплика собеседника'},answer:{accepted:['answer'],nearMiss:true,caseSensitive:false}}]};
    case 'listening': return {...base,prompt:{ru:'Послушай'},text:'New listening text',speechLocale:'en-US'};
    case 'review': return {...base,source:{activityIds:[],tags:[],dueOnly:true}};
    case 'ai-conversation': return {...base,topic:{ru:'Новая тема'},promptTemplate:'New conversation topic',focus:[]};
    default: throw new Error('bad_activity_type');
  }
}

function requestedSetId(body, fallback=true){
  const id=Content.cleanId(body && body.setId);
  if(id) return id;
  return fallback ? 'general-foundation' : '';
}

function newSetFromBody(body){
  const id=Content.cleanId(body && body.id);
  const title=String(body && body.title || '').trim();
  if(!id || title.length<2) throw new Error('bad_set_create');
  const accessMode=body.accessMode==='free' ? 'free' : 'entitlement';
  const freeDays=Math.max(0,Math.min(365,Math.round(Number(body.freeDays)||0)));
  const access=accessMode==='free'
    ? {mode:'free'}
    : {
        mode:'entitlement',
        entitlement:'course.'+id,
        ...(freeDays>0 ? {freePreview:{kind:'first-days',days:freeDays,learnedContentStaysAvailable:true}} : {})
      };
  const level={
    ...(body.levelFrom ? {from:String(body.levelFrom)} : {}),
    ...(body.levelTo ? {to:String(body.levelTo)} : {}),
    labels:[]
  };
  return {
    schemaVersion:1,id,revision:1,slug:id,
    title:{ru:title},
    description:{ru:String(body.description||'')},
    level,
    access,
    defaultRoadmapId:'main',
    roadmaps:[{
      id:'main',title:{ru:'Основной путь'},nodes:[{
        id:'day-1',kind:'lesson',title:{ru:'День 1'},dayIndex:1,order:0,
        prerequisites:[],activityIds:[],optional:false
      }]
    }],
    activities:[]
  };
}

function newNode({title,dayIndex,kind='lesson',previousId=null}){
  const id='node.'+crypto.randomUUID().replace(/-/g,'').slice(0,12);
  return {
    id,
    kind:['lesson','practice','review','dialogue','checkpoint','bonus'].includes(kind)?kind:'lesson',
    title:{ru:String(title||('День '+dayIndex))},
    dayIndex:Number.isInteger(dayIndex)&&dayIndex>0?dayIndex:undefined,
    order:0,
    prerequisites:previousId?[previousId]:[],
    activityIds:[],
    optional:false
  };
}

function activitySummary(activity){
  if(!activity) return null;
  const firstText=value=>{
    if(!value || typeof value!=='object') return '';
    const preferred=value.ru || value.en;
    if(typeof preferred==='string') return preferred;
    return String(Object.values(value).find(x=>typeof x==='string') || '');
  };
  let label=firstText(activity.title)||firstText(activity.prompt)||firstText(activity.topic)
    ||firstText(activity.pattern)||firstText(activity.scene)||String(activity.text||'');
  label=label.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,120);
  return {id:activity.id,revision:activity.revision,type:activity.type,revisionProgress:activity.revisionProgress,label};
}

function reviewItems(lexicon){
  if(!lexicon || !Array.isArray(lexicon.entries)) return [];
  const out = [];
  for(const entry of lexicon.entries){
    const senses = Array.isArray(entry && entry.senses) ? entry.senses : [];
    const flagged = senses.filter(sense => Array.isArray(sense && sense.tags) && sense.tags.includes('needs-review'));
    if(!flagged.length) continue;
    out.push({
      lexemeId:String(entry.id || ''),
      revision:Number(entry.revision) || 1,
      lemma:String(entry.lemma || ''),
      pronunciation:entry.pronunciation || null,
      senses:flagged.map(sense => ({
        senseId:String(sense.id || ''),
        partOfSpeech:sense.partOfSpeech || null,
        translations:sense.translations || {}
      }))
    });
  }
  return out;
}

function courseStats(set){
  if(!set) return null;
  const roadmaps = Array.isArray(set.roadmaps) ? set.roadmaps : [];
  return {
    id:set.id || null,
    revision:Number(set.revision) || 0,
    activities:Array.isArray(set.activities) ? set.activities.length : 0,
    roadmaps:roadmaps.length,
    nodes:roadmaps.reduce((sum,roadmap)=>sum + (Array.isArray(roadmap.nodes) ? roadmap.nodes.length : 0),0),
    draftUpdatedAt:set.draftUpdatedAt || null,
    publishedAt:set.publishedAt || null
  };
}

function lexiconStats(lexicon){
  if(!lexicon) return null;
  const review = reviewItems(lexicon);
  return {
    revision:Number(lexicon.revision) || 0,
    entries:Array.isArray(lexicon.entries) ? lexicon.entries.length : 0,
    needsReview:review.length,
    sensesNeedingReview:review.reduce((sum,item)=>sum + item.senses.length,0),
    draftUpdatedAt:lexicon.draftUpdatedAt || null,
    publishedAt:lexicon.publishedAt || null
  };
}

function createContentAdminHandler({loadLegacySource=defaultLoadLegacySource, loadImporter=defaultImporter} = {}){
  return async function handleContentAdmin(action, body, res){
    if(!String(action || '').startsWith('content_')) return false;

    try{
      if(action === 'content_status'){
        const [courseDraft,coursePublished,lexiconDraft,lexiconPublished,release] = await Promise.all([
          Content.getDraft('general-foundation'),
          Release.getReleasedSet('general-foundation'),
          Lexicon.getDraft(),
          Release.getReleasedLexicon(),
          Release.getRelease()
        ]);
        send(res,200,{ok:true, source:{sha:LEGACY_SHA,url:LEGACY_URL}, release,
          course:{draft:courseStats(courseDraft),published:courseStats(coursePublished)},
          lexicon:{draft:lexiconStats(lexiconDraft),published:lexiconStats(lexiconPublished)}
        });
        return true;
      }

      if(action === 'content_legacy_import'){
        const [existingCourse,existingLexicon] = await Promise.all([
          Content.getDraft('general-foundation'),
          Lexicon.getDraft()
        ]);
        if((existingCourse || existingLexicon) && body.overwrite !== true){
          fail(res,409,'draft_exists_use_overwrite');
          return true;
        }

        const source = await loadLegacySource();
        const importer = await loadImporter();
        const model = importer.parseLegacySource(source);
        const course = importer.buildCourseSet(model);
        const lexicon = importer.buildLexicon(model);
        const report = importer.validateImport(model,course,lexicon);

        await Content.putDraft(course);
        await Lexicon.putDraft(lexicon);
        send(res,200,{ok:true, sourceSha:LEGACY_SHA, report,
          course:courseStats(await Content.getDraft('general-foundation')),
          lexicon:lexiconStats(await Lexicon.getDraft())
        });
        return true;
      }

      if(action === 'content_review_queue'){
        const lexicon = await Lexicon.getDraft() || await Lexicon.getPublished();
        if(!lexicon){ fail(res,404,'lexicon_not_found'); return true; }
        const items = reviewItems(lexicon);
        send(res,200,{ok:true,count:items.length,items});
        return true;
      }

      if(action === 'content_sets_list'){
        const draftIds=await Content.listDraftSetIds();
        const release=await Release.getRelease();
        const releasedIds=release&&release.sets ? Object.keys(release.sets) : [];
        const ids=[...new Set([...draftIds,...releasedIds])].sort();
        const sets=[];
        for(const id of ids){
          const structure=await Content.getDraftStructure(id).catch(()=>null);
          const released=await Release.getReleasedSet(id).catch(()=>null);
          const meta=structure&&structure.meta || released || null;
          if(!meta) continue;
          sets.push({
            id,
            title:meta.title || {ru:id},
            level:meta.level || {},
            access:meta.access || null,
            draftRevision:structure&&structure.draftRevision || null,
            publishedRevision:released&&released.revision || null,
            nodeCount:structure ? (structure.roadmaps||[]).reduce((sum,roadmap)=>sum+(roadmap.nodes||[]).length,0) : null
          });
        }
        send(res,200,{ok:true,sets});
        return true;
      }

      if(action === 'content_set_create'){
        const set=newSetFromBody(body);
        const [draft,released]=await Promise.all([
          Content.getDraft(set.id),
          Release.getReleasedSet(set.id)
        ]);
        if(draft || released){ fail(res,409,'set_exists'); return true; }
        Content.validateSet(set);
        const created=await Content.putDraft(set);
        send(res,200,{ok:true,set:{id:created.id,title:created.title,draftRevision:created.draftRevision}});
        return true;
      }

      if(action === 'content_set_save'){
        const setId=requestedSetId(body,false);
        const expectedDraftRevision=Number(body.expectedDraftRevision);
        if(!setId || !Number.isInteger(expectedDraftRevision) || expectedDraftRevision<1){
          fail(res,400,'bad_set_revision');
          return true;
        }
        const changes=body.changes&&typeof body.changes==='object'&&!Array.isArray(body.changes)?body.changes:{};
        const updated=await Content.updateDraftSetMeta(setId,expectedDraftRevision,current=>{
          const next={...current};
          if(typeof changes.title==='string' && changes.title.trim()) next.title={...(next.title||{}),ru:changes.title.trim()};
          if(typeof changes.description==='string') next.description={...(next.description||{}),ru:changes.description};
          const level={...(next.level||{})};
          if(Object.prototype.hasOwnProperty.call(changes,'levelFrom')){
            if(changes.levelFrom) level.from=String(changes.levelFrom); else delete level.from;
          }
          if(Object.prototype.hasOwnProperty.call(changes,'levelTo')){
            if(changes.levelTo) level.to=String(changes.levelTo); else delete level.to;
          }
          next.level=level;

          if(changes.accessMode==='free') next.access={mode:'free'};
          if(changes.accessMode==='entitlement'){
            const days=Math.max(0,Math.min(365,Math.round(Number(changes.freeDays)||0)));
            next.access={
              mode:'entitlement',
              entitlement:String(changes.entitlement || (next.access&&next.access.entitlement) || ('course.'+setId)),
              ...(days>0?{freePreview:{kind:'first-days',days,learnedContentStaysAvailable:true}}:{})
            };
          }
          return next;
        });
        send(res,200,{ok:true,set:updated.meta,draftRevision:updated.draftRevision,draftUpdatedAt:updated.updatedAt});
        return true;
      }

      if(action === 'content_node_create'){
        const setId=requestedSetId(body);
        const roadmapId=Content.cleanId(body.roadmapId)||'main';
        const structure=await Content.getDraftStructure(setId);
        if(!structure){ fail(res,404,'draft_not_found'); return true; }
        const roadmap=(structure.roadmaps||[]).find(item=>item.id===roadmapId);
        if(!roadmap){ fail(res,404,'roadmap_not_found'); return true; }
        const ordered=[...(roadmap.nodes||[])].sort((a,b)=>(a.order||0)-(b.order||0));
        const previous=ordered[ordered.length-1]||null;
        const maxDay=ordered.reduce((max,node)=>Number.isInteger(node.dayIndex)?Math.max(max,node.dayIndex):max,0);
        const dayIndex=Number.isInteger(body.dayIndex)&&body.dayIndex>0?body.dayIndex:maxDay+1;
        const node=newNode({title:body.title,dayIndex,kind:String(body.kind||'lesson'),previousId:previous&&previous.id});
        const created=await Content.createDraftNode(setId,roadmapId,node);
        send(res,200,{ok:true,node:created.node,version:created.version,draftRevision:created.draftRevision});
        return true;
      }

      if(action === 'content_node_save'){
        const setId=requestedSetId(body);
        const roadmapId=Content.cleanId(body.roadmapId);
        const nodeId=Content.cleanId(body.nodeId);
        const expectedVersion=Number(body.expectedVersion);
        const changes=body.changes&&typeof body.changes==='object'&&!Array.isArray(body.changes)?body.changes:{};
        if(!roadmapId||!nodeId||!Number.isInteger(expectedVersion)||expectedVersion<1){ fail(res,400,'bad_node_update'); return true; }
        const result=await Content.updateDraftNode(setId,roadmapId,nodeId,expectedVersion,current=>{
          const next={...current};
          if(typeof changes.title==='string'&&changes.title.trim()) next.title={...(next.title||{}),ru:changes.title.trim()};
          if(typeof changes.kind==='string') next.kind=changes.kind;
          if(Object.prototype.hasOwnProperty.call(changes,'dayIndex')){
            if(changes.dayIndex===null||changes.dayIndex==='') delete next.dayIndex;
            else next.dayIndex=Number(changes.dayIndex);
          }
          if(typeof changes.optional==='boolean') next.optional=changes.optional;
          if(Array.isArray(changes.prerequisites)) next.prerequisites=changes.prerequisites.map(Content.cleanId).filter(Boolean);
          return next;
        });
        send(res,200,{ok:true,node:result.node,version:result.version,draftRevision:result.draftRevision});
        return true;
      }

      if(action === 'content_node_delete'){
        const setId=requestedSetId(body);
        const roadmapId=Content.cleanId(body.roadmapId);
        const nodeId=Content.cleanId(body.nodeId);
        if(!roadmapId||!nodeId){ fail(res,400,'bad_node_id'); return true; }
        const result=await Content.deleteDraftNode(setId,roadmapId,nodeId);
        send(res,200,{ok:true,draftRevision:result.draftRevision});
        return true;
      }

      if(action === 'content_node_reorder'){
        const setId=requestedSetId(body);
        const roadmapId=Content.cleanId(body.roadmapId);
        const ids=Array.isArray(body.nodeIds)?body.nodeIds.map(Content.cleanId):[];
        if(!roadmapId||!ids.length||ids.some(id=>!id)){ fail(res,400,'bad_node_order'); return true; }
        const result=await Content.reorderDraftNodes(setId,roadmapId,ids);
        send(res,200,{ok:true,draftRevision:result.draftRevision});
        return true;
      }

      if(action === 'content_course_structure'){
        const setId=requestedSetId(body);
        const structure=await Content.getDraftStructure(setId);
        if(!structure){ fail(res,404,'draft_not_found'); return true; }
        send(res,200,{ok:true,
          draftRevision:structure.draftRevision,
          draftUpdatedAt:structure.draftUpdatedAt,
          set:{id:structure.meta.id,title:structure.meta.title,description:structure.meta.description,level:structure.meta.level,access:structure.meta.access},
          roadmaps:(structure.roadmaps||[]).map(roadmap=>({
            id:roadmap.id,
            title:roadmap.title,
            nodes:(roadmap.nodes||[]).map(node=>({
              id:node.id,kind:node.kind,title:node.title,dayIndex:node.dayIndex,order:node.order,
              optional:!!node.optional,prerequisites:node.prerequisites||[],activityCount:(node.activityIds||[]).length
            }))
          }))
        });
        return true;
      }

      if(action === 'content_course_node'){
        const setId=requestedSetId(body);
        const roadmapId=Content.cleanId(body.roadmapId);
        const nodeId=Content.cleanId(body.nodeId);
        if(!roadmapId || !nodeId){ fail(res,400,'bad_node_id'); return true; }
        const result=await Content.getDraftNode(setId,roadmapId,nodeId);
        if(!result){ fail(res,404,'node_not_found'); return true; }
        const byId=new Map((result.activities||[]).map(activity=>[activity.id,activity]));
        send(res,200,{ok:true,node:result.node,version:result.version,draftRevision:result.draftRevision,
          activities:(result.node.activityIds||[]).map(id=>activitySummary(byId.get(id))).filter(Boolean)
        });
        return true;
      }

      if(action === 'content_activity_get'){
        const setId=requestedSetId(body);
        const activityId=Content.cleanId(body.activityId);
        if(!activityId){ fail(res,400,'bad_activity_id'); return true; }
        const result=await Content.getDraftActivity(setId,activityId);
        if(!result){ fail(res,404,'activity_not_found'); return true; }
        send(res,200,{ok:true,activity:result.activity,draftRevision:result.draftRevision});
        return true;
      }

      if(action === 'content_activity_create'){
        const setId=requestedSetId(body);
        const roadmapId=Content.cleanId(body.roadmapId);
        const nodeId=Content.cleanId(body.nodeId);
        const type=String(body.type||'').trim();
        if(!roadmapId || !nodeId){ fail(res,400,'bad_node_id'); return true; }
        const activity=newActivity(type);
        const result=await Content.createDraftActivity(setId,roadmapId,nodeId,activity);
        send(res,200,{ok:true,activity:result.activity,node:result.node,draftRevision:result.draftRevision});
        return true;
      }

      if(action === 'content_activity_save'){
        const setId=requestedSetId(body);
        const activityId=Content.cleanId(body.activityId);
        const expectedRevision=Number(body.expectedRevision);
        const incoming=body.activity;
        if(!activityId || !Number.isInteger(expectedRevision) || expectedRevision<1 || !incoming || typeof incoming!=='object' || Array.isArray(incoming)){
          fail(res,400,'bad_activity_update');
          return true;
        }
        const result=await Content.updateDraftActivity(setId,activityId,expectedRevision,current=>{
          if(String(incoming.id||'')!==current.id) throw new Error('activity_id_immutable');
          if(String(incoming.type||'')!==current.type) throw new Error('activity_type_immutable');
          const next=JSON.parse(JSON.stringify(incoming));
          next.id=current.id;
          next.type=current.type;
          next.revision=current.revision;
          return next;
        });
        send(res,200,{ok:true,activity:result.activity,draftRevision:result.draftRevision});
        return true;
      }

      if(action === 'content_activity_detach'){
        const setId=requestedSetId(body);
        const roadmapId=Content.cleanId(body.roadmapId);
        const nodeId=Content.cleanId(body.nodeId);
        const activityId=Content.cleanId(body.activityId);
        if(!roadmapId || !nodeId || !activityId){ fail(res,400,'bad_activity_detach'); return true; }
        const result=await Content.detachDraftActivity(setId,roadmapId,nodeId,activityId);
        send(res,200,{ok:true,node:result.node,draftRevision:result.draftRevision});
        return true;
      }

      if(action === 'content_activity_reorder'){
        const setId=requestedSetId(body);
        const roadmapId=Content.cleanId(body.roadmapId);
        const nodeId=Content.cleanId(body.nodeId);
        const ids=Array.isArray(body.activityIds) ? body.activityIds.map(Content.cleanId) : [];
        if(!roadmapId || !nodeId || !ids.length || ids.some(id=>!id)){ fail(res,400,'bad_activity_order'); return true; }
        const result=await Content.reorderDraftActivities(setId,roadmapId,nodeId,ids);
        send(res,200,{ok:true,node:result.node,draftRevision:result.draftRevision});
        return true;
      }

      if(action === 'content_lexicon_ai_prompt'){
        const setId=requestedSetId(body);
        const limit=Math.max(1,Math.min(100,Math.round(Number(body.limit)||50)));
        const [course,lexicon,Coverage]=await Promise.all([
          Content.getDraft(setId),
          Lexicon.getDraft(),
          loadCoverage()
        ]);
        if(!course || !lexicon){ fail(res,404,'draft_not_found'); return true; }
        const audit=Coverage.auditLexicalCoverage(course,lexicon);
        const mode=body.mode==='enrich'?'enrich':'missing';
        const generated=BulkLexicon.buildAiPrompt(audit,limit,{mode,lexicon});
        send(res,200,{ok:true,setId,limit,mode,
          coverage:Coverage.compactCoverageReport(audit),
          targetCount:generated.targets.length,
          targets:generated.targets,
          prompt:generated.prompt,
          format:BulkLexicon.FORMAT
        });
        return true;
      }

      if(action === 'content_lexicon_patch_preview'){
        const setId=requestedSetId(body);
        const [course,lexicon,Coverage]=await Promise.all([
          Content.getDraft(setId),
          Lexicon.getDraft(),
          loadCoverage()
        ]);
        if(!course || !lexicon){ fail(res,404,'draft_not_found'); return true; }
        const preview=BulkLexicon.previewPatch(lexicon,body.patch ?? body.text);
        const before=Coverage.auditLexicalCoverage(course,lexicon);
        send(res,200,{ok:true,setId,format:BulkLexicon.FORMAT,
          summary:preview.summary,
          conflicts:preview.conflicts,
          warnings:preview.warnings,
          changes:preview.changes.map(change=>({
            id:change.id,
            kind:change.kind,
            expectedRevision:change.expectedRevision,
            lemma:change.entry.lemma,
            forms:(change.entry.forms||[]).map(form=>form.text),
            senses:(change.entry.senses||[]).map(sense=>({
              id:sense.id,
              partOfSpeech:sense.partOfSpeech||null,
              translations:sense.translations&&sense.translations.ru||[]
            })),
            examples:(change.entry.examples||[]).length
          })),
          coverage:Coverage.compactCoverageReport(before)
        });
        return true;
      }

      if(action === 'content_lexicon_patch_apply'){
        const setId=requestedSetId(body);
        const [course,lexicon,Coverage]=await Promise.all([
          Content.getDraft(setId),
          Lexicon.getDraft(),
          loadCoverage()
        ]);
        if(!course || !lexicon){ fail(res,404,'draft_not_found'); return true; }
        const preview=BulkLexicon.previewPatch(lexicon,body.patch ?? body.text);
        if(preview.conflicts.length){
          send(res,409,{ok:false,error:'lexicon_patch_conflicts',
            summary:preview.summary,conflicts:preview.conflicts,warnings:preview.warnings});
          return true;
        }
        if(!preview.changes.length){ fail(res,400,'lexicon_patch_no_changes'); return true; }

        const applied=await Lexicon.upsertDraftLexemes(preview.changes.map(change=>({
          id:change.id,
          expectedRevision:change.expectedRevision,
          entry:change.entry
        })));
        const nextLexicon=await Lexicon.getDraft();
        const audit=Coverage.auditLexicalCoverage(course,nextLexicon);
        send(res,200,{ok:true,setId,applied:applied.entries.length,draftRevision:applied.draftRevision,
          summary:preview.summary,warnings:preview.warnings,
          coverage:Coverage.compactCoverageReport(audit)
        });
        return true;
      }

      if(action === 'content_lexeme_get'){
        const id=String(body.lexemeId || '').trim();
        if(!id){ fail(res,400,'bad_lexeme_id'); return true; }
        const result=await Lexicon.getDraftLexeme(id);
        if(!result || !result.entry){ fail(res,404,'lexeme_not_found'); return true; }
        send(res,200,{ok:true,lexeme:result.entry,draftRevision:result.draftRevision});
        return true;
      }

      if(action === 'content_lexeme_save'){
        const id=String(body.lexemeId || '').trim();
        const expectedRevision=Number(body.expectedRevision);
        if(!id || !Number.isInteger(expectedRevision) || expectedRevision < 1){
          fail(res,400,'bad_lexeme_revision');
          return true;
        }
        const allowed=['lemma','forms','pronunciation','senses','examples','deprecated'];
        const changes=body.changes && typeof body.changes==='object' && !Array.isArray(body.changes) ? body.changes : {};
        const reviewed=body.reviewed===true;
        const updated=await Lexicon.updateDraftLexeme(id,current=>{
          for(const key of allowed){
            if(Object.prototype.hasOwnProperty.call(changes,key)) current[key]=changes[key];
          }
          if(reviewed){
            current.senses=(current.senses || []).map(sense=>({
              ...sense,
              tags:(sense.tags || []).filter(tag=>tag!=='needs-review')
            }));
          }
          return current;
        },expectedRevision);
        send(res,200,{ok:true,lexeme:updated,reviewed,remainingReview:reviewItems(await Lexicon.getDraft()).length});
        return true;
      }

      if(action === 'content_publish'){
        const requested=Array.isArray(body.setIds) ? body.setIds.map(Content.cleanId).filter(Boolean) : ['general-foundation'];
        const setIds=[...new Set(requested)];
        const lexiconDraft=await Lexicon.getDraft();
        if(!setIds.length || !lexiconDraft){ fail(res,409,'drafts_required'); return true; }
        const Coverage=await loadCoverage();
        const lexicalReadiness={};
        for(const setId of setIds){
          const draft=await Content.getDraft(setId);
          if(!draft){ fail(res,409,'course_draft_not_found:'+setId); return true; }
          Content.validateSet(draft);
          const audit=Coverage.auditLexicalCoverage(draft,lexiconDraft);
          lexicalReadiness[setId]=Coverage.compactCoverageReport(audit);
        }
        Lexicon.validateLexicon(lexiconDraft);

        const blocked=Object.entries(lexicalReadiness).filter(([,coverage])=>
          Number(coverage.missingSurfaces||0)>0 || Number(coverage.ambiguousSurfaces||0)>0);
        if(blocked.length){
          send(res,409,{ok:false,error:'lexical_coverage_incomplete',sets:Object.fromEntries(blocked)});
          return true;
        }

        const published=await Release.publishDraftRelease(setIds);
        const lexicon=await Release.getReleasedLexicon();
        const courses={};
        for(const setId of setIds){
          const course=await Release.getReleasedSet(setId);
          courses[setId]={revision:course&&course.revision,publishedAt:course&&course.publishedAt};
        }
        const first=courses[setIds[0]];
        send(res,200,{ok:true,release:published.release,courses,course:first,
          lexicon:{revision:lexicon&&lexicon.revision,publishedAt:lexicon&&lexicon.publishedAt},
          needsReview:reviewItems(lexicon).length
        });
        return true;
      }

      fail(res,400,'unknown_content_action');
      return true;
    }catch(error){
      fail(res,400,String((error && error.message) || 'content_admin_error').slice(0,180));
      return true;
    }
  };
}

module.exports = { createContentAdminHandler, reviewItems, courseStats, lexiconStats, LEGACY_SHA, LEGACY_URL };
