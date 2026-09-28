'use strict';

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

function reviewItems(lexicon){
  if(!lexicon || !Array.isArray(lexicon.entries)) return [];
  const out = [];
  for(const entry of lexicon.entries){
    const senses = Array.isArray(entry && entry.senses) ? entry.senses : [];
    const flagged = senses.filter(sense => Array.isArray(sense && sense.tags) && sense.tags.includes('needs-review'));
    if(!flagged.length) continue;
    out.push({
      lexemeId:String(entry.id || ''),
      lemma:String(entry.lemma || ''),
      pronunciation:entry.pronunciation || null,
      senses:flagged.map(sense => ({
        senseId:String(sense.id || ''),
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
