import type { CSSProperties } from 'react';

/* Screen-level loading: the UnMute sound wave with one short line («Загружаем маршрут»).
   The same wave greets the learner on the first screen; reduced motion freezes it. */
export function Loader({title, className = ''}: {title: string; className?: string}){
  return (
    <div className={'screen-loader ' + className} role="status">
      <div className="voice-wave voice-wave-small" aria-hidden="true">
        {Array.from({length:9}, (_, bar) => <span key={bar} style={{'--bar':bar} as CSSProperties} />)}
      </div>
      <strong>{title}</strong>
    </div>
  );
}
