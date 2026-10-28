# FetUre S1/S2 extraction — PEOPLE · DISCOVER · LINKS · BLOCKS · CHATS · NOTIFICATIONS · «НУЖНО РЕШИТЬ»

Source of truth: `apps/feture/docs/v21/prototype-v21.html` (line refs below are to that file unless noted), V21-INTEGRATION-GUIDE.md §5/§11, AGENTS.md. Read-only extraction; nothing in the repo was changed.

Conventions used here
- `profile` = person or couple profile (owner of everything below). `account` = a member login. In the prototype the acting identity is `me` / `couple` (`activeActor()` 4044, `actionAuthor()` 4054, `withActor()` 4056); a viewer's per-profile state is `social(actor)` 4059 (follows, likesIn/Out, matches, reqIn/Out, sharedByMe, threads, archived, muted, decided, history, filters.dating).
- Every write = `{acting_profile_id, acted_by_account_id}`; server checks the account is an active member of the acting profile and, for a couple, that the pair is `active` (`authorAllowed` 4067, `validAuthor` 4070 — ticket re-check after async steps).
- `related(A,B)` = the two profiles share a member account (`relatedFor` 4357). Related profiles never like/match/request/link each other (I and my own couple; I and my partner).
- `blocked(A,B)` = a block exists in either direction between A and B **or between A and any member of B / B and any member of A** (`isBlocked` 4356 expands couples to members via `realMembers`).
- Visibility marks: **O** owner (both members for a couple), **P** partner, **F** followers, **A** any signed-in eligible 18+ viewer, **M** matched profile, **G** granted viewer, **S** staff, **—** server-only.

---

## 1. Entities

### 1.1 `profile_social_settings` (owner: profile) — people-facing settings
Lives with the profile entity (owned by profile domain); listed here because this domain enforces it.

| Field | Type / values | Default | Visible | Evidence |
|---|---|---|---|---|
| `discover_mode` | `visible` \| `hidden` \| `off` (stored as `dating`+`dating_visible` in prototype) | `visible` for new person **and** new couple | O; `visible` is implied to A by appearing in deck | newMe 3653, coupleProfile 4017, k4mode 7024, pairMode 7592; AUTH-019 |
| `accept_profile_likes` (`socialLikes`) | bool | true | O (A sees only the presence/absence of a Like button) | k4social 8280, canLikeFrom 4093, acceptsLikes 6859 |
| `requests_from` | `all` \| `matches` \| `none` | `all` | O | reqFrom 7037, requestReason 4514 |
| `links_from` | `all` \| `follow` \| `none` | `all` | O | LINKS_FROM 5905, linkIssue 5933 |
| `activity_visibility` | `all` \| `followers` (= followers **and** matches) \| `off` | `all` | O | ACT_VIS 7507, activityShown 7511 |
| `show_post_likes_in_activity` (`showLikes`) | bool | true | O | k4likes 8278, profileView 6890 |
| `mentions_from` | `all`\|… | `all` | O | mentionsFrom 6122 (feed domain) |
| `private_part_on` (`privOn`) | bool | false until enabled | O | privEnable 7244, privRevoke21 9196 |

Couple rules: changing any of these on a couple profile is **narrowing → immediate + partner notified**, **widening → `partner_approvals`** unless the partner delegated trust (`coupleSetting` 7583, order index decides direction; `pairTrusted` 4560). Couple `discover_mode=visible` additionally requires **both members 18+ verified** (pairMode 7592). `off`/`hide` are immediate safety actions (`pairSafety('dating')` 8540).

Invariant: a profile in `visible` with no **approved** main photo is not served in Discover (`requiresDiscoveryPhoto` 4012, phLastGuard21 9187: removing the last photo while visible asks and switches to `hidden`; ME-004). Photo "in review" is visible only to the owner (phReview21 9204).

### 1.2 `account_settings` (owner: account) — per member, not per profile
| Field | Values | Default | Evidence |
|---|---|---|---|
| `chat_blur_incoming` | bool | true | k4blur 8276, chatMediaHTML 7870 |
| `notify` | `{mode: safe\|normal, push, email, digest: instant\|daily\|weekly, quiet: bool, from, to (30-min steps, user TZ), cat:{match,likes,req,events,replies,follows,groups,news}:{push,email}}` | mode `safe`, quiet 23:00–08:00, defaults per cat (notifDefaults 8285) | K05 8286 |
| `notify_discover_launch` | bool | false | notifyDating 6653 |
| `search_recent` | ≤6 strings, newest first, dedup | [] | gCommit 8244, gRm/gClearRecent | 
| `location` | coarse `{lat,lon}` rounded to 0.05° (~5 km) or city id; only on explicit request | null | requestCoarseLocation 5427 |

Note: AGENTS.md says user prefs live only on the server → `search_recent` is server-stored per account (implied).

### 1.3 `discover_filter` (owner: profile; one row per profile)
Fields (`S.filters.dating` 3706; dfApply 6826): `show: all|people|pairs`, `age:[min≥18,max≤99]`, `place_mode: city|nearby`, `city`, `coords` (coarse, nullable), `dist_km 5..100 step 5`, `gender[]`, `orient[]`, `format[]`, `seek[]`, `role[]`, `topics[]` (excl. limit/edge/safety categories, dfRows 6801). Visible: O only. Couple has its own filter (`social('couple').filters`). `nearby` without coords is invalid (dfApply rejects).

### 1.4 `discover_decision` (owner: acting profile)
`{profile_id, target_profile_id, decision: like|pass, source: discover|likes, decided_at, undone_at?}` — `decided[id]`, `dhist`, `history` (decide 6716, likePass 6762, ACT.restore 6837).
- Lifecycle: `none → like|pass`; `pass → none` (Undo, or «Вернуть» from history D09); `like → none` only via Undo before match. Undo skips matches (undoIndex 6722).
- Undo quota: 1 free (counter `undos`, never resets in prototype), then Premium (6723). History D09: free shows only the newest item, Premium 7 days (6831).
- Visible: O only. Never shown to target.

