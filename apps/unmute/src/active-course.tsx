import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOptionalAuth } from '@appbase/ui-react/auth.js';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { loadCatalog, type ContentCatalogSet } from './content/client';
import type { CourseSet } from './content/schema';
import { appDocs, SETTINGS_DOC } from './sync';
import { patchSettings, readSettings } from './settings';
import { DEFAULT_COURSE_ID } from './settings-data';
import { resolveCourseEntitlement } from './entitlements';
import { localizedText } from './today-model';
import { Sheet } from './sheet';
import { Icon } from './icons';

/** Same key as the onboarding gate: one cached copy of the settings document. */
export const SETTINGS_QUERY_KEY = ['unmute-settings'] as const;
const CATALOG_QUERY_KEY = ['unmute-catalog'] as const;

export function useSettingsQuery(){
  const queryClient = useQueryClient();
  const query = useQuery({queryKey:SETTINGS_QUERY_KEY, queryFn:readSettings, staleTime:Infinity});
  useEffect(() => appDocs.subscribe(change => {
    if(change.keys.some(ref => ref.key === SETTINGS_DOC)) void queryClient.invalidateQueries({queryKey:SETTINGS_QUERY_KEY, exact:true});
  }), [queryClient]);
  return query;
}

export function useCatalog(){
  return useQuery({queryKey:CATALOG_QUERY_KEY, queryFn:loadCatalog, staleTime:5 * 60_000});
}

/** The course the app shows now. Empty while settings load (course queries wait);
 *  falls back to the main course when the chosen one is no longer published. */
export function useActiveCourseId(): string {
  const settings = useSettingsQuery();
  const catalog = useCatalog();
  if(settings.isPending) return '';
  const chosen = settings.data?.activeCourse?.id || DEFAULT_COURSE_ID;
  const sets = catalog.data?.sets;
  if(sets && sets.length && !sets.some(set => set.id === chosen)) return DEFAULT_COURSE_ID;
  return chosen;
}

export async function chooseCourse(id: string): Promise<void> {
  await patchSettings({activeCourse:{id, changedAt:new Date().toISOString()}});
}

function levelLabel(level: Record<string, unknown>): string {
  const from = typeof level.from === 'string' ? level.from.toUpperCase() : '';
  const to = typeof level.to === 'string' ? level.to.toUpperCase() : '';
  if(from && to && from !== to) return from + '–' + to;
  return from || to;
}

function accessKey(entry: ContentCatalogSet, owned: boolean): {key: string; days?: number} {
  const access = entry.access as {mode?: string; freePreview?: {days?: number}} | null;
  if(!access || access.mode === 'free') return {key:'courses.free'};
  if(owned) return {key:'courses.open'};
  const days = Number(access.freePreview?.days) || 0;
  return days > 0 ? {key:'courses.previewDays', days} : {key:'courses.paid'};
}

/** Published courses as one-tap options: level, access and a check on the chosen one.
 *  Shared by the course switcher and the first-run screen. */
export function CourseOptionList({sets, currentId, busy = false, onPick}: {
  sets: ContentCatalogSet[];
  currentId: string;
  busy?: boolean;
  onPick: (id: string) => void;
}){
  const {t, locale} = useI18n();
  const auth = useOptionalAuth();
  return (
    <ul className="course-list">
      {sets.map(set => {
        const entitlement = resolveCourseEntitlement({access:set.access} as CourseSet, auth.session);
        const access = accessKey(set, entitlement.full && entitlement.reason !== 'free');
        const selected = set.id === currentId;
        const level = levelLabel(set.level || {});
        return (
          <li key={set.id}>
            <button className={'course-option pressable' + (selected ? ' is-current' : '')} type="button" aria-pressed={selected} disabled={busy} onClick={() => onPick(set.id)}>
              <span className="course-option-main">
                <span className="course-option-title">{localizedText(set.title, locale)}</span>
                {set.description && <span className="tile-text">{localizedText(set.description, locale)}</span>}
                <span className="course-option-meta">
                  {level && <span className="chip">{level}</span>}
                  <span className="chip">{t(access.key, {days:access.days ?? 0})}</span>
                </span>
              </span>
              {selected && <span className="course-option-check" aria-hidden="true"><Icon name="check" size={20} /></span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** «Курс: …» chip that opens the list of published courses. */
export function CoursePicker({currentId}: {currentId: string}){
  const {t, locale} = useI18n();
  const queryClient = useQueryClient();
  const catalog = useCatalog();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const sets = catalog.data?.sets ?? [];
  const current = sets.find(set => set.id === currentId);
  if(sets.length < 2) return null;

  const pick = async (id: string) => {
    if(busy) return;
    setBusy(true);
    try{
      await chooseCourse(id);
      await queryClient.invalidateQueries({queryKey:SETTINGS_QUERY_KEY, exact:true});
      setOpen(false);
    }finally{
      setBusy(false);
    }
  };

  return (
    <>
      <button className="chip-button course-chip pressable" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Icon name="book" size={18} />
        <span className="course-chip-text">{current ? localizedText(current.title, locale) : t('courses.choose')}</span>
        <Icon name="chevron" size={16} className="course-chip-chevron" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} labelledBy="courses-title" closeLabel={t('courses.close')}>
        <div className="courses-sheet">
          <h3 id="courses-title">{t('courses.title')}</h3>
          <p className="tile-text">{t('courses.hint')}</p>
          <CourseOptionList sets={sets} currentId={currentId} busy={busy} onPick={id => void pick(id)} />
        </div>
      </Sheet>
    </>
  );
}
