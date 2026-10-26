# S1/S2 extract — IDENTITY, PROFILES, COUPLES, «Я», SETTINGS

Source: `apps/feture/public/prototype-v21.html` (line numbers = prototype lines; V21 override blocks at 8923–9280 win over earlier code), `V21-INTEGRATION-GUIDE.md` §5/§11, `V21-PLATFORM-DECISIONS.md`, server `apps/feture/lib/feture/*`, migrations, docs.
Legend for visibility: **O** = owner profile (for a couple: both members), **Pm** = the other couple member only, **F** = followers of the profile, **A** = any signed‑in adult, **M** = matched (mutual like) with the acting profile, **G** = holder of an active access grant with the scope, **St** = staff (role‑gated), **Sys** = server only (never projected).
"implied" = V21 only suggests it; not a hard UI rule.

---

## 0. Model in one paragraph

An **account** (login, email, DOB, sessions, notification/app settings, age check, Premium entitlement) owns exactly one **person profile** and may be a **member** of at most one active **couple profile** (2 member accounts). All social data (interests, private part, grants, requests, visibility settings, dating mode, links, blocks, likes, follows, chats, posts) belongs to a **profile**. The client sends the **acting profile** (`me` | `couple:<id>`) with every write and every "my data" read (`activeActor()` 4044, `actionAuthor()` 4054, guide §5.1); the server checks membership and couple `status=active`, never defaults to the person profile when the couple is active. Couple writes that widen exposure go through `partner_approvals` according to each member's own approval setting; narrowing applies at once and notifies the partner (`coupleSetting` 7583, `pairSafety` 8540). Account vs profile split in the prototype: `S.me` mixes both; `S.pair.profile` is the couple profile (`coupleProfile()` 4017); `social(id)` 4059 is the per‑profile store of follows/likes/requests/grants/threads.

---

## 1. Entities

### 1.1 `account` — owner: account (Sys for staff)
| Field | Type / constraints | Visible to | Evidence |
|---|---|---|---|
| account_id | UUIDv7, PK (replaces `sha256(email)` hash) | Sys | D2, identity.js |
| email | citext, unique, ≤254, local part ≤64, no `..` | O (Settings), St | `V.email` 8977, K06 8312 |
| email_pending | {email, code_hash, expires} while changing | O | `k6email` 8321–8324 |
| auth_methods | set of `email`,`google`,`apple`; ≥1 must remain | O | `k6link` 8317 |
| oauth_identities | provider, subject, provider_email (Apple relay allowed) | Sys | `oaGo` 5538 |
| dob | date; never projected; only age is derived | Sys (+O sees own in data export) | A04 5572, LEGAL privacy 8986 |
| u18_attempts | count/last_at of "under 18" submissions (no other data stored) | Sys | A04X 5611, AUTH-023 |
| news_opt_in | bool, default false | O | A04 «Присылать новости» 5587 |
| lang_pref | `system`/`ru`/`en`, default `ru` (implied from device) | O | `k2` 8272 |
| chat_blur | bool, default **true** (blur incoming photos/video) | O | `k4blur` 8276, K01 8265 |
| state | `active` → `deleted` (irreversible) | St | K07 8330–8331 |
| created_at, last_seen_at | timestamptz | Sys | — |
Invariants: one person profile per account; account deletion is free and independent of subscription (K07 8328). Theme is device‑local (`applyTheme` 8274 uses localStorage) — **not** a server field.

### 1.2 `auth_session` (device session) — owner: account
Fields: session_id, account_id, device_label (from UA: iPhone/Android/Chrome·Mac …), coarse city (geo‑IP, implied), created_at, last_seen_at, revoked_at. Visible O. Commands: list, end other session (K06 8315, `k6kill` 8325), logout (8271). Security alerts (new sign‑in, deletion) always sent, discreet (K05 note 8299).

### 1.3 `login_code` — owner: Sys
6 digits, TTL **10 min** (A03 5546), resend allowed after **30 s** (5546–5546), **5 wrong attempts → locked until new code** (`checkCode` 5563), expired code → resend at once; per‑email send limit with countdown (`limit@` stub 5525, AUTH-007; another email is not limited, 5519). "The email decides": known email signs in from either mode, unknown email creates an account (5565–5567).

### 1.4 `profile` — owner: profile (kind person|couple)
Common fields:
| Field | Type / constraints | Visible to | Evidence |
|---|---|---|---|
| profile_id | UUIDv7 | A | D3 |
| kind | `person` \| `couple` | A | `coupleProfile` 4017 |
| state | person: `active`/`deleted`; couple: see 1.6 | A (as «Это недоступно») | `unavailable()` 4351 |
| bio | rich text (md subset), ≤500 | A | P02 `peSave` 7476 |
| city_id | FK `place` or null («Не показывать») | A | P02 7307 |
| identity details | `role[]`, `format[]`, `seek[]` (≤5 each for role/format), person also `gender[]`≤5, `orient[]`≤5, `status` (single) — curated IDs only, no free text | person: per `details_vis`; couple: A | `IDENTITY_KEYS` 4980, `toggleIdentityValue` 4992, `COUPLE_FIELDS` 7251 |
| profile_media_refs | ordered list ≤**6** refs to own **public** (`aud=all`) media; ≤1 video, never first | A (approved only); O also sees «На проверке» | `refRules20` 7371, `PUB_MAX` 6, ME-006 9194 |
| avatar | = first photo ref, approved; couple without photo → split circle of members' avatars | A | `av` 4115, `ownAv21` 9197 |
| priv_on | bool, default **true** (on but empty) | O | `privOn!==false` 7029 |
| priv_text | rich text ≤1000 | G(info) | `peSave` 7478 |
| requests_from | `all` \| `matches` \| `none`, default `all` | O (Sys enforces) | `reqFrom` 7488, `requestReason` 4514 |
| social_likes | bool, default true («Принимать симпатии из профиля», independent of Discover) | O | `k4social` 8280 |
| activity_vis | `all` \| `followers` \| `off`, default `all` | O | `ACT_VIS` 7507, `k4act` 8279 |
| mentions_from | `all` \| `follow` \| `none`, default `all` | O | `MENTION_FROM` 6119 |
| show_likes | bool, default true (likes visible to followers/activity) | O | `k4likes` 8278 |
| links_from | `all` \| `follow` \| `none`, default `all` | O | `LINKS_FROM` 5904 |
| dating | bool, default **true** for new person & couple | O | `newMe` 3653, `pairDefaultsHTML` 8465 |
| dating_visible | bool, default **true** | O | AUTH-019 3653 |
| revision | bigint, CAS for every profile write | O | `P.revision` 4032 |
| created_at, updated_at | | Sys | |

