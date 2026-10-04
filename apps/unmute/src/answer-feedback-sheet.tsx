import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';

export type AnswerFeedbackTone = 'correct' | 'wrong' | 'near';

export function AnswerFeedbackSheet({
  tone,
  title,
  subtitle,
  children,
  actions,
  headClassName=''
}:{
  tone:AnswerFeedbackTone;
  title:ReactNode;
  subtitle?:ReactNode;
  children?:ReactNode;
  actions?:ReactNode;
  headClassName?:string;
}){
  const icon=tone==='wrong'?'close':'check';
  const toneClass=tone==='near'?'learn-feedback-near':tone==='correct'?'learn-feedback-ok':'learn-feedback-wrong';
  const headClass='learn-feedback-head'+(headClassName?' '+headClassName:'');
  return createPortal(
    <div className="lesson-feedback-overlay" role="presentation">
      <div className={'learn-feedback is-sheet '+toneClass} role="status">
        <div className={headClass}>
          <span className="learn-feedback-icon" aria-hidden="true"><Icon name={icon} size={22} /></span>
          <div className="learn-feedback-head-copy">
            <strong>{title}</strong>
            {subtitle}
          </div>
        </div>
        {children}
        {actions&&<div className="learn-feedback-actions">{actions}</div>}
      </div>
    </div>,
    document.body
  );
}
