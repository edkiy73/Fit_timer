import type { CSSProperties } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { DayProgress, DayProgressSectionId } from './day-progress';
import { COURSE_MOSAIC_COLUMNS, courseRows, type CourseCell, type WaveBar } from './today-visuals';

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

/** The course as a mosaic of days, ten per row: the day on screen glows. */
export function CourseMosaic({cells,caption}:{cells:CourseCell[];caption:string}){
  const rows=courseRows(cells.length);
  return (
    <div className="course-mosaic">
      <div
        className={'course-mosaic-grid'+(rows>4?' is-dense':'')}
        style={{'--cols':COURSE_MOSAIC_COLUMNS,'--rows':rows} as CSSProperties}
        aria-hidden="true"
      >
        {cells.map((cell,index)=>(
          <span key={cell.id} className={'course-cell is-'+cell.state} style={{'--b':index} as CSSProperties} />
        ))}
      </div>
      <span className="course-mosaic-caption">{caption}</span>
    </div>
  );
}
