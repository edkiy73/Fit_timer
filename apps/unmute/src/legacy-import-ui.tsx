import { useRef, useState, type ChangeEvent } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { useOptionalAuth } from '@appbase/ui-react/auth.js';
import { authClient } from './auth';
import { useLearnerCourseRuntime } from './course-runtime';
import { useLexiconRuntime } from './lexicon-ui';
import {
  importLegacyProgress,
  legacyDueDayShiftForKey,
  type LegacyProgressImportResult
} from './legacy-progress-import';
import { applyLegacyProgressImport, syncNow } from './sync';

type ImportState=
  |{kind:'idle'}
  |{kind:'running'}
  |{kind:'success';report:LegacyProgressImportResult['report']}
  |{kind:'error';message:string};

const LEGACY_FIELDS=['srs','pat','voc','lis','err','words','dia','ai','rest','speed'] as const;

export function parseLegacyProgressFile(text:string):{
  raw:unknown;
  dueDayShift:number;
}{
  let raw:unknown;
  try{raw=JSON.parse(text);}catch{throw new Error('bad_json');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('bad_file');
  const record=raw as Record<string,unknown>;
  if(record.app!==undefined&&record.app!=='english-trainer')throw new Error('wrong_app');
  const state=record.state&&typeof record.state==='object'&&!Array.isArray(record.state)
    ? record.state as Record<string,unknown>
    : record;
  if(!LEGACY_FIELDS.some(key=>state[key]&&typeof state[key]==='object')){
    throw new Error('no_progress');
  }
  const saved=typeof record.saved==='string'?record.saved:'';
  return {
    raw,
    dueDayShift:saved?legacyDueDayShiftForKey(saved):0
  };
}

function errorKey(error:unknown):
  |'legacyImport.errorBadJson'
  |'legacyImport.errorWrongApp'
  |'legacyImport.errorNoProgress'
  |'legacyImport.errorGeneric'{
  const message=error instanceof Error?error.message:'';
  if(message==='bad_json')return 'legacyImport.errorBadJson';
  if(message==='wrong_app')return 'legacyImport.errorWrongApp';
  if(message==='bad_file'||message==='no_progress')return 'legacyImport.errorNoProgress';
  return 'legacyImport.errorGeneric';
}

export function LegacyProgressImportPanel(){
  const {t}=useI18n();
  const auth=useOptionalAuth();
  const course=useLearnerCourseRuntime();
  const lexicon=useLexiconRuntime();
  const inputRef=useRef<HTMLInputElement|null>(null);
  const [state,setState]=useState<ImportState>({kind:'idle'});

  const ready=course.status==='ready'&&Boolean(course.state)&&lexicon.status==='ready'&&Boolean(lexicon.lexicon);

  const handleFile=async(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0]??null;
    event.target.value='';
    if(!file||!ready||!course.state||!lexicon.lexicon)return;
    setState({kind:'running'});
    try{
      const parsed=parseLegacyProgressFile(await file.text());
      const deviceId=await authClient.getOrCreateDeviceId();
      const imported=importLegacyProgress(
        parsed.raw,
        course.state.set,
        lexicon.lexicon,
        {
          dueDayShift:parsed.dueDayShift,
          deviceId
        }
      );
      await applyLegacyProgressImport(course.state.set.id,imported);
      await course.refresh();
      if(auth.session)await syncNow();
      setState({kind:'success',report:imported.report});
    }catch(error){
      setState({kind:'error',message:t(errorKey(error))});
    }
  };

  return (
    <section className="legacy-import">
      <div>
        <div className="eyebrow">{t('legacyImport.eyebrow')}</div>
        <h3>{t('legacyImport.title')}</h3>
        <p className="muted">{t('legacyImport.text')}</p>
      </div>

      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="application/json,.json"
        aria-label={t('legacyImport.fileLabel')}
        onChange={event=>void handleFile(event)}
      />

      <button
        className="secondary-button"
        type="button"
        disabled={!ready||state.kind==='running'}
        onClick={()=>inputRef.current?.click()}
      >
        {state.kind==='running'?t('legacyImport.importing'):t('legacyImport.choose')}
      </button>

      {!ready&&(
        <p className="muted" role="status">
          {course.status==='error'||lexicon.status==='error'
            ? t('legacyImport.dataError')
            : t('legacyImport.loading')}
        </p>
      )}

      {state.kind==='error'&&(
        <div className="legacy-import-error" role="alert">{state.message}</div>
      )}

      {state.kind==='success'&&(
        <div className="legacy-import-report" role="status">
          <strong>{t('legacyImport.done')}</strong>
          <div className="legacy-import-stats">
            <span>{t('legacyImport.cards',{count:state.report.cards})}</span>
            <span>{t('legacyImport.practice',{count:state.report.practice})}</span>
            <span>{t('legacyImport.words',{count:state.report.words})}</span>
            <span>{t('legacyImport.answers',{count:state.report.importedAttempts})}</span>
          </div>
          {state.report.unresolved.length>0&&(
            <span>{t('legacyImport.unresolved',{count:state.report.unresolved.length})}</span>
          )}
          <small>{t('legacyImport.mergeNote')}</small>
        </div>
      )}
    </section>
  );
}
