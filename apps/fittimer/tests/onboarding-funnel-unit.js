import { readFile } from 'node:fs/promises';

const events = await readFile('src/app/90-events.js', 'utf8');
const progress = await readFile('src/app/30-progress-media.js', 'utf8');
const html = await readFile('src/html/30-onboarding-account.html', 'utf8');
const ru = await readFile('src/i18n/ru.js', 'utf8');
const en = await readFile('src/i18n/en.js', 'utf8');

const need = (ok, msg) => { if(!ok) throw new Error(msg); };

need(progress.includes("if(users.length) return false;"), 'existing profile must not be treated as fresh onboarding');
need(progress.includes("return true;\n}\n\n/* ---- пол и возраст"), 'fresh onboarding profile must be reported to caller');
need(events.includes("const freshProfile = await finishOnboardingCreate();"), 'onboarding must capture fresh-profile state');
need(events.includes("goTab(freshProfile ? 'scrPrograms' : 'scrMenu');"), 'fresh user must land on workout choices, restored user on home');
need(events.indexOf("if(pendingImport)") < events.indexOf("goTab(freshProfile ? 'scrPrograms' : 'scrMenu');"), 'pending import must keep priority over first-run landing');
need(events.indexOf("if(pendingNativeLink)") < events.indexOf("goTab(freshProfile ? 'scrPrograms' : 'scrMenu');"), 'native App Link must keep priority over first-run landing');
need(html.includes('id="obStart" data-i18n="onboarding.start"'), 'onboarding CTA must describe choosing a workout');
need(ru.includes("'onboarding.start': 'Выбрать тренировку'"), 'RU onboarding CTA is missing');
need(en.includes("'onboarding.start': 'Choose a workout'"), 'EN onboarding CTA is missing');

console.log('Onboarding funnel is valid.');
