import { useMemo, useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { RecordMap } from '@appbase/core/document-sync.js';
import type { TimedFlag } from './progress';
import { dayNumberFromKey } from './engine/course-progress';
import { Icon } from './icons';

/* Activity as an ordinary month calendar: weekday header, day numbers, days with a
   lesson or review are filled, today is outlined. The old 12-week grid looked nice but
   nobody could tell which square was which day. */

const DAY_MS = 86_400_000;

export interface CalendarCell { day: number; date: number; inMonth: boolean; active: boolean; future: boolean }

export function activeDays(learningDays: RecordMap<TimedFlag> | null | undefined): Set<number> {
  const days = new Set<number>();
  for(const [key, value] of Object.entries(learningDays ?? {})){
    if(!value || value.deleted) continue;
    try{ days.add(dayNumberFromKey(key)); }catch{}
  }
  return days;
}

/** Monday-first weeks covering the month (UTC day numbers, like the progress documents). */
export function monthCalendar(year: number, month: number, active: ReadonlySet<number>, todayDay: number): CalendarCell[][] {
  const first = Math.floor(Date.UTC(year, month, 1) / DAY_MS);
  const last = Math.floor(Date.UTC(year, month + 1, 0) / DAY_MS);
  const weekday = (day: number) => (new Date(day * DAY_MS).getUTCDay() + 6) % 7;
  const start = first - weekday(first);
  const end = last + (6 - weekday(last));
  const weeks: CalendarCell[][] = [];
  for(let day = start; day <= end; day += 7){
    weeks.push(Array.from({length:7}, (_, index) => {
      const d = day + index;
      return {day:d, date:new Date(d * DAY_MS).getUTCDate(), inMonth:d >= first && d <= last, active:active.has(d), future:d > todayDay};
    }));
  }
  return weeks;
}

export function ActivityCalendar({learningDays, todayDay}: {learningDays: RecordMap<TimedFlag> | null | undefined; todayDay: number}){
  const {t, locale} = useI18n();
  const today = new Date(todayDay * DAY_MS);
  const [offset, setOffset] = useState(0);
  const shown = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
  const year = shown.getUTCFullYear(), month = shown.getUTCMonth();
  const active = useMemo(() => activeDays(learningDays), [learningDays]);
  const weeks = useMemo(() => monthCalendar(year, month, active, todayDay), [year, month, active, todayDay]);
  const inMonth = weeks.flat().filter(cell => cell.inMonth && cell.active).length;
  const title = new Intl.DateTimeFormat(locale, {month:'long', year:'numeric', timeZone:'UTC'}).format(shown);
  const weekdays = Array.from({length:7}, (_, index) =>
    new Intl.DateTimeFormat(locale, {weekday:'short', timeZone:'UTC'}).format(new Date(Date.UTC(2024, 0, 1 + index))));

  return (
    <article className="progress-section activity-calendar" aria-labelledby="activity-title">
      <div className="calendar-head">
        <button className="icon-button pressable" type="button" aria-label={t('calendar.previous')} onClick={() => setOffset(value => value - 1)}>
          <Icon name="back" size={20} />
        </button>
        <div className="calendar-title">
          <h3 id="activity-title">{title.charAt(0).toUpperCase() + title.slice(1)}</h3>
          <span>{t('calendar.count', {count:inMonth})}</span>
        </div>
        <button className="icon-button pressable calendar-next" type="button" aria-label={t('calendar.next')} disabled={offset >= 0} onClick={() => setOffset(value => Math.min(0, value + 1))}>
          <Icon name="back" size={20} />
        </button>
      </div>
      <table className="calendar-grid">
        <thead><tr>{weekdays.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>
          {weeks.map(week => (
            <tr key={week[0]!.day}>
              {week.map(cell => (
                <td key={cell.day}>
                  {cell.inMonth && (
                    <span
                      className={'calendar-day' + (cell.active ? ' is-active' : '') + (cell.day === todayDay ? ' is-today' : '') + (cell.future ? ' is-future' : '')}
                      aria-label={cell.active ? t('calendar.dayActive', {date:cell.date}) : undefined}
                    >{cell.date}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="progress-muted calendar-legend"><span className="calendar-day is-active" aria-hidden="true">1</span>{t('calendar.legend')}</p>
    </article>
  );
}
