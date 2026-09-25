namespace AppBaseIdentity {
  export type ThemePreference = 'system' | 'light' | 'dark';

  export interface DeletedProfileRef {
    id: string;
    at: string;
  }

  export interface AccountDraft {
    email: string;
    handle: string;
    locale: string;
    createdAt: string;
    linkedAt: string | null;
    sub: unknown | null;
    biometry: unknown | null;
    deletedProfiles: DeletedProfileRef[];
  }

  export interface ProfileDraft {
    id: string | null;
    name: string;
    photo: string | null;
    theme: ThemePreference;
    locale: string;
  }

  export function createAccount(now = new Date()): AccountDraft {
    return {
      email: '',
      handle: '',
      locale: '',
      createdAt: now.toISOString(),
      linkedAt: null,
      sub: null,
      biometry: null,
      deletedProfiles: []
    };
  }

  export function createProfileDraft(name: string): ProfileDraft {
    return {
      id: null,
      name: String(name || ''),
      photo: null,
      theme: 'system',
      locale: 'system'
    };
  }
}
