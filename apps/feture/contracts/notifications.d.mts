// Types of contracts/notifications.mjs for the app (the inbox, the push routes).
export type Text = { ru: string | readonly [string, string], en: string | readonly [string, string] };
export type Filter = 'access' | 'likes' | 'matches' | 'replies' | 'events' | 'groups' | 'pair' | 'follows' | 'links' | 'posts' | 'other';
export type Entry = {
  kind: 'notice' | 'task' | 'result', filter: Filter, icon: string, tone: '' | 'l' | 'g' | 'v',
  card: 'news' | 'decision' | 'result' | 'safety' | 'event' | 'summary',
  text: Text, alone?: Text,
  push: { cat: string, safe: Text, normal: Text, named: boolean, off: boolean },
  email: 'none' | 'now' | 'now-if-unread' | 'digest', subject: Text, dest: string,
  collapse: 'none' | 'object' | 'actor' | 'type', gone: Text,
};
export type NoteRef = {
  type: string, id?: string | null, data?: Record<string, unknown> | null, object?: { type: string, id: string | null } | null,
  sub?: { type: string, id: string | null } | null, actor?: string | null, addressee?: string | null, couple?: string | null,
};
export declare const SAFE_PUSH: Text;
export declare const PUSH_WORDS: Readonly<Record<'ru' | 'en', { title: string, media: Record<'image' | 'video' | 'audio', string> }>>;
export declare const PUSH_SETTING: Readonly<Record<string, string>>;
export declare const PUSH_CATS: readonly string[];
export declare const FILTERS: readonly Filter[];
export declare const CARDS: readonly string[];
export declare const EMAILS: readonly string[];
export declare const DECIDE_KINDS: readonly ['pinv', 'req', 'capp', 'eapp', 'link', 'linkChange', 'tag', 'joint'];
export declare const CATALOG: Readonly<Record<string, Entry>>;
export declare function noteKey(type: string, data?: Record<string, unknown> | null): string | null;
export declare function entryFor(type: string, data?: Record<string, unknown> | null): Entry | null;
export declare function textOf(text: Text, locale: string, couple?: boolean): string;
export declare function actOf(text: Text, locale: string, couple?: boolean): string;
export declare function noteLine(e: Entry, locale: string, o?: { name?: string | null, couple?: boolean, vars?: Record<string, string> }): string;
export declare function destination(n: NoteRef): string;
export declare const ROUTE_PATH: RegExp;
export declare const ROUTE_QUERY: Readonly<Record<string, RegExp>>;
export declare function routeOk(route: unknown): route is string;
export declare function pushUrl(route: string): string;
