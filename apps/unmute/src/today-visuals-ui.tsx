import type { CSSProperties } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { DayProgress, DayProgressSectionId } from './day-progress';
import type { MemoryModel, WaveBar } from './today-visuals';

const SECTION_KEY:Record<DayProgressSectionId,string>={
  tasks:'learn.summaryTasks',
  drill:'learn.summaryDrill',
  listening:'learn.summaryListening',
  speaking:'learn.summarySpeaking',
  manual:'today.dayProgress'
};

/** The day as a voice wave: one bar per required step, coloured by section as it is done. */
export function DayWave({
  bars,
  progress,
  celebrate=false,
  onSection
}:{
  bars:WaveBar[];
  progress:DayProgress;
  celebrate?:boolean;
  onSection?:(section:DayProgressSectionId)=>void;
}){
  const {t}=useI18n();
  if(!bars.length)return null;
  const sections=progress.sections.filter(section=>section.totalSteps>0&&section.id!=='manual');
  return (
    <div className={'day-wave'+(celebrate?' is-celebrate':'')}>
      <div
        className="day-wave-bars"
        role="progressbar"
        aria-label={t('today.dayProgress')}
        aria-valuemin={0}
        aria-valuemax={Math.max(1,progress.totalSteps)}
        aria-valuenow={progress.completedSteps}
      >
        {bars.map((bar,index)=>(
          <span
            key={index}
            className={'wave-bar is-'+bar.section+' is-'+bar.state}
            style={{'--h':bar.height,'--b':index} as CSSProperties}
            aria-hidden="true"
          />
        ))}
      </div>
      {sections.length>1&&(
        <div className="day-wave-legend">
          {sections.map(section=>{
            const label=t(SECTION_KEY[section.id]);
            const content=(
              <>
                <span className={'legend-dot is-'+section.id} aria-hidden="true" />
                <span className="legend-label">{label}</span>
                <span className="legend-count">{section.completedSteps}/{section.totalSteps}</span>
              </>
            );
            const className='legend-item'+(section.status==='complete'?' is-complete':'');
            return onSection
              ? <button key={section.id} type="button" className={className+' pressable'} onClick={()=>onSection(section.id)}
                  aria-label={t('today.waveOpen',{section:label,done:section.completedSteps,total:section.totalSteps})}>{content}</button>
              : <span key={section.id} className={className}>{content}</span>;
          })}
        </div>
      )}
    </div>
  );
}

/** Seven bars, today last: height = how much was done that day. */
export function WeekEqualizer({levels,labels,label}:{levels:number[];labels:string[];label:string}){
  return (
    <div className="week-eq" role="img" aria-label={label}>
      {levels.map((level,index)=>(
        <span key={index} className={'week-eq-day'+(level>0?' is-active':'')+(index===levels.length-1?' is-today':'')}>
          <span className="week-eq-track">
            <span className="week-eq-bar" style={{'--h':Math.max(.1,level),'--b':index} as CSSProperties} />
          </span>
          <span className="week-eq-label">{labels[index]}</span>
        </span>
      ))}
    </div>
  );
}

/** What the learner has met, as a constellation: fresh in the core, strong on the outer orbit. */
export function MemoryConstellation({model}:{model:MemoryModel}){
  const {t}=useI18n();
  return (
    <div className="memory">
      <svg className="memory-sky" viewBox="0 0 120 120" role="img"
        aria-label={t('today.memoryAria',{total:model.total,strong:model.strong,due:model.due})}>
        <defs>
          <radialGradient id="memory-core">
            <stop offset="0" stopColor="var(--accent)" stopOpacity=".28" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="60" cy="60" r="24" fill="url(#memory-core)" />
        <circle className="memory-orbit" cx="60" cy="60" r="32.5" />
        <circle className="memory-orbit" cx="60" cy="60" r="50" />
        <g className="memory-dots">
          {model.dots.map((dot,index)=>(
            <circle
              key={dot.key}
              className={'memory-dot is-'+dot.ring+(dot.due?' is-due':'')}
              cx={dot.x.toFixed(2)}
              cy={dot.y.toFixed(2)}
              r={dot.ring==='strong'?3.4:dot.ring==='growing'?3:2.7}
              style={{'--b':index} as CSSProperties}
            />
          ))}
        </g>
      </svg>
      <div className="memory-copy">
        <span className="tile-kicker tone-accent">{t('today.memoryTitle')}</span>
        <strong className="memory-total">{model.total}</strong>
        <span className="memory-caption">{t('today.memoryCaption')}</span>
        <ul className="memory-legend">
          <li><span className="legend-dot is-strong" aria-hidden="true" />{t('today.memoryStrong',{count:model.strong})}</li>
          <li><span className="legend-dot is-growing" aria-hidden="true" />{t('today.memoryGrowing',{count:model.growing})}</li>
          <li><span className="legend-dot is-fresh" aria-hidden="true" />{t('today.memoryFresh',{count:model.fresh})}</li>
        </ul>
      </div>
    </div>
  );
}
