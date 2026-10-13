# FetUre — visual reference, not production source

**Latest product brief 2026-10-13:** read [PRODUCT-SPEC-START](PRODUCT-SPEC-START.md), then the relevant part of [MASTER-PRODUCT-SPEC-V4](MASTER-PRODUCT-SPEC-V4.md). The new Feed / People / Communities / Chats / Me structure, RU/EN and full Events supersede previous product-navigation variants. Full specification and connected screen design are the current priority; the HTML below remains a visual reference.

**Reference:** [Claude HTML prototype](claude-mvp-concept-2026-10-12.html), supplied by the owner 2026-10-12. Preserve the original unchanged; do not bundle this 220+ KB showcase into the production build. It is a *design vocabulary*, not proof of live features, authentication, desktop responsiveness or accessible interaction.

## What to carry over
| Item | Prototype baseline | Production expectation |
|---|---|---|
| Type | Geologica variable (Google Fonts); weight 300–900, `SHRP` and `CRSV` features. `system-ui` fallback | Use a legal, performance-conscious font loading strategy; ensure Cyrillic and fallback layout. Introduce font once via theme; no font fetch per component. |
| Light | `--bg:#F3EEF2`, `--surf:#FFFFFF`, `--ink:#1E1219`, `--mute:#75606D` | Semantic tokens; verify contrast in all states. |
| Dark | `--bg:#1A0F16`, `--surf:#241520`, `--ink:#FBF0F4`, `--mute:#B89FAD` | Manual/system theme switching with no mismatched surfaces or text. |
| Accents | latex `#E01A3E` light / `#FF3355` dark; lilac `#5C47D6` light / `#B9A6FF` dark; mint/amber status | Distinct roles for primary action, helpful secondary, success/warning. Don't flood every control with saturated accent. |
| Shape | 14–18px buttons, 20–30px cards, bottom navigation 24px, sheet corners 28px | Radius hierarchy and consistent 8/12/16/24px rhythm; don't overround tables or desktop dialogs. |
| Motion | `cubic-bezier(.2,.8,.2,1)`, button press ~120ms, pop ~250–300ms, sheet ~340ms, screen enter ~340ms | Motion `transform/opacity` first, restrained spring and gesture where useful, no page-jump, respect reduced-motion; 60fps target when possible. |
| Behaviors | Bottom sheet with grabber/backdrop, blur dock, segmented control, card stack/swap, reveal overlay, active chips, progressive onboarding | Recreate semantics in React + React Aria + existing Motion; accessible focus trap, Escape/Android Back, touch/keyboard, save guards. No copy-paste of DOM event handlers. |

## Important limitations and red flags in the reference
- The prototype desktop `.stage` has a 300px index + **390px mobile simulator** (`.device`), not a genuine responsive desktop experience. The only functional breakpoint is around 760px. Design new desktop/tablet layouts natively: 320/390/768/1024/1440, fold/multicolumn and zoom 200%.
- Many screens contain illustrative sample people, chat, likes and paywall. **Never treat the HTML as verified backend behavior or a production data source**. FetUre policies: privacy, 18+ checks, consent and seed provenance apply. No fake matches or private disclosure.
- Several animations and fixed overlay positions are tuned for a contained device mockup. Reimplement relative to app shell, safe areas, mobile keyboard, scrolling and React route lifecycle; inspect overflow, stacking/focus, state restoration.
- Dark and light tokens need real contrast review, especially muted text, borders and over-image labels. Reduced motion, screen-reader labels, button roles, browser history and large text require explicit testing.
- The Google Fonts request may fail/offline; preserve correct system fallback. Original images/graphics are illustrative, not licensing or production approval.

## Production frontend workflow (mandatory for new screens)
1. **Discovery (one short pass):** product task, real server DTO/permissions, screen entry/exit flows, 3–5 relevant files. Include empty/loading/error/offline/retry and no-account scenarios.
2. **UX skeleton:** hierarchy, primary action, phone + tablet + desktop layouts, keyboard/back/focus. Choose appropriate AppBase shared primitives; don't create a parallel UI library or a second admin shell.
3. **Visual polish:** implement Geologica/token hierarchy if appropriate, intentional whitespace, content density, card treatment and Motion from reference. No assembly of generic stacked `<section class=card>` and plain links as a finished consumer screen.
4. **Evidence:** screenshot of **real React build** at 390 and 1440 minimum, check 320/768/1024/fold where material, dark/light and panel lifecycle. Compare with visual reference; report defects, fix and rerun. If no browser, explicitly mark `visual QA pending`.
5. **Functional acceptance:** relevant tests, contrast/accessibility/reduced-motion, API failures, session switching and private-data projection. Distinguish implementation from verified production.
6. **Review:** independent reviewer or second model for material screens, but do not spawn reviewers for trivial text edits.

**First visual-quality target:** A06 account/profile/onboarding, then O05 common AppBase admin product adaptation. Keep any currently open PRs and dependencies in view; do not overwrite active work.

Текущий V4 визуальный контракт: [VISUAL-CONTRACT-V4](VISUAL-CONTRACT-V4.md), после повторного просмотра HTML 13.10.2026. Сохранить компактные панели и ритм при дальнейшей интеграции; одна подходящая primary action на группу, семантические иконки, стеклянные инструменты с читаемыми слоями.
