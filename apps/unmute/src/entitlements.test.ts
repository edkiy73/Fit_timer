import { describe, expect, it } from 'vitest';
import type { AuthSession } from '@appbase/core/auth.js';
import type { CourseSet } from './content/schema';
import { authEntitlementFingerprint, resolveCourseEntitlement } from './entitlements';

function set(access:CourseSet['access']):CourseSet{
  return {
    schemaVersion:1,
    id:'general-foundation',
    revision:1,
    slug:'general-foundation',
    title:{ru:'Курс'},
    level:{labels:[]},
    access,
    defaultRoadmapId:'main',
    roadmaps:[{id:'main',title:{ru:'Путь'},nodes:[]}],
    activities:[],
    resources:[]
  };
}

function session(overrides:Partial<AuthSession>={}):AuthSession{
  return {
    email:'person@example.com',
    deviceId:'device',
    syncToken:'token',
    handle:'',
    locale:'ru',
    sub:null,
    premium:false,
    owned:[],
    fresh:false,
    ...overrides
  };
}

describe('UnMute course entitlements',()=>{
  const paid=set({
    mode:'entitlement',
    entitlement:'course.general-foundation',
    freePreview:{kind:'first-days',days:7,learnedContentStaysAvailable:true}
  });

  it('opens a free set without an account',()=>{
    expect(resolveCourseEntitlement(set({mode:'free'}),null)).toEqual({
      full:true,
      reason:'free',
      sku:null
    });
  });

  it('opens the whole course for a permanent owned SKU',()=>{
    expect(resolveCourseEntitlement(
      paid,
      session({owned:['course.general-foundation']})
    )).toMatchObject({full:true,reason:'owned'});
  });

  it('keeps a paid course in preview for Plus: Plus is a discount, not the course',()=>{
    const now=Date.parse('2026-09-29T00:00:00Z');
    expect(resolveCourseEntitlement(
      paid,
      session({
        premium:true,
        sub:{until:'2026-10-29T00:00:00Z'}
      }),
      now
    )).toMatchObject({full:false,reason:'preview'});
  });

  it('does not trust a stale premium boolean after the subscription expiry',()=>{
    const now=Date.parse('2026-09-29T00:00:00Z');
    expect(resolveCourseEntitlement(
      paid,
      session({
        premium:true,
        sub:{until:'2026-09-28T00:00:00Z'}
      }),
      now
    )).toMatchObject({full:false,reason:'preview'});
  });

  it('changes the query fingerprint when course rights change',()=>{
    const free=session();
    const owned=session({owned:['course.general-foundation']});
    expect(authEntitlementFingerprint(free)).not.toBe(authEntitlementFingerprint(owned));
  });
});
