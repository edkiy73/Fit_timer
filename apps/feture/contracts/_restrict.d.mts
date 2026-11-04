// Types of contracts/_restrict.mjs for the app (the staff area offers the same points and presets the server checks).
export declare const RESTRICT_SCOPES: readonly ['search', 'discover', 'likes', 'follows', 'access', 'messages', 'links', 'communities', 'events', 'posts', 'comments', 'reactions', 'uploads'];
export type RestrictScope = typeof RESTRICT_SCOPES[number];
export declare const RESTRICT_PRESETS: Readonly<{ soft: RestrictScope[], standard: RestrictScope[], strict: RestrictScope[] }>;
