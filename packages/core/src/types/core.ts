export type AppLocale = 'ru' | 'en';
export type ThemePreference = 'system' | 'light' | 'dark';
export type AppPlatform = 'web' | 'android' | 'ios';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface AppFeatureFlags {
  profiles: boolean;
  premium: boolean;
  ai: boolean;
  notifications: boolean;
  biometrics: boolean;
  sharing: boolean;
  voice: boolean;
}

export interface AppThemeTokens {
  background: string;
  card: string;
  surface: string;
  accent: string;
  accentInk: string;
}

export interface AppBrandConfig {
  background: string;
  notificationAccent: string;
  ui: {
    dark: AppThemeTokens;
    light: AppThemeTokens;
  };
}

export interface ProductConfig {
  id: string;
  name: string;
  slug: string;
  defaultApiUrl: string;
  defaultPublicUrl: string;
  brand: AppBrandConfig;
  features: AppFeatureFlags;
}

export interface RuntimeAppConfig {
  appId: string;
  appName: string;
  slug: string;
  apiBase: string;
  publicAppUrl: string;
  brand: AppBrandConfig;
  features: AppFeatureFlags;
}

export interface SubscriptionEntitlement {
  until?: string | null;
  source?: string | null;
}

export interface DeletedProfileRef {
  id: string;
  at: string;
}

export interface Account {
  email: string;
  handle?: string;
  locale?: string;
  createdAt?: string;
  linkedAt?: string | null;
  sub?: SubscriptionEntitlement | null;
  biometry?: JsonValue;
  syncToken?: string | null;
  deletedProfiles?: DeletedProfileRef[];
}

export interface Profile {
  id: string;
  name: string;
  theme?: ThemePreference;
  locale?: string;
  photo?: string | null;
}

export type SyncScope = 'account' | 'profile';

export interface SyncDocument<TPayload extends JsonValue = JsonValue> {
  scope: SyncScope;
  type: string;
  id: string;
  revision: number;
  payload: TPayload;
  deleted?: boolean;
  updatedAt?: string;
}

export interface AIActionRequest<TInput extends JsonValue = JsonValue> {
  action: string;
  input: TInput;
}

export interface AIActionResponse<TOutput extends JsonValue = JsonValue> {
  action: string;
  output: TOutput;
  provider?: string;
  model?: string;
}

export type NotificationPreferences = Readonly<Record<string, JsonValue>>;

export interface AnalyticsEvent {
  name: string;
  properties?: Readonly<Record<string, JsonValue>>;
}

export interface ClientDiagnostic {
  code: string;
  message: string;
  context?: Readonly<Record<string, JsonValue>>;
  platform?: AppPlatform;
}