Person‑only: `handle` (nick) — 3–20 chars `[a-z0-9_.]`, starts/ends alnum, no `..`, ≥1 letter, unique **case‑insensitive across all profiles**, reserved list (admin/support/moderator/feture…) (`V.nick` 4452 + V21 8972–8973, `TAKEN` 4451); `show_age` bool (default true for existing, **false** in `newMe` 3652 — see Q7); `details_vis` `only`|`granted`|`all`, **default `only` for new accounts** (AUTH-016, 5609, 8959); `photo_check` (1.10).
Couple‑only: `name` 2–60 chars (default «A и B», 8575; editable), no handle (`nick:'couple'` 4017), age always null, `status='couple'`, members' gender/orientation/ages shown read‑only from personal profiles (P02 7308 «Из личных профилей»).

Derived (never stored as truth): `age` = from account DOB if `show_age` (`ownedAsPerson` 4015); `verified` badge = account age check ok (4015 `verified:m.ageCheck==='ok'`) — note `pv` (photo) badge separate; Discover eligibility (1.9).

Invariants: profile data never contains email/DOB; a field set to `only`/`granted` is never in public projections (P03 masking 8965–8967); identity choice IDs come from an admin catalog ("Curated identifiers; user input cannot create new taxonomy entries" 3472).

### 1.5 `place` (city catalogue) — owner: system; `place_submission` — owner: profile→staff
City: id, country, ru/en names, coarse lat/lon. User may add a missing city after choosing the country; it is used immediately and **checked by staff** («Проверим написание» `typedCity` 5426). Location for «Рядом»: only coarse coords rounded to **0.05°** (`requestCoarseLocation` 5427–5430), distances shown rounded to 5 km, min «около 5 км» (`placeLine` 4700, `nearbyDistance` 5402). Coords live in the dating filter of the acting profile (`dfGeo` 6848), not in the profile (S.me.location is read‑only in V21 — implied store). D11: never project exact coordinates.

### 1.6 `couple` (pair) — owner: couple profile; members: 2 accounts
| Field | Type | Visible | Evidence |
|---|---|---|---|
| couple_profile_id | = profile_id (kind couple) | A | `startPair` 8575 |
| member_account_ids | exactly 2, distinct; each account in ≤1 `active`/`dissolved` couple | O | `pairInviteIssue` 8487 (`pairOf`) |
| since | timestamptz | A (implied «вместе N») | `since` 3712 |
| status | `active` → `dissolved` → (`active` by double restore \| `deleted` after 30 d) | O | `dissolvePair` 4517, `expirePair` 4518, `requestPairRestore` 4524 |
| ended_at, restore_until | ended_at + **30 days** | O | 4517 |
| restore_consents | set of member accounts (need both) | O | 4524 |
| approval_required[member] | bool per member, default **false** ("каждый может менять, партнёру уведомление") | O (each sees both) | `pairApprovalRequired` 4559, `setPairTrust` 4561, Q09 8561 |
| safety_epoch | int, ++ on every immediate narrowing (hide, close access, dissolve) — invalidates pending grant approvals | Sys | `pairSafety` 8540, `queueJointGrant` 4553 |
| approval_epoch | int, ++ on approval‑setting change | Sys | 4561 |
| draft lease (prototype) | draft_by, lease, draft_version | O | `editableProfile` 4019 — see Q12 |
Couple owns: profile, couple interests + history, private part (text/media/interests), grants/requests, follows/followers, likes in/out, matches, couple chats (both members read & write as couple), blocks `by:couple`, hidden‑in‑feed, community memberships/RSVPs as couple, links, posts/discussions/events authored as couple, dating filters/deck history (`social()` 4059, guide §5.2). Each person keeps: account, person profile and everything above for `me`. A **new couple starts empty** (CPL-003, 7445; `startPair` 8575 never copies old grants/chats/drafts).

Lifecycle:
- `active` → `dissolved`: either member, immediately, confirm dialog (Q06 8544–8550). Effects: couple hidden from Discover/search, all couple grants revoked, outgoing couple requests `revoked`, incoming closed, pending approvals/proposal cancelled, approval settings reset, couple chats ended (read‑only for both, media URLs dropped), couple posts hidden (`hiddenByPair`), actor switched to `me` (4517).
- `dissolved` → `active`: both members consent within 30 days; restored couple has **dating off** (4524).
- `dissolved` → `deleted`: at `restore_until` (job) or when a member creates a new couple (confirm «Восстановить будет нельзя» 8557). Effects (4518–4522): profile/drafts/social store deleted; name → «Удалённый совместный профиль»; couple posts hidden + media removed; couple comments/discussion bodies blanked; couple threads retain only the counterparty's messages for the counterparty (implied retention); members keep a text‑only **pair history** archive (`S.pairHistory` 8571, Q10 8559) and a read‑only joint archive while `dissolved` (Q08 8618).

### 1.7 `couple_invitation` — owner: inviter account
Fields: id, inviter_account, invitee_account (resolved by **exact** personal nick, `@` stripped, case‑insensitive) or link token for a not‑yet‑registered partner (`pairShareLink` 8489, implied token), status `pending` → `accepted` | `declined` | `withdrawn` (+ `expired` implied, none in V21), created_at, answered_at.
Rules (`pairInviteIssue` 8487, `v6PairInvite` 8488): not own nick; format check before existence (CPL-012); not a couple profile; invitee not already in a couple; inviter has no active couple; one pending outgoing per inviter; visible + withdrawable (Q01 8472, `v6PairCancel` 8490); decline is stored and shown to the inviter («приглашение отклонено» 8476, `pairDeclined` 8578, CPL-013); invitee answers in «Нужно решить» (`todoItems` 7939) with the defaults shown (`pairDefaultsHTML` 8465). Incoming invite is hidden if the inviter is blocked (7939) — server must also refuse sending to/from blocked (not checked in 8487, Q15).
On accept → `couple` created, both get `pairCreated`; acceptor goes to Q09 «Настройка пары» (my approval + who may ask for access) (8577, 8567).

