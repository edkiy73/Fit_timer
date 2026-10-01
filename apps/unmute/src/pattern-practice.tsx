import { useMemo, useState } from 'react';
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

type PatternActivity=Extract<Activity,{type:'pattern-drill'}>;
type PatternMode=PracticeSrsKind|'complete';

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
  initialMode
}:PatternPracticeViewProps){
  const {t,locale}=useI18n();
  const [mode,setMode]=useState<PatternMode>(()=>
    initialMode&&activity.modes.includes(initialMode) ? initialMode : firstPatternMode(activity,progress)
  );
  // A training picked by hand from the finished state returns there, not to the next one.
  const [single,setSingle]=useState(Boolean(initialMode));
  // Each training starts with «what to do and how»; its timer or microphone waits for «Начать».
  const [briefed,setBriefed]=useState<ReadonlySet<PracticeSrsKind>>(()=>new Set());

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

  if(mode!=='complete'&&!briefed.has(mode)){
    const pattern=activity.pattern[locale]||activity.pattern.ru||activity.pattern.en||Object.values(activity.pattern)[0]||'';
    return (
      <article className="learn-card practice-intro">
        <ExerciseKind kind={mode} />
        <h3><LexiconText text={pattern} refs={activity.lexiconRefs} /></h3>
        <p className="practice-intro-text">{t('practice.intro.'+mode,{count:activity.items.length})}</p>
        <ul className="practice-steps">
          {[1,2,3].map(step=><li key={step}>{t('practice.step.'+mode+'.'+step)}</li>)}
        </ul>
        <div className="runner-action">
          <button className="primary-button" type="button" onClick={()=>setBriefed(previous=>new Set(previous).add(mode))}>
            {t('practice.start')}
          </button>
        </div>
      </article>
    );
  }

  if(mode==='drill'){
    return (
      <PatternDrillView
        activity={activity}
        setId={setId}
        savePractice={savePractice}
        onDone={()=>nextMode('drill')}
      />
    );
  }

  if(mode==='listening'){
    return (
      <PatternListeningView
        activity={activity}
        setId={setId}
        distractors={distractors}
        savePractice={savePractice}
        speak={speak}
        onDone={()=>nextMode('listening')}
      />
    );
  }

  if(mode==='speaking'){
    return (
      <PatternSpeakingView
        activity={activity}
        setId={setId}
        savePractice={savePractice}
        speak={speak}
        startRecognition={startRecognition}
        onDone={()=>nextMode('speaking')}
      />
    );
  }

  const modeLabel:Record<PracticeSrsKind,string>={
    drill:t('pattern.redoDrill'),
    listening:t('pattern.redoListening'),
    speaking:t('pattern.redoSpeaking')
  };
  return (
    <article className="learn-card">
      <div className="eyebrow">{t('pattern.completeMode')}</div>
      <h3><LexiconText text={activity.pattern[locale]||activity.pattern.ru||activity.pattern.en||Object.values(activity.pattern)[0]||''} refs={activity.lexiconRefs} /></h3>
      <p className="learn-hint">{t('pattern.completeText')}</p>
      <button className="primary-button" type="button" onClick={onDone}>
        {t('learn.next')}
      </button>
      {activity.modes.map(item=>(
        <button key={item} className="secondary-button" type="button" onClick={()=>{ setSingle(true); setMode(item); }}>
          {modeLabel[item]}
        </button>
      ))}
    </article>
  );
}
