import { afterEach, describe, expect, it } from 'vitest';
import {
  COURSE_DAY_MILESTONES,
  analyticsPlatform,
  completionEventName,
  paywallEventName,
  purchaseEventName
} from './observability';

// The server whitelist (CommonJS, no types): what the client sends must be accepted there.
// @ts-ignore
import * as serverAnalytics from '../lib/app-analytics.js';
const {EVENTS,FUNNEL}=((serverAnalytics as {default?:unknown}).default??serverAnalytics) as {EVENTS:string[];FUNNEL:Array<{id:string;events:string[]}>};

afterEach(()=>{ delete (globalThis as {Capacitor?:unknown}).Capacitor; });

describe('UnMute funnel analytics names',()=>{
  it('keeps paywall placement inside the server whitelist',()=>{
    expect(paywallEventName('course')).toBe('paywall_shown.course');
    expect(paywallEventName('today')).toBe('paywall_shown.today');
    expect(paywallEventName('talk')).toBe('paywall_shown.talk');
    expect(paywallEventName('unexpected')).toBe('paywall_shown.other');
  });

  it('keeps purchase SKU dimensions bounded to known analytics events',()=>{
    expect(purchaseEventName('purchase_started','course.general-foundation'))
      .toBe('purchase_started.course');
    expect(purchaseEventName('purchase_completed','course.a1-starter'))
      .toBe('purchase_completed.course');
    expect(purchaseEventName('purchase_completed','bundle.course.a1-starter'))
      .toBe('purchase_completed.bundle');
    expect(purchaseEventName('purchase_completed','plus.year'))
      .toBe('purchase_completed.plus');
    expect(purchaseEventName('purchase_started','unknown'))
      .toBe('purchase_started.other');
  });

  it('sends only events the server accepts (audit R7)',()=>{
    const sent=[
      'install','onboarding_done','talk_started','day_started','review_completed','word_saved',
      'reminder_enabled','signed_in','ai_error','save_error',
      ...['first','resume','replay'].flatMap(mode=>[completionEventName('lesson',mode as never),completionEventName('day',mode as never)]),
      ...['course','today','talk','other'].map(paywallEventName),
      ...['course.x','bundle.course.x','plus.year','x'].flatMap(sku=>[purchaseEventName('purchase_started',sku),purchaseEventName('purchase_completed',sku)]),
      ...COURSE_DAY_MILESTONES.map(day=>'course_day.'+day),
      ...['tasks','drill','listening','speaking','dialogue','ai'].map(section=>'section_completed.'+section)
    ];
    expect(sent.filter(event=>!EVENTS.includes(event))).toEqual([]);
    expect(FUNNEL.map(step=>step.id)).toEqual(['install','onboarding_done','course_day.1','signed_in','course_day.3','paywall','purchase']);
    expect(FUNNEL.flatMap(step=>step.events).filter(event=>!EVENTS.includes(event))).toEqual([]);
  });

  it('reports the real platform instead of always «web» (audit R1)',()=>{
    expect(analyticsPlatform()).toBe('web');
    (globalThis as {Capacitor?:unknown}).Capacitor={isNativePlatform:()=>true,getPlatform:()=>'android'};
    expect(analyticsPlatform()).toBe('android');
    (globalThis as {Capacitor?:unknown}).Capacitor={isNativePlatform:()=>true,getPlatform:()=>'ios'};
    expect(analyticsPlatform()).toBe('ios');
  });
});
