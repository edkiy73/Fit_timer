import {describe,expect,it} from 'vitest';
import {DomainClientError} from './domain-api';
import {definitivelyRejectedTestDraft} from './test-share-preview';

describe('post-from-test immutable retry',()=>{
 it('keeps the original command after a lost response and a later preflight denial',()=>{
  expect(definitivelyRejectedTestDraft(new Error('lost response'),false)).toBe(false);
  for(const code of ['consent_required','verification_required','resource_not_found','forbidden','rate_limited','auth_required']){
   expect(definitivelyRejectedTestDraft(new DomainClientError(code),true)).toBe(false);
  }
  // SQL looks up the original receipt before these definite conflicts.
  for(const code of ['revision_conflict','operation_conflict']){
   expect(definitivelyRejectedTestDraft(new DomainClientError(code),true)).toBe(true);
  }
  // No receipt is in doubt on a server-confirmed, first-attempt preflight denial.
  expect(definitivelyRejectedTestDraft(new DomainClientError('consent_required'),false)).toBe(true);
  // A client-side session check can reject after the request was actually applied.
  expect(definitivelyRejectedTestDraft(new DomainClientError('auth_required'),false)).toBe(false);
 });
});
