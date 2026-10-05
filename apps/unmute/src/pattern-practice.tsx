import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { Activity } from './content/schema';
import type { CourseProgressDocument } from './progress';
import type { PracticeSrsKind } from './engine/practice-srs';
import type { SpeakText, StartRecognition } from './speech-runtime';
import { startRecognition as startSpeechRecognition } from './speech-runtime';
import { PatternDrillView } from './pattern-drill';
import { PatternListeningView } from './pattern-listening';
import { PatternSpeakingView } from './pattern-speaking';
import { LexiconText } from './lexicon-ui';
import { ExerciseKind } from './exercise-kind';
import { practiceRunStateKey, readPracticeRunState, writePracticeRunState } from './practice-run-state';

type PatternActivity=Extract<Activity,{type:'pattern-drill'}>;
type PatternMode=PracticeSrsKind|'complete';

interface PatternPracticeSession {
  version:1;
  activityRevision:number;
  mode:PatternMode;
  single:boolean;
  briefed:PracticeSrsKind[];
}

function restoredPatternSession(activity:PatternActivity,key:string|undefined):PatternPracticeSession|null{
  const saved=readPracticeRunState<PatternPracticeSession>(practiceRunStateKey(key,'meta'));
  if(!saved||saved.version!==1||saved.activityRevision!==activity.revision)return null;
  if(saved.mode!=='complete'&&!activity.modes.includes(saved.mode))return null;
  return {
    ...saved,
    briefed:saved.briefed.filter(mode=>activity.modes.includes(mode))
  };
}

export function firstPatternMode(
  activity:PatternActivity,
  progress:CourseProgressDocument
):PatternMode{
  for(const mode of activity.modes){
    const state=progress.practice[mode][activity.id];
    if(!state||state.deleted||state.box<=0)return mode;
  }
  return 'complete';
}

export interface PatternPracticeViewProps {
  activity:PatternActivity;
  courseActivities:Activity[];
  progress:CourseProgressDocument;
  setId:string;
  onDone:()=>void;
  savePractice:(
    setId:string,
    activityId:string,
    mode:PracticeSrsKind,
    correct:boolean,
    score?:number
  )=>Promise<void>;
  speak:SpeakText;
  startRecognition?:StartRecognition;
  /** Open a specific training (e.g. «Скажи вслух» on «Сегодня» → speaking). */
  initialMode?:PracticeSrsKind;
  /** The lesson can render one shared navigator instead of a second local mode bar. */
  showModeNav?:boolean;
  /** Keep the lesson-level navigator in sync with automatic/manual mode changes. */
  onModeChange?:(mode:PracticeSrsKind)=>void;
  /** Report phrase-level progress to the lesson header. */
  onProgress?:(current:number,total:number)=>void;
  /** Keep the mounted session paused while another lesson section is visible. */
  active?:boolean;
  /** Durable key for an unfinished lesson run. Omit outside the lesson. */
  sessionKey?:string;
}

