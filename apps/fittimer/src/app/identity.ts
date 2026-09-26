import { createAccount, createProfileDraft } from '@appbase/core/identity.js';
import type { AccountDraft, ProfileDraft } from '@appbase/core/identity.js';

export interface FitTimerProfileDraft extends ProfileDraft {
  gender: '' | 'm' | 'f';
  age: number | null;
}

export function createFitTimerAccount(): AccountDraft {
  return createAccount();
}

export function createFitTimerProfile(name: string): FitTimerProfileDraft {
  return {
    ...createProfileDraft(name),
    gender: '',
    age: null
  };
}
