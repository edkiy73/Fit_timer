import { describe, expect, it } from 'vitest';
import { paywallEventName, purchaseEventName } from './observability';

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
    expect(purchaseEventName('purchase_completed','plus.year'))
      .toBe('purchase_completed.plus');
    expect(purchaseEventName('purchase_started','unknown'))
      .toBe('purchase_started.other');
  });
});
