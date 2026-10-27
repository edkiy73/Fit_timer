# Per-screen copy for the V21 screens

One file per screen or feature: `export const ru = {...}` and `export const en = {...}` with the same keys,
prefixed `fe.<feature>.`. `src/i18n/index.ts` merges every file here into the dictionaries, so parallel work
never edits the same file. `src/app.test.tsx` checks that RU and EN keys match.