export function PatternPracticeView({
  activity,
  courseActivities,
  progress,
  setId,
  onDone,
  savePractice,
  speak,
  startRecognition=startSpeechRecognition,
  initialMode,
  showModeNav=true,
  onModeChange,
  onProgress,
  active=true,
  sessionKey
}:PatternPracticeViewProps){
  const {t,locale}=useI18n();
  const restored=restoredPatternSession(activity,sessionKey);
  const [mode,setMode]=useState<PatternMode>(()=>
    restored?.mode??(initialMode&&activity.modes.includes(initialMode) ? initialMode : firstPatternMode(activity,progress))
  );
  // A training picked by hand from the finished state returns there, not to the next one.
  const [single,setSingle]=useState(()=>restored?.single??Boolean(initialMode));
  // Each training starts with «what to do and how»; its timer or microphone waits for «Начать».
  const [briefed,setBriefed]=useState<ReadonlySet<PracticeSrsKind>>(()=>new Set(restored?.briefed??[]));

  useEffect(()=>{
    writePracticeRunState(practiceRunStateKey(sessionKey,'meta'),{
      version:1,
      activityRevision:activity.revision,
      mode,
      single,
      briefed:[...briefed]
    } satisfies PatternPracticeSession);
  },[activity.revision,briefed,mode,sessionKey,single]);

  useEffect(()=>{
    if(!active||mode==='complete')return;
    // When parent just requested another tab, do not immediately report the stale local mode
    // back to the parent. That feedback loop made tabs bounce at high speed.
    if(initialMode&&activity.modes.includes(initialMode)&&mode!==initialMode)return;
    onModeChange?.(mode);
  },[active,activity.modes,initialMode,mode,onModeChange]);

  useEffect(()=>{
    if(!active||mode==='complete'||!onProgress||briefed.has(mode))return;
    // The briefing is not the first phrase. Keep lesson progress at 0/N until «Начать».
    // Once the mode starts, the mounted child reports the real 1/N…N/N phrase position.
    onProgress(0,activity.items.length);
  },[active,activity.items.length,briefed,mode,onProgress]);

  // The lesson-level tabs can change initialMode while this component keeps the same key.
  // Mirror that prop into local state instead of getting stuck in the previously mounted mode.
  useEffect(()=>{
    if(!initialMode||!activity.modes.includes(initialMode)||mode===initialMode)return;
    setSingle(true);
    setMode(initialMode);
  },[activity.modes,initialMode,mode]);

  const distractors=useMemo(
    ()=>courseActivities.flatMap(candidate=>
      candidate.type==='pattern-drill'
        ? candidate.items.map(item=>item.prompt)
        : []
    ),
    [courseActivities]
  );

  const nextMode=(current:PracticeSrsKind)=>{
    if(single){
      setSingle(false);
      setMode('complete');
      return;
    }
    const index=activity.modes.indexOf(current);
    const next=activity.modes[index+1];
    if(next){
      setMode(next);
      return;
    }
    onDone();
  };

  const modeLabel:Record<PracticeSrsKind,string>={
    drill:t('kind.drill'),
    listening:t('kind.listening'),
    speaking:t('kind.speaking')
  };
  const modeNav=showModeNav?(
    <div className="practice-mode-nav" role="navigation" aria-label={t('practice.modeNav')}>
      {activity.modes.map(item=>(
        <button
          key={item}
          className={'chip-button pressable'+(mode===item?' is-active':'')}
          type="button"
          aria-current={mode===item?'page':undefined}
          onClick={()=>{
            if(mode===item)return;
            setSingle(true);
            setMode(item);
          }}
        >
          {modeLabel[item]}
        </button>
      ))}
    </div>
  ):null;

  const pattern=activity.pattern[locale]||activity.pattern.ru||activity.pattern.en||Object.values(activity.pattern)[0]||'';
  const introMode=mode!=='complete'&&!briefed.has(mode)?mode:null;
  const drillSessionKey=practiceRunStateKey(sessionKey,'drill');
  const listeningSessionKey=practiceRunStateKey(sessionKey,'listening');
  const speakingSessionKey=practiceRunStateKey(sessionKey,'speaking');

  return (
    <>
      {modeNav}

      {introMode&&(
        <article className="learn-card practice-intro">
          <ExerciseKind kind={introMode} />
          <h3><LexiconText text={pattern} refs={activity.lexiconRefs} /></h3>
          <p className="practice-intro-text">{t('practice.intro.'+introMode,{count:activity.items.length})}</p>
          <ul className="practice-steps">
            {[1,2,3].map(step=>{
              const total=activity.items.length;
              const needed=Math.max(1,Math.ceil(total*0.7));
              return <li key={step}>{t('practice.step.'+introMode+'.'+step,{count:total,needed})}</li>;
            })}
          </ul>
          <div className="runner-action">
            <button className="primary-button" type="button" onClick={()=>setBriefed(previous=>new Set(previous).add(introMode))}>
              {t('practice.start')}
            </button>
          </div>
        </article>
      )}

      {activity.modes.includes('drill')&&briefed.has('drill')&&(
        <div hidden={mode!=='drill'}>
          <PatternDrillView
            activity={activity}
            setId={setId}
            savePractice={savePractice}
            onDone={()=>nextMode('drill')}
            active={active&&mode==='drill'}
            {...(drillSessionKey?{sessionKey:drillSessionKey}:{})}
            {...(onProgress?{onProgress}:{})}
          />
        </div>
      )}

      {activity.modes.includes('listening')&&briefed.has('listening')&&(
        <div hidden={mode!=='listening'}>
          <PatternListeningView
            activity={activity}
            setId={setId}
            distractors={distractors}
            savePractice={savePractice}
            speak={speak}
            onDone={()=>nextMode('listening')}
            active={active&&mode==='listening'}
            {...(listeningSessionKey?{sessionKey:listeningSessionKey}:{})}
            {...(onProgress?{onProgress}:{})}
          />
        </div>
      )}

      {activity.modes.includes('speaking')&&briefed.has('speaking')&&(
        <div hidden={mode!=='speaking'}>
          <PatternSpeakingView
            activity={activity}
            setId={setId}
            savePractice={savePractice}
            speak={speak}
            startRecognition={startRecognition}
            onDone={()=>nextMode('speaking')}
            active={active&&mode==='speaking'}
            {...(speakingSessionKey?{sessionKey:speakingSessionKey}:{})}
            {...(onProgress?{onProgress}:{})}
          />
        </div>
      )}

      {mode==='complete'&&(
        <article className="learn-card">
          <div className="eyebrow">{t('pattern.completeMode')}</div>
          <h3><LexiconText text={pattern} refs={activity.lexiconRefs} /></h3>
          <p className="learn-hint">{t('pattern.completeText')}</p>
          <div className="runner-action">
            <button className="primary-button" type="button" onClick={onDone}>
              {t('learn.next')}
            </button>
          </div>
        </article>
      )}
    </>
  );
}