### 1.8 `partner_approval` (jointQueue + profile proposal) — owner: couple profile
| Field | Type | Evidence |
|---|---|---|
| id | UUIDv7 | `jointQueue` 4536 |
| couple_profile_id | FK | `q.pairId` |
| kind | `profile_change` (profile text/photos/interests/details/**widening visibility settings**/private part), `post`, `discussion`, `event`, `rsvp`, `grant` | 4028, 4540, 4550, 4553 |
| subject_id | post/event/request id (null for profile) | |
| version | int, ++ per resubmission | 4540 |
| payload | full proposed snapshot (profile) or draft (post) or {scopes, until, viewers} (grant) | 4028, 4553 |
| base_revision | couple profile revision at submit | 4028 |
| safety_epoch, profile_revision | for grants: must still match at approval | 4553, 4542 |
| created_by_account | member | `q.by` |
| status | `pending` → `approved` \| `returned` (note ≤300) \| `cancelled` (by author) \| `superseded` (new version/edit) \| `cancelled_by_dissolve` | 8532–8534, 8613–8614, 4517 |
| decided_by_account, decided_at, delegated | delegated=true when auto‑applied because the partner doesn't require approval | 4032, 4563 |
Rules: author can't approve own item (4033, 4542); approval requires `status=active`, same couple, same version, same base revision (else «Версия уже изменилась» 8528); when the other member has `approval_required=false`, the change applies immediately and the partner gets a notification (`pairTrusted` 4560, `coupleQuickSubmit` 4027); **grants of the couple's private part always need both** («Приватную часть пары открывают только вдвоём — здесь подтверждение нужно всегда», `approvalCopy` 8621; `grOk` 7187 always queues); one pending profile proposal at a time; narrowing changes while a proposal is pending apply immediately and cancel the proposal (`pairSafety` 8540 sets `proposal=null`). The reviewer sees a field diff with word‑level text diff (`proposalDiff` 8511, `wordDiff21` 9265) and a full preview (P03 preview).

### 1.9 Dating mode (on profile) and Discover eligibility
Three states (ME-002): `visible` = dating ∧ dating_visible; `hidden` («смотрю незаметно») = dating ∧ ¬dating_visible; `off` = ¬dating (`k4mode` 8439, `pairMode` 7592).
- Person `off→visible` without approved photo becomes visible‑but‑not‑shown («Без фото тебя не видно» 7024) — `enableDating` 6642 instead sets dating_visible=hasPhoto (Q9).
- Removing the last public profile photo while `visible` must ask and switch to `hidden` (`phLastGuard21` 9183, ME-004).
- Turning off keeps matches, chats and grants (`k4off` 8282).
- Couple: `off` and `visible→hidden` immediate by either member; `→visible` requires **both members 18+ verified** (7595, 7602) and partner approval if required.
- Server eligibility for the deck (implied, AUTH-019): `dating ∧ dating_visible ∧ ≥1 approved public photo ∧ account(s) not restricted ∧ not blocked either way`; `hidden` never appears in any deck; acting‑profile switch invalidates in‑flight deck decisions (`datingEpoch` 4069 — client token; server: decisions carry acting profile id).

### 1.10 Verification
**age_check** (owner account): states `none` → `pending` → `ok` (+ engine states `rejected`, `expired`, `revoked`); method `selfie` | `document`; result arrives as notification (`ageResolve` 5666, NTXT.age 8952). Required only where an admin policy demands it (per country, implied) for: sending private‑part requests and "особые медиа" (A07 lead 5670, `needAge` 5651 gated by `QA.ageRequired`, `reqAccess` 7125). Selfie/doc never becomes avatar or post (5654–5655). Couple Discover requires both members 18+ (7595).
**photo_check** (owner person profile): `none` → `pending` → `ok` | `rejected` (+reason) ; `checked_at`; random gesture prompt (`PV_POSES` 8372); requires an approved profile photo first (`pvShot` 8388); selfie never published, deleted after decision (LEGAL 8988); badge "photos show this person" — not age, opens nothing (8374); badge removed if the main photo stops showing the person (8376). Visible: badge A; status/reason O.

### 1.11 `interest` (jar) — owner: profile (person or couple)
| Field | Type | Visible | Evidence |
|---|---|---|---|
| profile_id, topic_id | PK; topic from admin catalogue (some topics admin‑hidden) | | `TOPICS`, `ADMIN_HIDDEN_TOPICS` 3451 |
| value | int **1–10** or mark `discuss` («обсуждаемо») / `hard` («табу», stored lv 0) | per vis | `answerHTML` 8002, `jarFrom` 8000 |
| dir | subset of {give,get,watch}; null/all three = «Всё»; only for numeric values and topics outside the `limits` category | per vis | `toggleDir` 8009, `hasDir` |
| vis | `public` («Видят все») \| `granted` («По доступу», opens with scope info) \| `only` («Только ты/вы») | O | `visChipsHTML` 8085 |
| revision, updated_at | | Sys | |
Rules: public taboo is shown to others only as «нельзя» without details (8125); couple interests are separate from members' (never copied, 7000 empty text); quizzes no longer write interests (ME-041). Owner decision text says "0–10" — V21 uses 1–10 + two marks (Q10). Seed field `real` is unused — drop.

### 1.12 `interest_history` — owner: profile; visible O only («Видишь только ты» X04 8078)
Row: topic, from, to (value/mark/'—'), dir, kind `value`|`vis` (ME-049 8077), src `manual` | `test_archived` («из теста (архив)»), at. Kept when an interest is removed (`jarDel` 8134). History screen link shown for `me` only (7000), couple history exists in model (`coupleProfile().history`).

### 1.13 Private part
= `priv_on` + `priv_text` + private media (media_asset with audience `granted`, max **12 photos + 6 videos** `PRIV_MAX` 7216) + interests with `vis=granted`. Scopes (`REQ_SCOPES` 3628, ME-025 owner decision): `info` («Описание и интересы» — text + granted interests), `photos`, `video`. Only scopes the part actually has are offered (`privScopesOf` 7223, `grantScopes21` 9218). Viewer sees media with a per‑viewer watermark `@nick` (7230–7231) — server‑side watermark implied. Turning off = one procedure: revoke every grant, close every open request (new ones too, `closed_by=priv_off`), with counts in the confirm (`privRevoke21` 9188, `privOffAsk21` 9190); content is kept; nobody can request while off; granting while off offers to turn on (7179). Turning on → editor (7244).
Couple–person rule (found, Q11): `allowedScopes` 3630 — a couple asking a person may request only `info`; a couple grants photos/video only to couple viewers.

