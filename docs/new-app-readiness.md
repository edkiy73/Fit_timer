# New app readiness checklist

Last audited: 2026-09-28.

The clean React starter is the default starting point for every new app:
`npm run app:create -- <slug> "<Name>" <reverse.domain.id> [ru|en]`.

## Ready in the generated app

- current monorepo Core aliases (no per-app Core versions);
- React + TypeScript + Vite + React Router + TanStack Query + Zod + React Aria;
- product config and shared theme tokens;
- email OTP auth, persisted session, logout and account-deletion action; the app works **without an account** (`AuthProvider` + `SignInForm` on `#/account`), handle step per product (`config/product.json → auth.askHandle`);
- local-first document sync (`createDocumentSync` + `startAutoSync`): data is written on the device, synced after sign-in, merged on first sign-in; the starter syncs a free account document `settings` (the language choice);
- purchases: account rights (`hasEntitlement`), product SKU catalog (`config/product.json → products`), `api/billing.js` with the memory-store-only test provider; Admin grants/revokes purchases and Premium and shows payments;
- interface language: all copy through `t()` with RU/EN dictionaries in `src/i18n`; languages offered are `config/product.json → i18n.locales` (one locale = no switch, add a second to turn the switch on);
- Health endpoint;
- protected shared Admin at `#/admin`;
- shared Admin shell follows the mature FitTimer workbench pattern: desktop sidebar with grouped navigation, mobile drawer, sticky page header, compact cards/tables/forms;
- Admin Health, analytics overview, accounts, client errors and storage status;
- product-specific Admin extension slots can choose their sidebar group;
- install analytics and global client-error reporting;
- fatal React error boundary with a usable reload screen;
- Vercel config;
- unit, smoke and production-browser test scaffold;
- CI that materializes a brand-new generated app and compiles/tests it;
- CI watches both `packages/core/**` and `packages/ui-react/**`.

## Intentionally product-specific / conditional

These are not starter blockers and should be added only when the product enables them:

- domain models, repositories, sync registry entries and merge policy;
- product analytics event taxonomy beyond `install`;
- AI actions/prompts/schemas and AI Admin pages;
- real payment providers (adapters in `api/billing.js`) and the product's SKUs;
- push notification categories and scheduling policy;
- Capacitor Android/iOS shells and native capabilities;
- product-specific Admin sections;
- privacy policy, terms, store metadata and deep/app links.

## Decisions per app

- Languages: the generator's locale is the only one offered; add the other to `i18n.locales` to enable switching.
- Handle at sign-in: `auth.askHandle` (default `true`).
- What syncs and whether it is free: `lib/app-sync-schema.js` (free data = account documents with `free:true`).

## Definition of ready to start App2

A generated app passes `npm run check`, opens behind shared Auth, has `#/admin`, reports runtime errors, and can call the generic sync transport. Product work can then start without another infrastructure phase.
