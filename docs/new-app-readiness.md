# New app readiness checklist

Last audited: 2026-09-28.

The clean React starter is the default starting point for every new app:
`npm run app:create -- <slug> "<Name>" <reverse.domain.id> [ru|en]`.

## Ready in the generated app

- current monorepo Core aliases (no per-app Core versions);
- React + TypeScript + Vite + React Router + TanStack Query + Zod + React Aria;
- product config and shared theme tokens;
- email OTP auth, persisted session, logout and account-deletion action;
- generic document-sync endpoint **and client transport**;
- Health endpoint;
- protected shared Admin at `#/admin`;
- Admin Health, analytics overview, accounts, client errors and storage status;
- product-specific Admin extension slots;
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
- Premium/billing/store products;
- push notification categories and scheduling policy;
- Capacitor Android/iOS shells and native capabilities;
- product-specific Admin sections;
- privacy policy, terms, store metadata and deep/app links.

## One decision to make when App2 is created

The starter is generated with one UI locale (`ru` or `en`). If App2 must support live RU/EN switching from day one, add the app-level i18n layer before building many screens. Auth already supports RU/EN, but product copy is intentionally not forced into a generic Core translation system.

## Definition of ready to start App2

A generated app passes `npm run check`, opens behind shared Auth, has `#/admin`, reports runtime errors, and can call the generic sync transport. Product work can then start without another infrastructure phase.