### 1.14 `access_request` — owner: requester profile (target sees it)
Fields: id, requester_profile_id (acting), target_profile_id, viewer_account_ids (snapshot of requester members), scopes ⊆ {info,photos,video} (stored in canonical order, PRF-016), created_at, status, decided_at, closed_by.
States (requester view `REQ_STATUS` 7149 / owner view 7152): `pending` → `granted` | `partial` (subset) | `declined` («решили не открывать») | `cancelled` (by requester; quota attempt not refunded 7142) | `closed` (target turned private part off / blocked / couple dissolved → `revoked`) ; `granted|partial` → `expired` at `until` (derived, `effectiveRequestStatus` 4360) | `revoked`.
Limits: one pending per (requester, target) (7126); re‑ask after decline only after cooldown (**7 days** in `requestReason` 4514 vs **30** `REASK_DAYS` 3402 — Q2); quota **10 new requests per rolling 24 h per account** counting both own and couple requests (`quotaLeft` 4380, `limitSheet` 7141; paywall moment B02); target's `requests_from` policy (`matches` = mutual like with the acting profile); not to own couple member/related profile (`relatedFor` 4357); not when blocked; age check if policy requires. A request sends no message and opens no chat (7135).

### 1.15 `access_grant` — owner: granting profile
Fields: owner_profile_id, viewer_profile_id, viewer_account_ids, scopes, until (`null` = until revoked, or +1 day, or +7 days — `grTerm` 7185 '0'/'1'/'7'), request_id, granted_at, revoked_at, owner_profile_revision (couple; grant tied to revision 4362), approved_by (couple: both).
Rules: one active grant per (owner, viewer); a new grant replaces the previous («Новый доступ заменит прежний» 7182); narrow in place (`nwOk` 7195) — empty narrow = revoke; widening only via a new request; revoke one / revoke all (`revoke` 7191, `revokeAll` 7168); revocation stops new views immediately (what was seen can't be recalled); block revokes both directions (scoped-access.md, `doBlockData` 7106); grant does not open chat or send a like (7178). Received grant is valid only if: viewer account ∈ viewer_account_ids, acting profile = viewer profile, not blocked, not expired, owner `priv_on` (`receivedGrant` 4361).

### 1.16 `profile_link` («Связи») — owner: both profiles (scope boundary with social domain)
Fields: id, a_profile, b_profile, kind `partner|play|ds|mentor|meta|friend`, side roles for ds (dom/sub) & mentor (mentor/mentee), status `pending` → `ok` | removed; pending `change` {kind, side, by}; per‑side vis `all|followers|us`, effective = most private (`linkVis` 5930); max **30** per profile (`LINK_MAX` 5905); target's `links_from` policy; not with own couple partner (5934). Visible per effective vis; pending only to the two sides (5902–5983).

### 1.17 `notification_settings` — owner: account (implied: applies to deliveries for both own profiles)
`mode` `safe` (default: no names/text on lock screen) | `normal`; `push` bool (true); `email` bool (true); `digest` `instant`|`daily`(default)|`weekly`; `quiet` bool (true) `from` 23:00 `to` 08:00 (30‑min steps), user time zone (implied); per category {push,email}: match{1,1}, likes{1,0} (grouped ≤ hourly), req{1,1}, events{1,1}, replies{1,0}, follows{1,0}, groups{0,0}, news{0,1} (`notifDefaults` 8285, K05 8286–8309). Security alerts bypass settings. Saving is server‑confirmed, offline shows Retry (SET-015 9002). `notify_dating_launch` bool (People «Скоро» teaser, `notifyDating` 6653).

### 1.18 `premium_entitlement` & `premium_gift` — owner: account
Entitlement: account_id, source `purchase`|`gift`, plan `month`|`year` (gift: 1/3/12 months), status `active`, `renewal_cancelled` (`premiumCancelled` 8363), `expired`; period_end; store/processor ref (D9: IAP / adult processor). Gifts have no auto‑renewal and nothing to cancel (8355).
Gift: id, from_account, recipient profile (person → that account; couple → **both member accounts**, price ×2), plan, anonymous bool («подарок от участника FetUre»), queued_after (recipient already Premium → starts after current period), paid_at (`giftPayDo` 8426, `giftSheet` 8403–8410). Rules: exact nick only; not self; not blocked; confirm step before payment (SET-013); gift opens no chat/like/private part (8409). Premium features (admin‑configurable list 8340–8341): undo passed profiles 7 days, full viewing history 7 days. Premium never boosts, never bypasses privacy (8358).

### 1.19 Consent receipts / legal documents — owner: account (keep existing)
Terms + privacy acceptance required at sign‑up (A04 `saveA04` 5598); readable before accepting (AUTH-004/015); final texts edited by owner in admin (AUTH-015).

### 1.20 `data_export_job`, `account_deletion` — owner: account
Export: async archive to email "usually within 24 h" (K07 8327; the 8451 client download is a prototype stub). Deletion: confirm by typing own nick (case‑insensitive, Enter submits, SET-009 8331); deletes person profile + interests; sent messages stay with recipients under retention rules; if in a couple → couple unlinked, partner account stays (8328).

---

## 2. Commands (writes)
Common for all: `operation_id` (idempotency receipt, payload hash; replay returns original result — existing pattern), `acting_profile_id` where marked **[actor]**, `expected_revision` where marked **[CAS]**. Every row writes `acted_by_account_id`. "Couple: approval" = goes to `partner_approvals` when the other member requires approval; "immediate+notify" = applies now, partner gets `coupleAct`.

### 2.1 Auth & account
| Command | Input | Who | Effects / rules | Errors |
|---|---|---|---|---|
| `auth.code.request` | email | anyone | sends 6‑digit code, 10 min TTL; per‑email throttle | `rate_limited{retry_after}` (5525), `invalid_email` |
| `auth.code.verify` | email, code | anyone | known email → session; unknown → `signup_ticket` (A04 next); 5 wrong → lock | `code_wrong{left}`, `code_locked`, `code_expired` (5563–5564) |
| `auth.oauth.complete` | provider, provider token | anyone | existing identity → session; new → signup_ticket with provider email (Apple relay allowed) | `provider_error` |
| `account.create` | signup_ticket, nick, dob, accept_doc_ids[], news_opt_in | signup ticket | validates nick (unique all profiles), DOB real date ≤110 y; age<18 → **nothing stored except u18 counter**, return `under_18`; second attempt after u18 requires `dob_confirmed=true` (AUTH-023); creates account + person profile with defaults (dating on/visible, details_vis=only, priv_on, requests_from=all, chat_blur, notif defaults) + consent receipts | `nick_invalid`, `nick_taken`, `dob_invalid`, `under_18`, `terms_required` |
| `onboarding.complete` | details_vis, identity fields, dating on/off, with_partner?, topics[], communities to join/request[] | new account | writes profile fields (details default only); dating off → dating=false,dating_visible=false; queues community joins/requests (sent now, AUTH-022); topics → first feed filter (feed domain); with_partner → client goes to Q01 | — |
| `auth.method.link/unlink` | provider | O | can't unlink the only method (8317) | `last_method` |
| `account.email.change.start/confirm` | new_email / code | O | sign‑in stays on old email until confirmed (8321) | `same_email`, `email_taken`, `code_wrong` |
| `auth.session.revoke` | session_id \| `others` | O | ends session; security alert | — |
| `auth.logout` | — | O | revokes current session | — |
| `account.settings.update` | lang_pref?, chat_blur?, news_opt_in? | O | server‑confirmed (SET-015) | — |
| `notifications.settings.update` | full settings object | O | validates 30‑min steps, enums | — |
| `account.export.request` | — | O | job → email link (rate‑limited, implied) | `rate_limited` |
| `account.delete` | confirm_nick | O | dissolve/leave couple (Q20), delete person profile & owned data per retention, revoke sessions/grants, cancel renewal is store‑side | `confirm_mismatch` |

### 2.2 Profile («Я»/«Мы» profile layer, P02)
| Command | Input | Who | Effects / rules | Errors |
|---|---|---|---|---|
| `profile.update` **[actor][CAS]** | person: nick, bio, city_id, show_age, gender[], orient[], role[], status, format[], seek[]; couple: name, bio, city_id, role[], format[], seek[] | member of actor | person: immediate; nick re‑validated (uniqueness) only if changed (ME-032); couple: approval (profile_change) unless partner trusts → immediate+notify | `nick_taken`, `too_long`, `revision_conflict`, `couple_inactive`, `approval_pending` (one at a time) |
| `profile.details_vis.set` | `only`/`granted`/`all` | person O | immediate (narrowing or widening — person only) | — |
| `profile.media_refs.set` **[actor][CAS]** | ordered media ids | O | only own public approved‑or‑in‑review media; ≤6, ≤1 video, video not first (auto reorder); if last photo removed while `visible` → requires `confirm_hide=true` and sets dating_visible=false (ME-004); couple: approval | `limit`, `not_public`, `confirm_required` |
| `profile.city.submit` | country, name | O | creates place pending staff check, usable now | — |
| `profile.visibility.update` **[actor]** | one of social_likes, activity_vis, mentions_from, show_likes, links_from, requests_from | O | person immediate; couple: **narrowing immediate+notify, widening approval** (order closed→open, `coupleSetting` 7583); blocked while a profile proposal is pending/unsaved for widening (7586) | `approval_pending` |
| `dating.mode.set` **[actor]** | `visible`/`hidden`/`off` | O | person: immediate; `visible` w/o approved photo allowed but not shown; couple: `off`/`hidden` immediate (safety_epoch++ , cancels proposal), `visible` needs both 18+ and approval | `age_check_required{members}` (7595), `approval_pending` |
| `private.toggle` **[actor]** | on/off, confirm_counts | O | off: revoke all grants, close all open requests (`closed_by=priv_off`), return {revoked, closed}; couple off = `pairSafety('sharing')` immediate (+ requests_from=none, 8540); on: immediate for person, couple approval (widening, implied) | `confirm_required{grants,requests}` |
| `private.text.update` **[actor][CAS]** | text ≤1000 | O | couple: approval | — |
| `private.media.*` | add/remove/reorder/crop media with audience granted | O | ≤12 photos, ≤6 videos; via media_asset (other domain) | `limit` |
| `profile.link.*` | propose/answer/change/remove/vis | O | see 1.16; couple accepting → partner notified (5954) | `links_from`, `limit`, `blocked` |

### 2.3 Interests
| Command | Input | Who | Effects | Errors |
|---|---|---|---|---|
| `interests.set_many` **[actor][CAS per topic]** | [{topic, value, dir, vis}] (batch from picker, review step) | O | upsert + history rows `src=manual` (8113); couple: profile_change approval (coupleQuickSubmit) | `unknown_topic`, `dir_not_allowed`, `revision_conflict` |
| `interests.set` | topic, value, dir, vis | O | one jar sheet; vis change writes `kind=vis` history (ME-049) | same |
| `interests.delete` | topic | O | removes, history kept | — |

### 2.4 Access (private part)
| Command | Input | Who | Effects / rules | Errors |
|---|---|---|---|---|
| `access.request` **[actor]** | target_profile_id, scopes[] | acting profile member | checks 1.14 limits; creates request; notifies target (person or both couple members, `req`); couple requester: both members notified `reqSent`; quota −1 | `pending_exists`, `reask_cooldown{days}`, `quota_exhausted{next_at}` (paywall), `not_accepting`, `age_check_required`, `unavailable` |
| `access.request.cancel` | request_id | requester profile member | status cancelled; quota not refunded | — |
| `access.grant` **[actor]** | request_id, scopes ⊆ requested ∩ available, term `none`/`1d`/`7d` | target profile member | person: grant created/replaced, request→granted/partial, notify requester `grant`; couple: creates approval kind `grant` (always both), request shows «Ждёт подтверждения партнёра» | `private_off` (offer enable), `request_closed`, `blocked` |
| `access.decline` | request_id | target member | status declined, requester notified «решили не открывать», undo 4 s (client delay, implied) | — |
| `access.narrow` | viewer_profile_id, scopes | owner member | immediate (narrowing) both person & couple | `grant_ended` |
| `access.revoke` / `access.revoke_all` **[actor]** | viewer / — | owner member | immediate; couple revoke_all = pairSafety sharing | — |

### 2.5 Verification, Premium
| Command | Input | Who | Effects | Errors |
|---|---|---|---|---|
| `verification.age.start` | method selfie\|document | account | creates provider attempt (existing engine), returns hosted URL | `pending_exists`, `provider_unavailable` |
| (webhook) `verification.age.result` | provider event | Sys | state ok/rejected; notification `age` | — |
| `verification.photo.submit` | selfie upload (quarantine media, never public), pose_id | person O with approved photo | photo_check=pending → staff/provider queue | `no_profile_photo`, `photo_in_review` |
| `premium.purchase` / `premium.restore` | store receipt | account | entitlement active (IAP/processor verifies) | `payment_failed` (not charged) |
| `premium.renewal.cancel/resume` | — | account | store‑side; mirror status | — |
| `premium.gift` | recipient nick, plan, anonymous | account | payment confirm step; entitlement(s) for recipient account(s), queued if active; notification `gift` | `not_found`, `self`, `blocked`, `payment_failed` |

### 2.6 Couples
| Command | Input | Who | Effects | Errors |
|---|---|---|---|---|
| `couple.invite` | partner_nick | account without couple | invitation pending; notify invitee (`pairInvite`, «Нужно решить») | `nick_format`, `not_found`, `self`, `is_couple_profile`, `already_in_couple`, `invite_pending`, `blocked` |
| `couple.invite.link` | — | same | returns invite token URL (sign‑up then auto‑invite) | — |
| `couple.invite.withdraw` | invitation_id | inviter | withdrawn | — |
| `couple.invite.answer` | invitation_id, accept\|decline | invitee | accept → couple active with defaults (dating on/visible, approvals off, empty content, name «A и B»), both notified `pairCreated`; decline stored, inviter notified `pairDeclined` | `stale` (inviter now in couple/blocked) |
| `couple.setup` | my_approval_required, requests_from | member after create | Q09; requests_from via normal path | — |
| `couple.approval_setting.set` | required bool | member | sets own flag; approval_epoch++; partner notified trustOn/Off | — |
| `couple.proposal.submit` | (implicit in couple profile writes) | member | 1 pending; payload snapshot + base_revision | `approval_pending`, `revision_conflict` |
| `approval.approve` | approval_id, version | the other member | applies payload (re‑validated: blocks, community rights, revision/safety epoch); notifies author `workApproved`/`profileApproved` | `version_changed`, `self_approval` |
| `approval.return` | approval_id, version, note ≤300 | the other member | status returned; author notified `returned`/`workReturned` | `version_changed` |
| `approval.cancel` / `approval.edit` | approval_id | author | cancelled / superseded (new draft) | — |
| `couple.hide_from_discover` | — | any member | immediate, safety_epoch++ | — |
| `couple.close_private` | — | any member | immediate: revoke grants, close requests, requests_from=none | — |
| `couple.dissolve` | confirm | any member | 1.6 effects; partner notified `dissolved` | — |
| `couple.restore.consent` | — | member, within 30 d | 2nd consent → active (dating off); else partner notified `restoreRequested` | `expired` |
| `couple.create_new` (while dissolved) | confirm | member | deletes old couple (no restore), opens invite | — |
| `actor.set` | `me` \| couple_id | member | **client/session preference only**; server validates per request, does not store as authority (implied: may persist last choice per device) | — |

---

## 3. Queries (reads)
| Query | Input | Projection (viewer‑dependent) | Paging |
|---|---|---|---|
| `me.summary` | — | account basics, person profile (owner view), couple (status, partner, name, avatar, approvals waiting, my/partner approval settings), invitations in/out, per‑profile waiting counts (likes, requests) for «Действовать как» (`actorWaitLine` 8043), «Нужно решить» count | — |
| `profile.view` | target_profile_id, acting_profile_id | public: name/nick, age if show_age, city, distance (coarse, only if viewer uses «Рядом»), bio, approved media refs, badges (18+, photo), identity details only if details_vis=all (person) or always (couple), public interests (taboo as «нельзя»), links per vis, follower counts; private section as **veil** or opened scopes for G; blocked/deleted → `unavailable` (no name, PRF-023) | — |
| `profile.preview` («Как видят») | lv `all` \| `granted` \| `card`, optional proposal preview | owner sees the exact projection a visitor/grant holder/Discover card would get; "Что у вас общего" computed with a sample viewer, inert (CPL-023 9213) | — |
| `profile.private.view` | target, acting profile | only granted scopes, media with viewer watermark, `until` shown | — |
| `interests.list` | profile (own or other) | own: all + vis; other: public (+granted if `info` scope); couple member sees couple's all | — |
| `interests.history` | own profile | O only; archived quiz rows labelled | cursor 30 |
| `access.incoming` | acting profile | new requests (excluding blocked; couple: excluding those awaiting partner) | cursor |
| `access.lists` | tab `byme` \| `withme` \| `out`, filter pending | own metadata only (no private values); statuses incl. derived expired; quota left/max | cursor 30 |
| `nick.check` | nick | `available` \| error code (debounced 450 ms client) | — |
| `couple.approvals` | — | pending/returned items for both members with diff payload | — |
| `couple.archive` | — | while dissolved: joint posts read‑only without media; after deleted: text‑only history per member | — |
| `settings.read` | — | account settings, notification settings, sign‑in methods, sessions | — |
| `verification.status` | — | age: none/pending/ok/rejected/expired + where required; photo: state/reason/checked_at | — |
| `premium.status` | — | plan, period end, renewal cancelled, gift {from (or anonymous), until}, gifts sent (queued flag) | — |
| `blocks.list` | acting profile | blocks of that profile only («Блоки пары» vs personal, P12 8332) | cursor |

---

## 4. Notifications and «Нужно решить» (this domain)
Addressee rule: events from other people to a couple reach **both** members; a member's own couple action reaches **only the partner** (`PAIR_EXTERNAL` 4037, `pairNotify` 4038). Each item carries addressee label «Тебе» / «Паре» (NTF-001/002). Decision items are counted in «Нужно решить», not as unread news (`notifNew` 4393).

| Type | Addressee | Text (gist) | Actions / target |
|---|---|---|---|
| `req` (todo) | target profile (couple: both) | «X просит доступ» | **Открыть доступ / Отказать** (`reqCardHTML` 7152) |
| `grant` | requester profile | «X открыл(и) доступ» | open private part (P08) |
| `reqDeclined` | requester | «решили не открывать» | — |
| `reqSent` | couple partner | couple sent a request | P07 couple out |
| `pinv` (todo) | invitee account | «X приглашает тебя в пару» | **Принять / Отклонить** |
| `pairDeclined` | inviter | invitation declined | Q01 |
| `pairCreated` | both | couple created | Q01 |
| `proposal` (todo) | partner | «X предлагает изменения профиля/видимости» | **Одобрить / Вернуть** with diff (CPL-016/017) |
| `profileApproved` / `profileUpdated` (delegated) | author / partner | applied | Q01 |
| `returned`, `workReturned` (todo for author) | author | returned with note | edit / cancel |
| `postApproval`, `eventApproval`, `rsvpApproval`, `grantApproval` (todo) | partner | needs approval | **Одобрить / Вернуть** |
| `workApproved` | author | approved | subject |
| `coupleAct` | partner | partner changed a couple setting/link (immediate) | Q01 / setting |
| `trustOn` / `trustOff` | partner | approval setting changed | Q01 |
| `dissolved`, `restoreRequested`, `restored` | partner / both | couple lifecycle | Q07 / Q01 |
| `link` (todo) | target profile | link proposal / change | **Принять / Отклонить** (`linkAnswer` 5954) |
| `linkOk`, `linkNo`, `linkgone` | proposer | result | P21 |
| `age` | account | «Возраст подтверждён» | A07 |
| `pv` | account | photo verified / failed with reason | V01 |
| `gift` | recipient account(s) | «Premium в подарок от X» (or anonymous) | B01 |
| security (`new_signin`, `deletion`) | account | always, discreet | — |

---

## 5. Moderation hooks
- **Profile photos / avatar / private media / couple photo**: via media_asset quarantine → scan → approve; owner sees «На проверке» on own header/dock/grid, others only approved (ME-006 9194); explicit label (D5) — explicit allowed only in private part and chats, never as profile photo (implied by D5).
- **Text fields**: bio, private text, couple name, nick — auto checks (implied; prototype has none) for contacts/minors/abuse; nick reserved list `TAKEN` 4451 is staff‑configurable.
- **Custom city** submissions → staff spelling check (5426).
- **Photo verification** → staff or provider review queue with reason codes; badge removal on main‑photo change (implied re‑check trigger, 8376).
- **Age check** → provider (Yoti) through existing engine; no admin toggle in production (age-assurance-decision.md).
- **Reports on profile/couple** (other domain) must target `profile_id` (person or couple) — Platform decisions: add targets «профиль/пара».
- **Under‑18 signals**: u18 attempts on an email/device (AUTH-023 path) — implied fraud signal for staff.
- **Premium gifts**: payment fraud handled by store/processor (implied).

---

## 6. Mapping to existing server
| Entity | Existing | Verdict |
|---|---|---|
| account | Core AppBase account store `a:<sha256(email)[:32]>` + device tokens (`identity.js` `authenticate`), `feture_profiles.account_hash` | **Rework**: separate FetUre `account` table with UUIDv7 `account_id`, email only for login (D2); keep Core device‑session validation pattern; add OAuth identities, sessions list/revoke, email change, U18 counter, lang/chat_blur/news opt‑in |
| login_code | Core email‑code flow (packages/core) | **Keep with changes**: 10 min TTL, 5 attempts lock, 30 s resend, per‑email throttle per V21 |
| person/couple profile | `feture_profiles` (display_name, about, dating_enabled), `feture_profile_details` (7 strings: nickname/about/pronouns/identity/orientation/relationships/city + public_fields/granted_fields), `profile.js`, `access.disclosure` | **Rework**: new `profile` (kind, members, state) + typed columns per 1.4; drop `pronouns`, free‑text identity, per‑field disclosure (replaced by `details_vis` + interest vis + private part); keep CAS revision + `feture_profile_operations` receipt pattern (`feture_profile_save`) |
| nick uniqueness | none (nickname free text 80, not unique) | **New**: unique citext handle over all person profiles + reserved list |
| place / custom city | none (city free text 120) | **New** catalogue + submissions |
| couple, invitations, partner_approvals | none | **New** (guide §5, D3 "общая таблица согласий партнёра") |
| dating mode | `feture_dating_preferences` (enabled, prefs jsonb) — unused | **Drop** table; fields on profile; deck in people domain |
| interests | `feture_interests` (catalogue), `feture_interest_states` (stance/experience/boundary/intensity 1–5/visibility/use_for_discovery), `feture_interest_operations`, `interest-model.js`, `interests.set/delete` | **Rework** values to 1–10 + discuss/hard + dir + vis(public/granted/only); owner `profile_id`; keep catalogue (add admin‑hidden flag, `limits` category), keep receipts |
| interest_history | `feture_interest_history` + trigger, `history.list/clear` in `journal.js` | **Keep** pattern; owner profile; `source` manual\|test→`test_archived`; add `kind vis`; `history.clear` not in V21 (keep server‑side or drop — Q24) |
| journal | `feture_journal_entries/operations`, `journal.js` | **Freeze**: V21 has no journal screen (only welcome slide «Дневник — только я» 5453) — Q23 |
| access requests/grants | `feture_access_requests` (scopes `profile:*`/`interest:*`, can_message, 7‑day request expiry, one pending), `feture_scoped_grants` (1–90 days, replaces on new), `access.js` | **Rework**: owner/viewer = profile + viewer_account_ids; scopes `info/photos/video`; drop `can_message` (chat only by mutual like); terms none/1d/7d (Q3); statuses partial/closed/revoked; requester quota 10/24 h; cooldown; couple grant approval; `access.preview` → `profile.preview` lv all/granted/card; keep replay/idempotency and block‑revokes‑both‑ways semantics |
| blocks | `feture_blocks` (account pair), `feture_pair_blocked` | **Rework** to profile pairs with `by` profile; "И для пары / И для меня" explicit extension (PRF-001, `blockBoth` 8333) |
| eligibility gate | `permissions.requireAdult` (actor.verifiedAdult only from QA), `access-guard` (adult + current consents), `feture_peer_eligible` (production proof + consent) | **Rework**: base usage = DOB‑based 18+ self‑declaration + accepted docs; provider proof only where policy requires (private requests/explicit media/couple Discover). Today every guarded action fails for real users |
| age verification | `verification-engine.js`, `verification-store.js`, `feture_verification_attempts/events/policies`, `verification.status` | **Keep** engine/store (account‑owned); add method, country policy, UI state mapping, result notification, provider (Yoti) |
| QA adult access | `qa-adult.js`, `feture_qa_adult_access/events` | **Keep** prelaunch‑only; never shown as verified |
| photo verification | none (`feture_photo_review_consents` is for post photos) | **New** |
| documents/consents | `documents.js`, `documents-admin.js`, `public-documents.js`, `feture_document_versions/drafts`, `feture_consent_receipts` | **Keep** |
| notification settings | none (`features.notifications=false`) | **New** (also needed by S5) |
| premium/gifts | `api/billing.js` stub, Core client, `products: []` | **New** entitlement layer (D9) |
| profile links («Связи») | none | **New** |
| follow/mute | `feture_public_authors`, `feture_author_relationships` (account‑owned) | **Rework** to profile (social domain) |
| shares/comparisons | `shares.js`, `comparisons.js`, `feture_share_links/comparisons` | **Freeze/off** — not in V21 |
| questionnaires/tests | `questionnaires*.js`, `feture_test_*` (~190 KB SQL) | **Freeze** (owner: tests removed); keep data for archive labels |
| private metrics | `private-metrics*.js` (events incl. tests.*) | **Rework** event list later (tests removed); optional |
| dead tables | `feture_profile_access`, `feture_test_responses`, `feture_dating_preferences` | **Drop** |
| export/deletion | Core account deletion cascades on `account_hash` | **Rework**: async export job; deletion orchestrator incl. couple unlink, media purge, chat retention |

---

## 7. Open questions, ambiguities, unsafe‑to‑copy behaviour
1. **Account vs person profile names.** `pname('me')` uses `S.me.name||S.me.nick` (4011) and EVT-025 says "show my name", but there is no editable `name` field (P02 has only Ник 7304; `ownedAsPerson` name = nick 4015; comment 4010 "one public identity — the nickname"). Decide: nick only, or separate display name.
2. **Re‑ask cooldown** after decline: 7 days (`requestReason` 4514) vs `REASK_DAYS=30` (3402, used in toast 7189 and `reaskLeft` 7147).
3. **Grant terms**: grant sheet offers none/1 day/7 days (7185); welcome slide shows 24 h/7 d/30 d (≈5455); existing server 1–90 days, never "no limit". Is "без срока" allowed?
4. **Request expiry**: V21 shows `pending` indefinitely; existing server expires requests after 7 days. Decide.
5. **Quota scope**: 10 per 24 h counted over the account's own + couple's requests (4380) — does the partner's couple request consume my quota too (shared `S.pair.social`)? Per account or per profile?
6. **Scope `interests`** still appears in seeds (3690–3691), comment 3629 and `privScopesOf` 7223; owner decision ME-025 folds it into `info`. Server must accept only info/photos/video and migrate old `interest` scopes.
7. **`show_age` default**: `newMe` has `showAge:false` (3652) but P02 init uses `m.showAge!==false` → true for the editor (7286); onboarding never asks. Pick a default.
8. **`details_vis` coverage**: label says «Гендер, ориентация, роль, статус» (8962) but masking hides all `IDENTITY_KEYS` incl. format & seek (8965). Seed/old accounts default to `all` (8959), new ones `only`.
9. **Dating without photo**: onboarding sets `dating_visible=true` without a photo (8935), `enableDating` sets `dating_visible=hasPhoto` (6642). Server should compute deck eligibility from approved photo regardless of the flag; UI state «В знакомствах» vs «не видно» must come from server.
10. **Interest scale**: owner text "0–10 + direction"; V21 = 1–10 + «обсуждаемо»/«табу» marks (taboo stored as 0). Confirm storage `value smallint 1..10 NULL + mark enum`.
11. **Couple↔person scope rule** (`allowedScopes` 3630, `grantScopes21` 9218): couple may request only `info` from a person; couple photos/video can be granted only to couples. Not documented anywhere — confirm it is intended.
12. **Shared couple draft with lease** (`editableProfile` 4019, `coupleWritable` 4020, `pairClaimDraft` 8539): one member "holds" a server‑visible draft; the other sees a read‑only copy. Server option: keep drafts client‑local and only store proposals (simpler), or store a leased draft. Decide.
13. **Couple Discover requires both members 18+ verified** (7595, 7602) while person Discover requires no age check (`needAge` off by default 5651). Inconsistent; also the prototype checks `PEOPLE[P.with].verified`, not the partner's actual age check.
14. **Couple private‑part off**: `privSw` for couple calls `pairSafety('sharing')` (sets `requests_from='none'`) and also puts `privOn=false` into the draft (7039) — is turning it off immediate or an approval? Person turning off does not set `requests_from=none`. Make symmetric.
15. **Invitation safety**: `pairInviteIssue` (8487) doesn't check blocks; no expiry; link invite token semantics undefined (8489). Server must refuse when blocked either way and expire tokens.
16. **Dissolve is unilateral and immediate** (Q06) — intended (safety); but account deletion of a member: dissolve with 30‑day restore, or delete couple at once? (8328 says "разъединится").
17. **Post‑deletion retention**: `expirePair` keeps only the counterparty's messages (4518) and wipes couple posts' media, while Q06 promises "Совместные публикации остаются в закрытом архиве с именами обоих" (8546); `pairHistory` keeps text‑only posts (8571) and is shown only to `pairMember()==='me'` (Q10 8559) — each member needs their own archive.
18. **New couple vs dissolved one**: if one member starts a new couple while the old one is dissolved, the other member's restore right disappears silently (only the creator confirms 8557). Notify the ex‑partner (implied).
19. **Couple handle**: couples have no nick (`nick:'couple'` 4017). How are couples found in search, @mentioned, gifted by "exact nick" (gift to a couple works from a profile only, `giftTargets` 8399)?
20. **Premium in a couple (O3)**: gift to a couple = both accounts ×2 price (8406, #1277); whether Premium is shared in a couple and which member's Premium applies when acting as «Мы» (e.g., undo in couple deck) is undecided.
21. **Saved items** live on `S.me.saved` (G04 8202) for both actors, contradicting guide §5.2 (data belongs to the acting profile). Decide per profile.
22. **Notification settings scope**: K05 settings are on `S.me` (account); couple notifications arrive to both members under each member's own settings (implied). Confirm there are no per‑couple settings.
23. **Journal** exists on server and on the welcome slide, but V21 has no journal UI. Freeze or remove the slide.
24. **`history.clear`** exists server‑side; V21 has no clear action. Keep hidden or drop.
25. **Nick change policy**: person nick is freely editable in P02 (7476) — no cooldown, no reservation of the old nick, @mentions and invitation by nick can break or be hijacked. Recommend cooldown + old‑nick hold (implied safety).
26. **U18 retry** (AUTH-023, 5605, `u18Fix` 5615): the form can be resubmitted with a new date after the "under 18" screen with only a confirmation. Unsafe to copy as is: server should record the U18 event (no other data) and require stronger age assurance (provider) for that email/device on retry.
27. **Client‑side "server" behaviours not to copy**: `net()`/`run()` fake latency & success, `autoResolve`/`qaApproveAll`/`ageSchedule` auto‑approving checks (5665), `limit@`/`000000`/`999999` magic values (5525, 5563), `pairMember='partner'` / `pairViewAs` persona switch (8509, 8558), `seedOwnGallery`, `k7export` client download of the whole state incl. other people's messages (8451), `k7do` resetting state as "deletion" (8331), `privMedia` seeding demo media, `giftReceive` QA hook (8430). Epoch/ticket checks (`authorTicket`/`validAuthor` 4069–4070) are client stale‑UI guards — on the server the equivalents are revision/epoch columns checked inside the transaction.
28. **Watermark**: viewer‑specific `@nick` watermark (7231) must be applied server‑side at delivery, not by the client.
29. **Location**: prototype never stores exact coordinates (rounds to 0.05° before use, 5430); D11 says "exact stored separately". Prefer never storing exact coords.
30. **Photo verification capture**: V01 lets the user pick a local file (`pickLocalMedia` 8388) — real flow needs live capture/liveness to be meaningful.
31. **Age check result states**: A07 renders only choose/wait/ok; engine has rejected/expired/revoked — UI copy needed.
