'use strict';

const crypto = require('crypto');
const { send, fail } = require('../../../packages/core/server/util');
const Content = require('./content-store');
const Lexicon = require('./lexicon-store');
const Release = require('./content-release');

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

      if(action === 'content_course_structure'){
        const structure=await Content.getDraftStructure('general-foundation');
        if(!structure){ fail(res,404,'draft_not_found'); return true; }
        send(res,200,{ok:true,
          draftRevision:structure.draftRevision,
          draftUpdatedAt:structure.draftUpdatedAt,
          set:{id:structure.meta.id,title:structure.meta.title,level:structure.meta.level,access:structure.meta.access},
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
        const roadmapId=Content.cleanId(body.roadmapId);
        const nodeId=Content.cleanId(body.nodeId);
        if(!roadmapId || !nodeId){ fail(res,400,'bad_node_id'); return true; }
        const result=await Content.getDraftNode('general-foundation',roadmapId,nodeId);
        if(!result){ fail(res,404,'node_not_found'); return true; }
        const byId=new Map((result.activities||[]).map(activity=>[activity.id,activity]));
        send(res,200,{ok:true,node:result.node,version:result.version,draftRevision:result.draftRevision,
          activities:(result.node.activityIds||[]).map(id=>activitySummary(byId.get(id))).filter(Boolean)
        });
        return true;
      }

      if(action === 'content_activity_get'){
        const activityId=Content.cleanId(body.activityId);
        if(!activityId){ fail(res,400,'bad_activity_id'); return true; }
        const result=await Content.getDraftActivity('general-foundation',activityId);
        if(!result){ fail(res,404,'activity_not_found'); return true; }
        send(res,200,{ok:true,activity:result.activity,draftRevision:result.draftRevision});
        return true;
      }

      if(action === 'content_activity_create'){
        const roadmapId=Content.cleanId(body.roadmapId);
        const nodeId=Content.cleanId(body.nodeId);
        const type=String(body.type||'').trim();
        if(!roadmapId || !nodeId){ fail(res,400,'bad_node_id'); return true; }
        const activity=newActivity(type);
        const result=await Content.createDraftActivity('general-foundation',roadmapId,nodeId,activity);
        send(res,200,{ok:true,activity:result.activity,node:result.node,draftRevision:result.draftRevision});
        return true;
      }

      if(action === 'content_activity_save'){
        const activityId=Content.cleanId(body.activityId);
        const expectedRevision=Number(body.expectedRevision);
        const incoming=body.activity;
        if(!activityId || !Number.isInteger(expectedRevision) || expectedRevision<1 || !incoming || typeof incoming!=='object' || Array.isArray(incoming)){
          fail(res,400,'bad_activity_update');
          return true;
        }
        const result=await Content.updateDraftActivity('general-foundation',activityId,expectedRevision,current=>{
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
        const roadmapId=Content.cleanId(body.roadmapId);
        const nodeId=Content.cleanId(body.nodeId);
        const activityId=Content.cleanId(body.activityId);
        if(!roadmapId || !nodeId || !activityId){ fail(res,400,'bad_activity_detach'); return true; }
        const result=await Content.detachDraftActivity('general-foundation',roadmapId,nodeId,activityId);
        send(res,200,{ok:true,node:result.node,draftRevision:result.draftRevision});
        return true;
      }

      if(action === 'content_activity_reorder'){
        const roadmapId=Content.cleanId(body.roadmapId);
        const nodeId=Content.cleanId(body.nodeId);
        const ids=Array.isArray(body.activityIds) ? body.activityIds.map(Content.cleanId) : [];
        if(!roadmapId || !nodeId || !ids.length || ids.some(id=>!id)){ fail(res,400,'bad_activity_order'); return true; }
        const result=await Content.reorderDraftActivities('general-foundation',roadmapId,nodeId,ids);
        send(res,200,{ok:true,node:result.node,draftRevision:result.draftRevision});
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
        const courseDraft = await Content.getDraft('general-foundation');
        const lexiconDraft = await Lexicon.getDraft();
        if(!courseDraft || !lexiconDraft){ fail(res,409,'drafts_required'); return true; }

        Content.validateSet(courseDraft);
        Lexicon.validateLexicon(lexiconDraft);

        const published = await Release.publishDraftRelease(['general-foundation']);
        const course = await Release.getReleasedSet('general-foundation');
        const lexicon = await Release.getReleasedLexicon();
        send(res,200,{ok:true,release:published.release,
          course:{revision:course && course.revision,publishedAt:course && course.publishedAt},
          lexicon:{revision:lexicon && lexicon.revision,publishedAt:lexicon && lexicon.publishedAt},
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
