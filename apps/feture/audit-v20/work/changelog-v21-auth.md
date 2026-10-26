# V21 — Auth, settings, Premium and system states (section `auth`)

Branch `v21/auth`, 48 findings: 46 fixed, 2 partial (AUTH-015, AUTH-019). Verified in Chrome at 390 / 320 / 1440 (+375×667, 320×568, 1024), RU and EN, light and dark for colour changes; V21 contract passes.

## Privacy by default
- **Sign-up «About you» (AUTH-016).** The step now asks *who sees the answers below* — «Only you» (default), «By access», «Everyone» — and explains it. The choice is stored as the audience of «Details» (`S.me.detailsVis`): the tag in Me follows it, «Me → Visibility» has a «Who sees “Details”» row, and the «How others see it» previews (everyone / with access / Discover card) hide the answers accordingly. New accounts start private; seed personas keep their public answers.
- **Terms sheet (AUTH-015).** «Private by default» now matches the real tags; «Terms of use» and «Privacy policy» open as short readable sheets with Back.

## Registration
- **No app inside sign-up (AUTH-017).** Community cards on step 2 open a preview sheet (description, topics, Join / Request, Close). Without a session `go()` cannot open app screens.
- **Nickname (AUTH-001/002/003).** Exactly one message under the field: hint, «available» or an error; existing profiles' nicknames (people and couples) are taken, case-insensitively; a nickname starts and ends with a letter/digit, no «..».
- **Email code (AUTH-005/006).** Five wrong codes lock the input until a new code; wrong digits are cleared; an expired code makes «Resend» available at once.
- **Email (AUTH-007, AUTH-013).** «..» and over-long local parts are rejected; the send limit is an error under the field with a live countdown. The email decides the account: the existing address signs in from either mode, any other address creates a new account (with a clear toast).
- **Terms checkbox (AUTH-004).** The whole row toggles; the terms open from a separate link below.
- **Date of birth (AUTH-011, AUTH-025).** Days follow the month; years 13–100 back; a wrong date shows right away; «Day / Month / Year» fit at 320 px.
- **Under 18 (AUTH-010, AUTH-023).** «Back to start» clears the sign-up from history; «The date is wrong» returns with an empty date and a new date needs an explicit confirmation.
- **Steps (AUTH-014).** One progress bar and the same h2 on every step (no «N / 3» pill).
- **Step 2 (AUTH-018, AUTH-022).** The chosen topics still set the first feed, but it is said on the step and in the toast «Account created. Your feed shows: …» with «Show all». Join buttons read «Skip» / «Don’t request»; descriptions are two lines.
- **First feed (AUTH-019).** A closable «Finish your profile» card lists what is missing.
- **OAuth (AUTH-012).** Sheets are «Continue with Apple / Google»; no Face ID on the web.

## Welcome and desktop
- **Slides (AUTH-008, AUTH-009, AUTH-024).** Slide text is never cut: the picture shrinks (and hides on screens ≤600 px tall); a short positioning line shows on phones; the progress bars have a 44 px touch zone and autoplay resumes 4 s after a touch.
- **Desktop forms (AUTH-021).** On ≥1024 px A02–A05 are a 460 px card with the logo; the welcome buttons stay on one line.

## Age check and verification
- **Age check (SET-001…004).** A07 opens in the state of the check; the result arrives even after leaving «Checking…» (notification, Settings row, toast); «Wait for answer» in QA keeps it pending until «approve all». Texts say what the check really unlocks; «ID document» shoots a document, not the face; one intro line.
- **Photo verification (SET-005).** «Take a selfie» opens the front camera; requirements use a neutral icon; «How verification works» looks like an opening row.

## Settings
- Notifications (SET-006, SET-007): honest «Discreet» text (the phone always shows the app), columns «Push / Email», brand colour for «on», quiet hours editable in 30-minute steps.
- Sign-in & security (SET-008): change the primary email with a code, Google shows the user's address, «This device» from the browser, one button style.
- Your data (SET-009): «Download my data» (`feture-data-DATE.json`), the couple sentence only in a couple and naming the partner, Enter confirms, nickname case-insensitive.
- Help (SET-010): community rules, how to report, «Contact support» sheet, FAQ titles equal sheet titles, Premium text matches B01.
- Settings list (SET-011, SET-021, SET-023): every row has an icon, couple blocks are labelled, long emails stay one line, new «Privacy & visibility» row; the «Likes are off → Settings» toasts open Me → Visibility.

## Premium
- Cancel renewal shows «renewal cancelled» and «Resume renewal»; a gift has nothing to cancel (SET-012).
- Gifting has a confirmation step like an own purchase, priced term cards, a clean success toast and errors under the nickname field (SET-013).
- Paywall: close button off the hero, both features explained, the sheet has an accessible name (SET-014).

## System states and accessibility
- Offline (SET-015): the bar shows on sign-in screens (incl. welcome) with its own text; server settings fail with «Retry» instead of a false «saved».
- Maintenance (SET-016): logo and icon plate; an action cut off by maintenance reports itself afterwards.
- Contrast (SET-017): hints, «or with email», «pick any», the resend countdown use `--mute` (≥4.5:1 both themes).
- `#ctx` aria-label follows the language (SET-020).

## Core changes (small, for the lead's review)
- `pickLocalMedia(accept, multiple, o)` — optional `o.capture` (SET-005).
- `drawSheet` — `aria-label` falls back to `b.label` (SET-014).
- Wrappers in the auth JS block: `go` (no app screens without a session), `render` (offline text on auth screens, `#ctx` label, maintenance notice), `run` (remembers an action dropped by maintenance), `qaApproveAll` (resolves the age check), `V.nick`, `V.email`, `meProfileLayer`, `meVisLayer`, `meAsPerson`, `SC.P03.render`, `SC.F01.render` (welcome card).
- In-place one-line edits outside the auth/settings modules: `ACT.likeBack` and the likes-off toast in `ACT.likeProfile` (SET-023 — adjacent to the people fixer's PRF-003 line), `helpText` and the `K07` export override in s-completion (SET-009/010).

## Not done / handed over
- SET-018 dark primary button — fixed by the lead (`--accent-fill`); my override removed. The A01 welcome button gradient starts at `#FF3D61` (≈3.4:1 with white) — worth checking with `--accent-fill`.
- AUTH-020 — fixed in `v21/me` (ME-017); not duplicated here.
- AUTH-013 — QA-panel hint about which email signs in not added (QA panel belongs to the lead).

## Needs owner
- AUTH-015: final legal text of the Terms of use and the Privacy policy (current sheets are short structured summaries).
- AUTH-019: a new couple is visible in Discover by default (`coupleProfile()` has `dating:true, datingVisible:true`, and Q01 says so). That contradicts «dating off by default». Should a new couple start with dating off (and Q01 say «turn it on together in couple settings»)? Change belongs to the couple section.