### 1.5 `like` (personal like; owner: sender profile)
`{id, from_profile_id, to_profile_id, source: discover|profile|likes, initiator_account_id (couple only), pair_epoch?, created_at, state: active|withdrawn|dismissed_by_target|matched}` (likePerson 6732, likesOut entry fields).
Distinct from **post likes / reactions** (feed domain); "social likes" in settings = accepting a personal like *from the profile page* without Discover.
Rules (likePerson 6732, canLikeFrom 4093, likeActor 4092, ACT.likeProfile 7082):
- not related, not blocked, not already matched, target exists.
- `source=discover`: sender `discover_mode≠off`.
- `source=profile|likes`, sender person: target couple ⇒ sender `discover_mode≠off` (PRF-003: "couples take likes only through Discover"); target person ⇒ sender `discover_mode≠off` **or** sender `accept_profile_likes`.
- target must accept: `target.accept_profile_likes && (target.discover_mode≠off || target.accept_profile_likes)` (person sender); couple sender requires `target.discover_mode≠off` and couple's own discover on.
- one active like per (from,to). Hidden-mode sender: the target still sees the sender's profile in their Likes (incogInfo 6643).
- If an active like exists in the opposite direction ⇒ **match** (consumes the incoming like).
Visibility: incoming likes visible to O of the target (free, no paywall: "D06 — likes, free to see and to answer" 6755) and as a chip «Ты нравишься» on the deck card (6668); outgoing list visible to O (couple list shows `initiator` name to both members, 6757).

### 1.6 `match` (owner: system, two-sided)
`{id, profile_a, profile_b, created_at, ended_at?, ended_by_profile?}`; one active per unordered pair. Created only by mutual like. Cannot be undone by Undo; ends by «Прекратить общение» (ecDo 7926), block, couple dissolution. Unblock does not restore (P12 8334). Visible: both sides (O) + chat members.

### 1.7 `access_request` / `access_grant` (owner: target profile = private-part owner)
Request `{id, requester_profile_id, owner_profile_id, scopes ⊆ {info, photos, video}, viewers: account_ids of requester (both members for a couple), created_at, status, updated_at}`.
- Requester-side statuses: `pending → granted|partial|declined|cancelled|expired` (REQ_STATUS 7149; `partial` = granted ⊂ asked; `expired` derived from `until` 4360).
- Owner-side: `new → open|no` (grOk 7186, declineReq 7189); couple owner: `new → (pending partner approval) → open` (queueJointGrant 4553, approveJointWork 4541).
- `info` also opens the private **interests** (owner decision 27.10, ME-025; scopeLabel21 9219). Seed data still carries `interests` scope (3690) — legacy.
Grant `{owner_profile_id, viewer_profile_id, viewers[], scopes[], until: null|ts, created_at, owner_profile_revision (couple), safety_epoch (couple)}` (`sharedByMe` 7186).
Invariants:
- one pending request per (requester, owner) (requestReason 4514); one active grant per pair — new grant **replaces** old (grantSheet 7179 "Новый доступ заменит прежний").
- Owner may grant scopes the requester didn't ask for (chips marked «не запрошено», 7179) — conflicts with existing server rule (see §7).
- term: `null` (no limit), 1 day, 7 days (grTerm 7185).
- narrowing only via «Изменить» (nwOk 7195); widening needs a new request.
- Couple owner: grant to a person may contain only `info` (allowedScopes 3630 / grantScopes21 9218); couple requester may ask a person only for `info`.
- grant valid iff not expired, not revoked, not blocked, both profiles active, and for couple owner `owner_profile_revision == current revision` (givenGrant 4362 — see §7 Q6).
- private part off ⇒ revoke all grants + close all `new` requests (privRevoke21 9196, ME-003/022). Couple dissolution ⇒ all couple grants/requests revoked (dissolvePair 4517).
Visibility: request rows O(owner) + O(requester); grant lists O both sides; private payload only to G within scopes; private media carry a per-viewer watermark `@viewer_nick` (privOpenHTML 7226, privPeek 7245).

### 1.8 `request_quota` (owner: account)
10 new outgoing access requests per rolling 24 h, **shared across the account's personal and couple requests** (C.quotaLeft 4381 counts `S.reqOut` + couple reqOut); cancelled requests are not refunded (cancelReq 7142). Single Premium/paywall moment B02 (limitSheet 7141).

