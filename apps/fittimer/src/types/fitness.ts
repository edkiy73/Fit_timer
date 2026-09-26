import type { Profile } from '@appbase/types/core';

export type FitTimerGender = 'f' | 'm' | '';

export interface FitTimerProfileExtension {
  gender: FitTimerGender;
  age: number | null;
  prepSec?: number;
  readySec?: number;
  sideSec?: number;
  voiceURI?: string;
  voiceVol?: number;
  fxVol?: number;
  profileId?: string;
  syncAt?: string;
}

export type FitTimerProfile = Profile & FitTimerProfileExtension;
