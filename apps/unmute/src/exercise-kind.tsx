import { useI18n } from '@appbase/ui-react/i18n.js';
import { Icon, type IconName } from './icons';

/* Every kind of exercise looks different at first glance: its own colour, icon and a short
   «what to do» label on top of the card. */

export type ExerciseKindName = 'choice' | 'write' | 'chips' | 'drill' | 'listening' | 'speaking' | 'dialogue' | 'ai' | 'review';

const ICON: Record<ExerciseKindName, IconName> = {
  choice:'check', write:'pencil', chips:'pencil', drill:'flame', listening:'speaker', speaking:'mic', dialogue:'chat', ai:'sparkle', review:'review'
};

export function ExerciseKind({kind}: {kind: ExerciseKindName}){
  const {t} = useI18n();
  return (
    <div className={'exercise-kind kind-' + kind}>
      <span className="exercise-kind-icon" aria-hidden="true"><Icon name={ICON[kind]} size={16} /></span>
      {t('kind.' + kind)}
    </div>
  );
}
