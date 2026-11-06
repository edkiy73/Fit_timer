import * as z from 'zod';

/** First import of the app (src/main.tsx): zod would probe whether it may compile validators with `new Function` when the first schema is
 * built — a violation report under the content-security policy every time. Without compiling the schemas run interpreted, which is all this
 * app needs. It must run before any module that builds a schema, so it is a module of its own that main.tsx imports first. */
z.config({ jitless: true });
