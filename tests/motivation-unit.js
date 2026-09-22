import { readFile } from 'node:fs/promises';

const workout = await readFile('src/app/70-workout.js', 'utf8');
const platform = await readFile('src/app/80-platform.js', 'utf8');
const ru = await readFile('src/i18n/ru.js', 'utf8');
const en = await readFile('src/i18n/en.js', 'utf8');

const need = (ok, msg) => { if(!ok) throw new Error(msg); };

need(workout.includes("function activeWeekStreak(history)"), '4-week consistency helper is missing');
need(workout.includes("{id: 't5'"), '5-workout achievement is missing');
need(workout.includes("{id: 'month'"), '4-week consistency achievement is missing');
need(workout.includes("activeWeekStreak(stats.history) >= 4"), '4-week achievement rule is wrong');
need(platform.includes("[3,7,14].forEach(days =>"), 'inactivity reminders must stop after 14 days');
need(!platform.includes("[3,7,14,30].forEach(days =>"), '30-day inactivity ping must be removed');
need(ru.includes("'badge.t5.name': \"Первые пять\""), 'RU 5-workout copy is missing');
need(en.includes("'badge.month.name': \"Four weeks\""), 'EN 4-week copy is missing');

console.log('Progress motivation rules are valid.');