### 1.9 `profile_link` (owner: shared by both endpoints)
`{id, a_profile_id, b_profile_id, kind: partner|play|ds|mentor|meta|friend, side:{a:dom|sub|mentor|mentee, b:…} (for ds/mentor), status: pending|ok, proposed_by, vis:{a: all|followers|us, b: …}, change?:{kind, side, by, at}, created_at}` (ensureV13 5908, LINK_KINDS 5903, linkSend 5985).
- Lifecycle: `pending → ok` (target confirms) | deleted (decline/cancel); `ok` + `change` pending → applied/dropped; `ok → deleted` (either side, other notified).
- Effective visibility = the **more private** of the two choices (`linkVis` 5927); `us` = only the two endpoints (and owners' members).
- Max 30 links per profile (LINK_MAX 5906). `links_from` gate. Not with own partner/related; not with blocked.
- Couple endpoint: any member can propose/confirm; partner only notified (`coupleAct`), no approval in prototype (see §7 Q23).
Visibility: `ok` links on profile per effective vis (A / F / endpoints); pending visible only to endpoints.

### 1.10 `block` (owner: blocking profile)
`{blocker_profile_id, blocked_profile_id, acted_by_account_id, created_at}`; `by` = me|couple is implied by blocker profile (PRF-001, §11).
- Effects on create (doBlockData 7106) — **for the blocker profile only**: remove links between them, requests both ways, grants both ways, likes both ways, match, follow both ways, end conversation, hide their notifications. Other profile of the same account is untouched; extension to it is an explicit command (`blockBoth` 8333 "И для пары / И для меня").
- Couple block: partner notified (`blocked`) when the couple had ties (doBlock 7108). Blocked person is never notified.
- Unblock: no restoration of match/grants/requests (unblock 8334).
- Covers couples containing the blocked person (member expansion).
Visibility: O only (list P12 per acting profile, count in Settings 8266).

### 1.11 `conversation` (owner: system; two participant profiles)
`{id, profile_a, profile_b, members: account_ids (2–4, both sides' members), pair_id_a?, created_at (at match), state: active|ended|archived_readonly, ended_reason: unmatch|block|pair_dissolved|pair_deleted}` (ensureThread 6788).
- A thread exists from the match; while it has 0 messages it is shown only as «Новые совпадения» (H01 7783, CHAT-003/004/005).
- `ended`: no new messages, history kept for each side (ecDo 7926, alert 7836). Dissolved couple: threads end, media URLs revoked (dissolvePair 4517; CPL-020).
- Couple side: both members read and write; header "Чат пары · видит <partner>" (H02 7832, CHAT-006).

`conversation_member_state` (owner: per participant profile **or** per account — see §7 Q25): `muted`, `archived` (new message unarchives, chatArchive 7919), `read_seq` per **account** (`readBy[member]` 7802, 7823).

### 1.12 `message`
`{id, conversation_id, seq (monotonic), author_profile_id, sender_account_id, text ≤2000 chars, reply_to_message_id?, media_asset_id?, media_mode: normal|once|t15|t120|t1440, created_at}` (ACT.send 7850, cmSend 7899).
- One media file per message (attach 7855). No edit, no delete, no reactions in V21 (message menu = Reply, Copy own text: openMessageMenu 7807).
- Ephemeral (`once|t*`): requires recipient profile 18+ verified and sender 18+ (cmSend 7899); per-recipient view state.
`message_media_view {message_id, viewer_account_id, opened_at?, done}` (cmView/cmState 7862): `unopened → open (once) → done` / `unopened → counting(opened_at) → expired at opened_at+TTL` (TTL 15 min / 2 h / 24 h, CM_TTL 7858). The first conscious tap starts the timer, never a render (7890). File deleted when **all** recipients are done (7863, 7893). Sender may re-open own media until it burns out (7888).
Visibility: members only; blurred-by-default rendering for incoming `normal` media per viewer's `chat_blur_incoming`; ephemeral viewed with `@viewer` watermark (7890).

### 1.13 `typing` (ephemeral, not stored) — realtime signal only (S.ui.typing 7833/7852).

### 1.14 `notification` (owner: recipient account; addressed to a profile)
`{id, recipient_account_id, addressee_profile_id (person|couple → label «Тебе»/«Паре»), type, actor_profile_id?, object_ref (post|event|community|link|request|conversation), pair_event?, created_at, read_at?, deep_link}` (S.notifs 3696, pairNotify 4038, socialDelivery 4527).
Fan-out rule (PAIR_EXTERNAL 4037): events caused by **other** profiles to a couple go to **both** members; a member's own couple action goes **only to the partner**. Read state is per member (`P.notifications[recipient]`).

### 1.15 `decision_item` («Нужно решить») — a **derived view**, not a table
Computed from source rows (todoItems 7938); one count everywhere (C.meTodo 4380, bellCount 4394). See §4.

### 1.16 `profile_view_history` (viewed profiles D09) = `discover_decision` history; no separate "who viewed me" exists in V21.

---

## 2. Commands (writes)

All commands: `operation_id` (UUIDv7) for idempotent retry; `acting_profile_id`; server derives `acted_by_account_id`; 18+ + current documents guard except safety/withdrawal commands (unblock/revoke/cancel/report allowed after expiry, as existing `access-guard` does). Side effects via outbox.

### 2.1 Discover / likes / matches
| Command | Input | Who may call | Effects | Errors / limits |
|---|---|---|---|---|
| `discover.setMode` | `mode visible\|hidden\|off` | person: self; couple: any member; widening (`off→hidden`, `→visible`) needs `partner_approvals` unless trusted; `→off`/`visible→hidden` immediate | update settings; couple: notify partner (`coupleAct setting` / proposal in «Нужно решить»); `visible` without approved photo ⇒ accepted but not served (toast "добавь фото") | `age_not_verified` (both members for couple), `proposal_pending` (CPL: "Сначала завершите изменения профиля пары" 7593) |
| `discover.setFilter` | filter object §1.3 | O | upsert; returns result count (dfMatches 6803 "Показать · N") | `nearby_without_location` |
| `discover.decide` | `target_profile_id, decision like\|pass` | O, mode≠off | write decision + history; like ⇒ `like.send(source=discover)` | `not_in_pool`, `already_decided`, `blocked`, offline retry same op |
| `discover.undo` | — | O | revert last non-match decision; withdraw its like (retract target notification) | `nothing_to_undo`, `already_mutual`, `premium_required` (after 1 free) |
| `discover.restore` | `target` | O | delete pass decision; candidate re-enters deck front (6837) | — |
| `like.send` | `target, source discover\|profile\|likes` | rules §1.5 | if reverse like active ⇒ `match.create`; else create like, notify target (`like`, addressee target profile; couple ⇒ both members), couple sender ⇒ partner `likeSent` | `likes_not_accepted`, `couples_via_discover_only`, `own_discover_off`, `related`, `blocked`, `already_matched` |
| `like.withdraw` (`unlike`) | `target` | O | like → withdrawn; remove from target's Likes; **retract** target's `like` notification (text promises "they won't be told", 7085) | idempotent |
| `like.dismiss` (`likePass`) | `from_profile` | O of target | like → dismissed (sender not told); record pass decision; undo window | idempotent |
| `match.create` (internal) | — | system | match row, conversation row, notify both sides `match` (couple: both members; self record read) | — |
| `match.end` (`endConn`) | `target, also_revoke_my_grant: bool` | either participant | conversation ended; match ended; my like removed; optional revoke of **my** grant; other side is **not** notified (implied: no NTXT) | idempotent |

### 2.2 Access to private part
| Command | Input | Who | Effects | Errors |
|---|---|---|---|---|
| `access.request` | `owner_profile, scopes[]` | requester O; 18+ (needAge 7125) | request `pending`; notify owner (`req` → «Нужно решить», addressee owner profile); couple requester ⇒ partner `reqSent`; quota −1 | `requests_closed` (none/matches), `already_pending`, `cooldown` (after decline), `quota_exhausted` (+next slot time), `scope_not_available` (owner's private part lacks it / couple↔person only info), `blocked`, `related` |
| `access.cancel` | `request_id` | requester | `cancelled`; quota not refunded | — |
| `access.grant` | `request_id, scopes[], term null\|1d\|7d` | owner O; private part must be on (else `private_off` + offer to enable) | person: grant row (replaces previous), request `open`, notify requester `grant`; couple owner: `partner_approvals(kind=grant)` unless trusted ⇒ on approve same effects + partner `workApproved` | `request_not_new`, `blocked`, `revision_conflict` |
| `access.decline` | `request_id` | owner | request `no`; requester sees «решили не открывать», cooldown; **no push** (implied) | undo window (client) |
| `access.narrow` | `viewer, scopes⊂current` | owner | shrink grant + open request rows; empty ⇒ revoke | `grant_ended` |
| `access.revoke` / `access.revokeAll` | `viewer` / — | owner; couple revokeAll = `pairSafety('sharing')` also sets `requests_from=none` | grant removed, request `no`; immediate (narrowing; couple partner notified) | idempotent |
| `privatePart.setOn(false)` | — | owner | revoke all + close new requests; returns counts `{g,q}` for confirmation text | — |

### 2.3 Links
| Command | Input | Who | Effects | Errors |
|---|---|---|---|---|
| `link.propose` | `target, kind, my_side?, my_vis` | O (couple: any member) | link `pending`; target gets `linkReq` in «Нужно решить»; couple ⇒ partner `coupleAct link` | `links_closed`, `follow_only`, `limit_30`, `blocked`, `own_partner`, `side_required` |
| `link.updateRequest` | same | proposer | update pending | — |
| `link.answer` | `link_id, yes\|no` | target O | yes ⇒ `ok`, notify proposer `linkok`; no ⇒ delete, notify `linkno` (5948) | `not_pending` |
| `link.proposeChange` | `link_id, kind, side` | either endpoint of `ok` | `change` pending; other side «Нужно решить»; current link stays until confirmed | — |
| `link.answerChange` | `yes\|no` | other endpoint | apply/drop; notify `linkOk/linkNo` | — |
| `link.setVisibility` | `link_id, all\|followers\|us` | either endpoint (own side) | immediate | — |
| `link.cancel` / `link.remove` | `link_id` | proposer / either | delete; remove ⇒ other side `linkgone` | idempotent |
| `link.setLinksFrom` | `all\|follow\|none` | O (couple: setting rules §1.1) | — | — |

### 2.4 Blocks and reports
| Command | Input | Who | Effects | Errors |
|---|---|---|---|---|
| `block.create` | `target` | O of acting profile (no partner consent — narrowing) | §1.10 effects for **acting profile only**; couple ⇒ partner `blocked` if ties existed; outbox: purge from deck/search/feeds | idempotent |
| `block.extend` | `target` | account member of the other own profile | same effects for the other own profile (`blockBoth` 8333) | `not_blocked_here` |
| `block.remove` | `target` | O | delete block; nothing restored | — |
| `report.person` | `target, reason, note≤500, also_block (default true for persons), context: profile\|chat\|post` | any eligible profile (allowed after age expiry) | `report` row + snapshot (server-made); if `also_block` ⇒ `block.create`; reporter later gets `reportDone`/`reportKept` | daily quota (existing: 10/day), `invalid_reason` |

V21 reasons (ACT.report 7094): `threat` (угрозы/шантаж), `private` (чужие приватные материалы), `minor`, `spam`, `other`.

### 2.5 Chats
| Command | Input | Who | Effects | Errors |
|---|---|---|---|---|
| `chat.send` | `conversation_id, text≤2000, reply_to?` | member account of a participant profile; match active; not blocked; not ended; acting profile active | append with next `seq`; notify other side members (`message`, push only, per mute/notif settings); couple sender ⇒ partner sees it in thread (not a notif) | `no_match`, `ended`, `blocked`, `too_long`, `pair_inactive` |
| `chat.sendMedia` | `+ media_asset_id, mode` | same; ephemeral ⇒ both sides 18+ | media must be scanned/approved per media pipeline; message; per-recipient view rows | `recipient_not_verified`, `age_required`, `media_rejected` |
| `chat.openMedia` | `message_id` | recipient account | first open sets `opened_at`; `once` closes ⇒ done; when all done ⇒ delete file | `expired`, `no_access` |
| `chat.read` | `conversation_id, up_to_seq` | member account | per-account read cursor; emits receipt signal | monotonic only |
| `chat.typing` | `conversation_id` | member | realtime signal only | rate-limited |
| `chat.mute` / `chat.archive` | toggle | participant (see Q25) | state | — |
| `chat.end` = `match.end` | | | | |

No message requests, no "chat by grant", no deletion: V21 explicitly says a request/grant/follow/gift **never opens a chat** (accessSummary 7175, follow toast 7079, gift 8422).

### 2.6 Notifications / settings
| Command | Input | Effects |
|---|---|---|
| `notification.read` | `id` | read for this member |
| `notification.readAll` | addressee filter (all tab) | marks all non-decision notifs read (readAll 7983) |
| `notifySettings.update` | §1.2 notify object | per account |
| `push.register` / `push.unregister` | device token | per account/device (implied) |
| `search.recent.add/remove/clear` | string | per account |

### 2.7 Gifts (people aspect only)
`gift.create {recipient_nick (exact), plan, anonymous}` → resolves exact nick (8405 "Точный ник"); rejects if blocked either way; couple recipient ⇒ both members get Premium, price ×2; queued if recipient already Premium; payment through store; gift **does not** open chat/like/access (8422). Recipient notification with sender hidden when anonymous (implied).

---

## 3. Queries (reads)

| Query | Input | Viewer-dependent projection | Pagination |
|---|---|---|---|
| `people.search` | `q (≥2 chars)`, scope people | prototype: substring over nick+name (searchData 8219), includes dating-off profiles (8232); excludes blocked both ways; row = avatar, name, age if shown, `@nick · city` | cursor, ≤20 |
| `people.byNick` | exact nick | for pair invite / gift / mention; returns opaque id or not-found (indistinguishable for blocked) | — |
| `discover.deck` | acting profile | pool (pool 6596): candidate `discover_mode=visible`, approved photo (implied, not checked in prototype), 18+ verified, not decided, not matched, not blocked, not related, not own partner, passes filter (couple: every shown member age in range; gender/orient: at least one member matches, 6599); viewer must have mode≠off. Card: photos, name, age, `whoLine`, city + «около N км» (min 5, nearby only), online, follower counts, «Ты нравишься» if they liked me, compat count, full public profile body, veil if private part exists | small batches, server order (unspecified, §7) |
| `discover.count` | filter draft | count only (for «Показать · N» and dfWhyEmpty «narrowest filter» suggestions) | — |
| `likes.incoming` / `likes.outgoing` | acting profile | incoming: active, not matched, not blocked, not dismissed; outgoing: pending ones with source and (couple) initiator | cursor |
| `matches.list` | acting profile | not blocked; summary «N общих тем» | cursor |
| `discover.history` | k all\|pass\|like | free: newest only; Premium: 7 days | — |
| `profile.view` | `target, acting_profile` | see §3.1 | — |
| `profile.compat` («Что у вас общего») | `target, acting_profile` | see §3.2 | — |
| `access.lists` | tab out\|withme\|byme, filter pending | own metadata only (ids, scopes, status, until); requester sees «ask again in N d» | cursor ≤30 |
| `access.privateView` | `owner` | only granted scopes; watermark id; nothing (not even counts) before grant — veil shows placeholders (veilBlock 6677 "no real data is sent before access") | — |
| `links.ofProfile` | `profile` | `ok` links filtered by effective vis vs viewer (A/F/endpoints), blocked endpoints hidden | ≤4 inline, full list P21 |
| `links.mine` | — | incoming, change proposals, sent, confirmed, settings | — |
| `blocks.list` | acting profile | own blocks only | cursor |
| `chats.list` | filter all\|me\|couple, q | threads with ≥1 message (or ended with messages) per profile; new matches row; unread per **reader account** (chatUnread 7781); last message preview «Одноразовое фото» for ephemeral; sender name prefix when other side is a couple | cursor by last message |
| `chats.archive` | — | archived threads | — |
| `chat.messages` | conversation, before/after seq | members only; ended ⇒ read-only; ephemeral: per-viewer state, no URL unless openable; receipts = which other members' cursor passed the message (chatReceipts 7803); context pills: compat summary, grant state both ways | seq cursor |
| `notifications.list` | tab all, filter kind | excludes blocked actors; merges event/community updates (dedup with same object, currentNotifications 4516); each row labelled «Тебе»/«Паре» (NTF-002); new vs earlier | cursor |
| `decisions.list` («Нужно решить») | filter | §4; grouped «Тебе» / «Паре», acting profile's group first | — |
| `counters` | — | see §4.3 | — |

### 3.1 Public profile projection by viewer (profileView 6875)
| Element | Stranger (A) | Follower (F) | Matched (M) | Granted (G) | Couple viewing a person | Partner (related) | Blocked |
|---|---|---|---|---|---|---|---|
| Photos (approved, safe only), name, age if `showAge`, city, `whoLine`, online, follower/following counts, bio, details (gender/orient/role/status/format; `seek` only if discover on; couple: role/format/seek only, 4672) | yes | yes | yes | yes | yes | yes | **no** (unavailable) |
| Like button | if rules §1.5 pass | same | → «Написать» | same | «Нравится от пары» if couple discover on & target discover on; otherwise note (`coupleOff`/`solo`) | **hidden** (isPartner) | — |
| Follow button | yes («Подписаться от пары» in Мы) | — | yes | yes | yes | yes | — |
| Public interests | yes | yes | yes | yes | yes | yes | — |
| Links | vis=all | + followers | per vis | per vis | per vis | per vis | — |
| Activity tab (likes on posts unless hidden, events, communities, follows) | `activity=all` | + `followers` | + `followers` (match counts) | per mode | per couple's follows | per mode | — |
| «Что у вас общего» | compact block | same | same | same (never uses private) | computed for the **couple's** public interests | n/a | — |
| Private part | veil (exists?) + Request/pending/cooldown/closed state | same | same (+ `requests_from=matches` allows request) | granted scopes, watermark, time left | requester=couple ⇒ only couple's grant, viewer must be in `viewers` | n/a (own couple) | — |
| Social context «Вместе с тобой в …», hosts, hosting | yes | yes | yes | yes | from acting profile memberships | — | — |
Owner «Как видят» preview: same projection with action buttons inert; compat computed against a sample viewer (CPL-023, SAMPLE_VIEWER21 9215).

### 3.2 «Что у вас общего» — inputs and hard boundaries (shared 4605, compatBlock 4660, P05 7112)
- Inputs: **acting** profile's interests with `vis=public` (couple: couple's own interests) × target's interests with `vis=public`; plus `format` (mono vs non-mono fact). Nothing else.
- Never used: interests with `vis=granted|only`, private part, hidden limits, history, tests, journal — **even when the viewer holds a grant** ("Скрытые интересы и границы не участвуют и не раскрываются", P05 7121; "Приватная часть доступна отдельно").
- Hard limits participate only if their owner made them public → `bound` group.
- Output: groups `complement` (roles fit: explicit give↔receive), `match` (both ≥6), `try` (both 1–5), `discuss` (same single role / gap ≥4 / negotiable mark), `bound`; per row both levels 1–10, role words, `why`; head count = complement+match; `few=true` if either side has <2 public interests → only list the few shared topic names. No overall score/ranking (V12 comment 4606). Copy: «Совпадение — не согласие».
- Server computes and returns only rows for the intersection; never the target's full jar list beyond what profile.view already returns publicly; never computes against granted data.
- Used in: deck card label, profile compact block, P05, chat pills, request cards in «Нужно решить» (computed **for the addressee profile**, NTF-001 7152), match dialog text.

---

## 4. Notifications and «Нужно решить»

### 4.1 Notification types in this domain
| Type | Trigger | Addressee | Tab/filter (inboxKind 7951) | Action |
|---|---|---|---|---|
| `like` | personal like received | target profile (couple ⇒ both members, `open:coupleLikes`) | likes | open Likes (switches to Мы for couple) |
| `match` | mutual like | both profiles (self copy read) | matches | open chat (or Chats if ended) |
| `req` | access request | owner profile | access — **counted in «Нужно решить», not as news** (notifNew 4393) | Grant / Decline |
| `grant` | access granted | requester profile | access | open P08 |
| `reqDeclined` | decline | requester | — (no renderer; quiet) | — |
| `follow` | new follower | target profile | follows | open followers |
| `linkReq` (decision) / `linkok` / `linkno` / `linkgone` | link lifecycle | other endpoint | links | answer / open |
| `message` | new chat message | other side members | (chat badge + push; not an inbox row) | open thread |
| `reportDone` / `reportKept` | moderation outcome | reporter | posts/other | — |
| pair events (`pair` + `pairEvent`) | `like, likeSent, match, req, reqSent, grant, grantApproval, blocked, coupleAct{follow,like,link,setting}, trustOn/Off, proposal, profileApproved/Updated, dissolved, restored…` | partner or both per PAIR_EXTERNAL | pair | per event |
Also in the same inbox (other domains): event/community updates (`S.updates`, dedup), `mention`, `reply`, `postLike` (grouped «X и ещё N»), tag consent, `evapp`, `groupok`, moderation of posts.

### 4.2 «Нужно решить» items (todoItems 7938)
| Kind | Source row | Addressee | Buttons |
|---|---|---|---|
| `pinv` | incoming couple invitation | person (only when not in an active couple) | Принять / Отклонить |
| `req` | access request `new` (person; couple unless already in partner approval) | Тебе / Паре | Открыть доступ (sheet: scopes, term, summary) / Отказать |
| `profile` / `profileBack` | couple profile/visibility proposal by partner / returned to me | Паре | Review (word diff) / Edit |
| `joint` | partner approval of post / grant / event / rsvp, or returned | Паре | Одобрить / Вернуть |
| `eapp` / `capp` | event application / community join request where I (or couple) host | Тебе / Паре | Одобрить / Отклонить |
| `link` | incoming link proposal or change proposal | owner endpoint | Подтвердить / Отклонить |
| `tag` | someone marked me on a photo (pending) | Тебе | Посмотреть / Против |
Rules: a member's personal items are never shown to the partner (CPL-015, 7942); blocked actors excluded; a request notification and its card count once.

### 4.3 Counters (all derived server-side from the same predicates; C 4367)
- People tab badge `likesAll` = waiting likes of personal + couple profile (dock never hides couple likes); in-screen `likesIn` = acting profile only (CPL-008); dot when the other own identity has waiting likes (otherActorWaiting 4079).
- `reqAll`, `unreadChats` = Σ over own profiles of threads with unread for **this member**, excluding archived/blocked; `newMatches`.
- Bell = unread non-decision notifications + `todoCount`; «Я» tab = `todoCount`; inbox tab «Нужно решить» = `todoCount` — **one number everywhere**.

### 4.4 Push texts
- Default mode `safe`: title "FetUre", body «Новое уведомление» / «Открой приложение, чтобы посмотреть» — no names, no text (K05 8290; SET-006 "phone always shows app icon and name").
- `normal` mode (opt-in): name + start of message (8290 example). Recommendation for S2: even in normal mode never include media, ephemeral captions, private-part or interest names, or couple names (implied by owner brief "neutral push"; see Q20).
- Likes push grouped, at most hourly (NOTIF_CATS 8284). Quiet hours deliver one morning summary. Muted thread ⇒ no push.

---

## 5. Moderation hooks
| Hook | What goes to staff | Notes |
|---|---|---|
| Person report (profile, chat menu, deck/profile menu) | reason, note ≤500, reporter, target profile, server snapshot of **public** profile fields; context (from chat) | V21 does not attach messages (rpSend 7100) — see Q11. Also-block default on. Reporter gets outcome notification. |
| Chat media | every `media_asset` through quarantine → scan → label; explicit allowed in chat but blurred; rejected never delivered | decision: media pipeline; ephemeral files must be retained for moderation until scan done (implied). |
| Private part media | scan + explicit label; served only to G | — |
| Profile photo for Discover | approved photo required to be served; "На проверке" owner-only | ME-006 |
| Underage signal | reason `minor` ⇒ priority 1 (existing priority 1–3) | — |
| Sanctions effect | restriction closes peer eligibility: remove from deck/search, block new likes/requests/messages, revoke grants (existing moderation.md) | extend to likes, matches, conversations (end or freeze) |
| Rate limits / abuse | access quota 10/24h; like/message rate limits (implied, not in V21); link max 30 | — |
| Auto-checks | `moderation-engine.js` label adapter for message text/media (types "message/media") | no auto-ban by count |

---

## 6. Mapping to existing server
| V21 entity | Existing | Verdict |
|---|---|---|
| Discover mode & accept-likes settings | `feture_profiles.dating_enabled` (seed forces false), `feture_dating_preferences(account_hash, enabled default false, preferences jsonb)` | **Rework**: per **profile**, tri-state mode default `visible`, explicit columns for filter (§1.3), remove jsonb blob; migration: existing rows → `off` unless user opted in (AUTH-019 applies to new profiles) |
| Discover decisions, likes, matches | — | **New** (`discover_decision`, `like`, `match`); per-profile; outbox for notifications |
| Access request / grant | `feture_access_requests` (owner/viewer hash, scopes `profile:*`/`interest:*`, `requested_message`, 7-day pending expiry, one pending), `feture_scoped_grants` (scopes, `can_message`, expiry 1–90 d mandatory, PK owner+viewer), `lib/feture/access.js` (`access.request/decide/close/list/profile/preview/disclosure/settings/block`) | **Rework**: profile ids instead of hashes; scopes → `{info, photos, video}` (info includes private interests); **drop `can_message`/`canMessage`** (V21: access never opens chat); term `null\|1d\|7d` (vs 1–90 mandatory); allow/deny widening beyond asked (Q2); add `viewers[]`, couple partner approval link, profile revision binding, re-ask cooldown, account-level quota; keep: receipts/payload hash, CAS, block serialization, "unblock doesn't restore", list ≤30 own metadata |
| Field-level disclosure | `feture_profile_details.public_fields/granted_fields`, `access.disclosure` | **Drop**: V21 details are always part of the main profile (publicField 4014); private part = text + granted interests + private media |
| Old access table | `feture_profile_access` (initial domain migration) | **Drop** (superseded already) |
| Profile projection | `feture_profile_project/preview` RPC, `access.profile/preview` | **Keep concept / rework shape**: server-side whitelist projection per viewer (§3.1); preview with synthetic viewer for «Как видят» |
| Compatibility | `feture_share_links` + `feture_share_comparisons` (`share.create/read/compare.*`, 1–6 picked topics, two consents, stance-only) | **Drop/archive**: V21 has automatic «Что у вас общего» on public interests (no share card, no stance model, quizzes removed). Reuse its privacy guarantees (no score, perspective, revision invalidation). New query `profile.compat` |
| Blocks | `feture_blocks(blocker_hash, blocked_hash)`, `feture_pair_blocked`, `access.block` | **Rework**: profile-owned (`blocker_profile_id`), `acted_by`, explicit extension command; predicate expands couple members; must be applied in deck/search/chat/notifications/links/feed |
| Follow / mute | `feture_author_relationships` via `publicAuthorId` (no public lists, no notifications, C02.4) | **Rework** (profile domain): V21 has public follower counts/lists, follow notifications, remove-follower (ME-029); block removes follows both ways |
| Person reports | `feture_reports(target_kind='profile', reasons harassment/privacy/nonconsent/minor/illegal/spam/other, selected_field, snapshot)`, decisions/restrictions/appeals, `moderation.js` | **Keep + extend**: reporter profile + acted_by; target kinds `profile`, `conversation`/`message`; map V21 reasons (threat→harassment, private→privacy, minor, spam, other) or update enum; `also_block`; outcome notification; drop `selected_field` (profile fields not disclosure-layered anymore) |
| Links | — | **New** `profile_link` |
| Conversations, messages, media views, read cursors | — (no chat code; `features.notifications=false`) | **New**: conversation (2 profiles, member accounts), message with monotonic `seq`, per-account read cursor, `message_media_view`, mute/archive state; realtime = signal only; ephemeral file deletion job |
| Notifications, push, settings | — | **New**: `notification` (+ outbox fan-out to members), `notification_settings` (per account), `push_device`, digest/quiet-hours scheduler |
| «Нужно решить» | — | **New derived query** over requests, partner_approvals, links, pair invites, event/community applications, tag consents |
| Metrics | `private-metrics.js` (aggregate counters, allowlist) | **Keep**: optionally add aggregate `like_sent`, `match_created`, `message_sent` (aggregate only, never per person) |
| Quotas | access 10/day? (existing reports 10/day) | **New** account-level access request quota (shared personal+couple) |
| Gifts | `api/billing.js` (Core client, `products: []`) | **Billing domain**; people aspect: exact-nick resolution with block check |

---

## 7. Open questions, ambiguities, unsafe-to-copy behaviour

1. **Re-ask cooldown after decline**: `requestReason` says 7 days (4514) while `REASK_DAYS=30` drives the veil text, P07 and the decline toast (3402, 6687, 7189). Pick one (30 is the newer owner rule, "V11 owner 20.10").
2. **Granting more than asked**: grant sheet offers unrequested scopes («· не запрошено», 7179). Existing server forbids widening the request (scoped-access.md). Owner decision needed.
3. **Unlimited grants**: term «без срока» (`until=null`, 7185) vs existing 1–90 days mandatory expiry.
4. **Scope list**: REQ_SCOPES = info/photos/video (3628) but seed requests use `interests` (3690) and comments mention 4 scopes (3629). Owner decision ME-025: interests travel with `info`. Server enum should be 3 values; migrate `interest:*` scopes.
5. **Couple ↔ person scope rule** (`allowedScopes` 3630): a couple can only ask a person for `info`, and a couple can only grant a person `info`. Intent (protect the couple's media from single viewers?) is not documented; confirm and name it in the spec.
6. **Couple grants die on any couple profile edit**: `givenGrant` requires `r.profileRevision === S.pair.revision` (4362) — every approved couple profile change silently voids all couple grants. Probably unintended; likely should bind to `safety_epoch` only.
7. **Couple «Смотреть незаметно»**: Discover-off screen promises browsing hidden without consent (6635), but `pairMode` routes `off→hidden` through a partner proposal (7592–7596). Browsing as a couple sends likes as the couple → arguably widening. Decide.
8. **Withdrawn likes leak**: `notifyOther('like')` fires at like time (6734); unlike/undo promise "они не узнают" (7085). Server must retract/hide the like notification and push (or delay like pushes).
9. **End connection semantics** (ecDo 7926): only the caller's state changes in the prototype; text says "until one of you likes again" and "each keeps the history". Specify: does the other side keep its like (so a single new like re-matches)? Is the other side told? Recommend: match ended for both, both likes cleared, no notification.
10. **Block deletes history**: `doBlockData` does `delete st.threads[id]` and purges notifications (7106). Unsafe for evidence — server should hide/end, retain for reports and retention policy.
11. **Chat reports carry no messages**: report from chat menu reports the person only (7094/7100). Decide whether the reporter can attach selected messages/media (needed for threats/blackmail and private-content reasons). Reason enum differs from the server's.
12. **Block symmetry is not modelled**: prototype checks only my own blocks (4356). Server must make a block hide both sides from each other everywhere (profile, search, deck, likes, chats, links, mentions, gifts, community member lists).
13. **Discover pool checks**: pool (6596) does not check the candidate's `datingVisible`, approved photo, or that hidden-mode profiles are excluded; it requires `verified` (6597). Server must enforce: visible + approved photo + 18+ + not restricted. "Reciprocal opt-in" in V21 = both sides have Discover on; there is **no** candidate-side preference filtering (e.g., candidate's age range) — confirm that's intended.
14. **Cross-identity chip** `otherDoneChip` (6728) reads the other own identity's likes/passes. In a shared prototype state a partner in «Мы» could see Alex's **personal** likes. Server: only the viewing account's own personal profile may be shown; never a partner's personal activity.
15. **Undo quota**: one free undo ever (counter never resets, 6723) then Premium. Period unspecified (per day? per session?).
16. **People search mode**: prototype = substring over nickname and name, includes Discover-off profiles (8219, 8232). Brief/guide mention exact nick (pair invite §5.5, gift 8405). Decide: exact/prefix nick only vs name search; there is no "hide me from search" setting in V21.
17. **Presence**: online / last seen shown to everyone (presence 4701, card 6670) with no privacy switch.
18. **Distance**: coords rounded to 0.05° (5427), shown as «около N км» (min 5, 4700). Server must never return coordinates and should bucket distances (e.g., 5 km steps) to resist trilateration; filter radius queries should use the same coarse cell.
19. **Activity "followers" includes matches** (`activityShown` 7511 label «Подписчики и взаимные»). Confirm.
20. **Push "normal" mode** shows sender name and message start (8290). Owner wants neutral pushes; decide whether `normal` stays and what it may contain (never media/ephemeral/couple names).
21. **`reqDeclined` delivery** is sent (7189) but has no renderer — treat as silent status change (no push) and confirm.
22. **Followers public + follow notifications** in V21 (n8 3701, P10, NTXT.follow) contradict existing C02.4 rules (no public lists, no notification, publicAuthorId opt-in). Profile domain must reconcile.
23. **Links on a couple without partner consent**: any member proposes/confirms couple links; partner only gets `coupleAct` (5948, 5985). Publishing a relationship on the couple profile looks like widening → should use `partner_approvals`?
24. **Link kind `partner` vs couple**: a person in an active couple can still propose `partner` links to others; the own partner is excluded (linkIssue 5933). Confirm semantics (and that `meta` metamours are not auto-derived).
25. **Mute/archive owner**: stored per acting profile store (`chatStore().muted/archived` 7918) — in a couple chat one member's mute would mute the partner too. Recommend per account; confirm.
26. **Ephemeral media retention**: timer starts at first open; an unopened ephemeral file has no maximum lifetime. Need max TTL (e.g., 7 days) and deletion after moderation scan. Screenshot blocking impossible in web (cmSend sheet 7896) — keep the disclosure text.
27. **Couple deletion and retained threads**: `expirePair` keeps only messages **not** sent by the couple (4518) as a read-only archive for members. Clarify who sees it (members only? the other side keeps full history?).
28. **Request quota scope**: account-level (personal + couple share 10/24 h, 4381) vs per profile.
29. **«Как видят» sample viewer** uses a real person (`mia`, 9215). Server must use a synthetic sample viewer, never a real user's interests.
30. **Typing/read receipts privacy**: no setting to disable receipts or typing; couple chats expose which member read (chatReceipts 7803). Confirm.
31. **Like from profile without Discover**: one-time explainer per session (`S.ui.r04seen` 7087); likes received this way can match and open chat even if both have Discover off — confirm that "Chat only after mutual personal like" applies regardless of Discover mode (datingOff copy 6639 says yes).
32. **Discover ordering**: `deckOrder` is a static seed list; teaser promises ordering "по тому, что откликается вам обоим" (6648). Ranking rule (shared topics? recency? distance?) is unspecified — must not use private data.
33. **Gift recipient notification and anonymity** are implied only (8424); define notification text and whether an anonymous gift can be reported/blocked.
