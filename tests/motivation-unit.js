import { readFile } from 'node:fs/promises';

const workout = await readFile('src/app/70-workout.js', 'utf8');
const platform = await readFile('src/app/80-platform.js', 'utf8');
const ru = await readFile('src/i18n/ru.js', 'utf8');
const en = await readFile('src/i18n/en.js', 'utf8');
const programs = await readFile('src/app/40-programs-ai.js', 'utf8');

const need = (ok, msg) => { if(!ok) throw new Error(msg); };

need(workout.includes("function activeWeekStreak(history)"), '4-week consistency helper is missing');
need(workout.includes("{id: 't5'"), '5-workout achievement is missing');
need(workout.includes("{id: 'month'"), '4-week consistency achievement is missing');
need(workout.includes("activeWeekStreak(stats.history) >= 4"), '4-week achievement rule is wrong');
need(platform.includes("[3,7,14].forEach(days =>"), 'inactivity reminders must stop after 14 days');
need(!platform.includes("[3,7,14,30].forEach(days =>"), '30-day inactivity ping must be removed');
need(ru.includes("'badge.t5.name': \"Первые пять\""), 'RU 5-workout copy is missing');
need(en.includes("'badge.month.name': \"Four weeks\""), 'EN 4-week copy is missing');
const weekDayStart = programs.indexOf('function openWeekDay(d){');
const weekDayEnd = programs.indexOf('\nfunction renderToday()', weekDayStart);
const weekDay = programs.slice(weekDayStart, weekDayEnd);
need(weekDayStart >= 0, 'week day popup handler is missing');
need(weekDay.includes("(d.slots || []).forEach"), 'week day popup must render planned slots separately');
need(weekDay.includes("openDayProgram(p.id, plans.indexOf(plan))"), 'week day popup program must open the program page');
need(!weekDay.includes("sess-ex"), 'week day popup must not list exercises');
need(!weekDay.includes("week.plannedExercises"), 'week day popup must not repeat a planned-exercises label');
need(weekDay.includes("row.className = 'sess-row sess-link'"), 'week day plan must use structured session rows');
need(!weekDay.includes("names.join(', ')"), 'week day popup must not collapse planned programs into comma text');

console.log('Progress motivation rules are valid.');
