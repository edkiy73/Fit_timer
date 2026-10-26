# S1/S2 input — COMMUNITIES and EVENTS (from prototype V21)

Source of truth: `apps/feture/public/prototype-v21.html` (line refs below are to that file, `L####`), V21 override block `evcomm` (L9093–9150), `V21-INTEGRATION-GUIDE.md` §4 stage D, §5, §11 (rows «События», «Сообщества»), audit IDs COMM-001…016, EVT-001…040.
Conventions: every row carries `profile_id` (owner, person|couple) + `acted_by_account_id`; ids UUIDv7; «partner approval» = shared `partner_approvals` table (owned by the couple domain); «outbox» = transactional outbox event.
Visibility codes: **O** owner profile (both partners when the owner is a couple), **H** community hosts (owner + moderators), **M** community members, **A** anyone eligible (18+, rules accepted, not blocked either way), **ADM** admitted event attendees, **ORG** event organizer profile, **S** staff.
«implied» = V21 shows it only through copy/toasts/seed data, not through working logic.

---

## 1. Entities

### 1.1 `community`
Owner: profile (person or couple) that created it — «Ведущий — профиль-создатель (может быть пара)» (guide §11, COMM-016). Evidence: `c8Save` L7751, `ownsCommunity` L4366, `commAsCouple` L6864.

| Field | Type / constraint | Visible to |
|---|---|---|
| id | uuid v7 | A (if community visible) |
| owner_profile_id | profile; person or couple | A (shown as «Ведёт сообщество», couple shown as one «вы» row, COMM-016 L7666) |
| created_by_account_id | account | S only |
| name | text 3–50, unique case-insensitive among non-deleted (`c8Save` L7751 «Такое сообщество уже есть») | A |
| description | rich text (md) 20–500 | A |
| topics | interest ids, 1–3 (`c8Topic`) | A |
| privacy | enum `open` \| `closed` \| `hidden` (UI 3 values; prototype stores hidden as `closed + hidden:true`, L7751/L7762) | A (hidden: only those who can open it) |
| join_question | text ≤120, optional, only when privacy≠open (COMM-008, L7748). Data model allows a list (`questions[]`), UI creates ≤1 | A (question text); answers → H only |
| rules | list of lines, ≥1, total ≤1000 (create) | A |
| location | city id \| `online` (COMM-008 «Где») | A |
| cover_media_id | media_asset, 16:9, must be `safe` | A |
| plate | enum lilac\|rose\|sea\|amber\|moss\|coal (fallback when no cover) | A |
| status | `in_review` → `published`; staff `rejected` (implied — no reject UI); staff `hidden`; `deleted` (implied, no UI) | O+S see in_review; A sees published |
| member_count | derived counter | A (header «N участников») |
| discussion_count, report_count | derived | H (C10 tiles L7756) |
| revision | bigint, CAS | — |
| created_at, published_at, updated_at | timestamptz | A (published_at) |

Lifecycle: `create` → `in_review` (visible only to O: «Сообщество видишь только ты / видите только вы двое», L7652) → staff approve → `published` (catalog unless hidden). Staff reject/hide — implied. No owner delete, no ownership transfer, no drafts in V21.
Invariants:
- Exactly one owner profile; owner always has role `owner` and is counted as a member (`C.members` L4382 adds the viewer when owner).
- `hidden` never appears in catalog or search (filter note in `cFilters`, L7650) and is reachable only by invite (see 1.7).
- Events can be linked only by its hosts (EVT-038, `evCommunityRow` L9101).
- While `in_review`: no joins (`communityJoinAllowed` L7697), no request decisions (L8587), no events linked (L9101), not shown in «Нужно решить» (L7944).

### 1.2 `community_membership` (role + participation)
Owner: the member profile (data «членство в сообществах» belongs to the profile, guide §5.2); role changes are written by hosts.
Evidence: `joinedSet`/`pendingSet` per acting profile (L4047–4048), `cMemberDo` L7684–7687, `communityMemberCanWrite` L4511.

| Field | Type | Visible to |
|---|---|---|
| community_id, profile_id | FK; profile may be person or couple | — |
| role | `owner` \| `host` (UI «ведущий», data `mods`) \| `member` | hosts: A; members: see `listed` |
| state | `active` \| `left` \| `removed` | owner of row, H |
| joined_via | `open_join` \| `request` \| `creation` \| `invite` (implied) | H |
| rules_accepted_at, rules_revision | required for join (checkbox «Принимаю правила», L7700) | S |
| listed | bool, default **false** — whether the member appears in the public member list (prototype: `showMember:false` on every new request L7712; only seeds/`showMember:true` are listed, L6861/L7666) — implied, no UI toggle | O |
| removed_at, removed_by_profile_id | for state=removed | H |
| joined_at, updated_at | | H |

Invariants:
- One row per (community, profile); re-join reuses the row (state→active).
- Removal is **once and with status** (COMM-002, L7687): the person leaves the list and the counter exactly once; their approved request gets status `removed`; they need a new request to come back; approving a new request lifts the removal (L8588).
- `left` from a closed/hidden community → new request needed; from open → may rejoin any time (`cLeave` copy L7713).
- Owner cannot leave (no «Выйти» for owner, L7692) — transfer not in V21.
- A couple membership is its own row (profile=couple), separate from each partner's personal membership. «Участие пары в закрытом сообществе даёт паре доступ к обсуждениям «от пары»» (guide §11, COMM-001; `communityAuthorReason` L4512: couple may write if the couple profile is a member, **or** both partners are members with write rights).
- Membership grants nothing outside the community (C03 empty-state copy «Вступление не открывает личные чаты», L7629; mvp card C03 «membership не выдаёт private profile grants»).

### 1.3 `community_join_request`
Owner: applicant profile. Evidence: `cjGo` L7706–7712, `cCancelReq` L7715, C11 L8581, `cRequestDecision` L8586–8589, seed L3665.

| Field | Type | Visible to |
|---|---|---|
| id | uuid | applicant, H |
| community_id, applicant_profile_id | person or couple («Заявка от пары», L7652) | applicant, H |
| answer | text ≤300; required ≥10 chars when the community has a question (L7709) | **H only** («Ответ увидят только ведущие», L7700; C11 empty copy) |
| status | `pending` → `approved` \| `declined` \| `withdrawn`; `approved` → `removed` (after member removal) | applicant (own), H (history tab «Решения» L8582) |
| decided_by_profile_id, decided_by_account_id, decided_at | | H, S |
| created_at, updated_at, revision | | H |

Invariants: ≤1 `pending` per (community, applicant); decision only while community `published`, request still `pending`, answer unchanged since the host opened it (prototype compares `reviewedAnswer`, L8587 → server: `expectedRevision`); host cannot decide own request; blocked applicants are skipped in «Нужно решить» (L7944). Undo of a decision within the toast window (L8588) — see open questions.

### 1.4 `community_restriction`
Evidence: `cMemberDo` mute L7686, `communityMemberCanWrite` L4511.

| Field | Type | Visible to |
|---|---|---|
| community_id, profile_id | | H; the restricted member is notified |
| kind | `read_only` («Запретить писать» / «может только читать») | H (member row subtitle «не может писать», L7667) |
| set_by_profile_id, acted_by_account_id, created_at | | H, S |

Invariants: hosts cannot be restricted (no mute option for a host, L7683); restriction blocks posting, replying, reacting in the community (likes are gated by `communityAuthorAllowed`, L4799/L9097) but not reading; toggled off by deleting the row.

### 1.5 `community_notification_mute` (per profile preference)
Evidence: COMM-006 `commMutedSet` L9138 (per acting profile), `cMute` L7695; muted community «group» notifications are filtered out (L9140). Fields: profile_id, community_id, created_at. Visible: O only.

### 1.6 `discussion` (topic inside a community)
Owner: author profile (person or couple). Evidence: `DISCUSSIONS` seed L3576+, `S.discussions` L3674, C06 L7721, C07 = post editor in community mode L7735, `discussionFromDraft`/`publishDiscussion` L4537–4539, `commitJointPost` L4566, `discMenu` L6055–6062.
Recommendation: model as a **post with `community_id`** (same comments, reactions, media, poll, people-tags, reports pipeline as the feed domain) plus discussion-only fields below.

| Field | Type | Visible to |
|---|---|---|
| id, community_id | | see visibility rule |
| author_profile_id | person or couple («Тема от пары», L7652) | readers |
| sender_account_id | the partner who actually wrote it (`sender`, L4537) | O, S |
| title | required (seed always has one); limit implied by editor | readers |
| text, media[], poll, tags[], people[] (tag consent) | as post | readers |
| pinned | bool, hosts only (`discPin` L6057); list sorted pinned first, then newest (L7652) | readers |
| excluded_from_popular | bool, hosts only (`discPop` L6058; prototype stores it in viewer state `S.popOff` — should be on the discussion) | H |
| status | `pending_partner` (couple, not trusted) → `published`; `deleted` (author, replies gone, L6061); `removed_by_host` (author notified, L6062); `hidden_by_staff` (implied) | O sees pending |
| reply_count, reaction counts per profile | derived | readers |

Visibility: community `open` → A; `closed`/`hidden` → M (+H) only, also by direct URL (L7721–7723: non-member of closed → unavailable; mvp C03 «выход/ban блокирует контент прямым URL»). A couple-authored discussion is hidden/unavailable while the couple profile is not active (L7652, L7721); after couple deletion its text becomes «Публикация удалена» (L4521).
Replies: tree (`parent`), per-profile reactions, reply statuses pending/failed (client only), deleted tombstones (L7729). Writing/reacting requires `communityAuthorAllowed(...,'comment')`. A dormant `commentPolicy:'public'` (non-members may comment in open communities, L4511) is never set by any UI — drop unless product wants it.

### 1.7 `community_invite` (implied)
Hidden communities: «Нет в каталоге и поиске — попадают по ссылке-приглашению», «По ссылке можно подать заявку» (C10 L7756, `commInvite` L7761). Prototype just copies the plain community URL. Server needs an unguessable, revocable token: community_id, token_hash, created_by, created_at, revoked_at. Holder may open the page and file a join request; it never auto-admits.

### 1.8 `event`
Owner: organizer profile (person or couple — EVT-007/008, `evOrg` L6368, `orgAs` in `evFromForm` L6519).

| Field | Type / constraint (from `evfValidate` L6520–6527) | Visible to |
|---|---|---|
| id | uuid | A when published |
| organizer_profile_id | person or couple; fixed at creation; edit keeps it (EVT-019 L6483) | A |
| created_by_account_id | | ORG, S |
| community_id | nullable; must be a `published` community hosted by the same organizer profile (person↔person, couple↔couple), EVT-038 L9101; preserved across edits (EVT-004) | A |
| title | 5–80 | A |
| type | enum `meetup` \| `workshop` \| `talk` \| `party` (label map also has `edu`, L4945, not offered in editor) | A |
| description | md 20–1500 | A |
| format | `offline` \| `online` | A |
| city | city id (offline) | A |
| area | text, required offline — «Район — виден всем» | A |
| exact_address | text, required offline — «Точный адрес — только допущенным» | **ADM + ORG** |
| join_url | https URL, required online — «только допущенным» | **ADM + ORG** |
| tz | IANA zone | A |
| starts_at, ends_at | ends_at > starts_at; starts_at in future at submit; optional multi-day end date | A |
| price | `free` \| `door{amount, currency ∈ €,$,£,₽,CHF}` \| `external{amount, currency, ticket_site}` (EVT-031/034) | A |
| requires_application | bool («участие по заявке») | A |
| application_questions | list; ≥1 required when requires_application (editor offers 1, `q0`); text limit implied | A (question), answers → ORG |
| requirements | text ≤500 (prototype splits into list) | A |
| cover_media_id / plate | 16:9 cover or colour plate | A |
| gallery_media_ids | list (event photos; past events show «Фотографии») | A |
| status | see lifecycle | per status |
| cancel_reason | text ≤300, optional (default «Организатор отменил событие.») | A |
| revision | bigint CAS | — |
| published_at, cancelled_at, created_at, updated_at | | |

Lifecycle (L6546–6553, L4544, L8773, L9116):
```
(draft → see 1.9)
submit ──person or trusted couple──► in_review ──staff approve──► published
submit ──couple, partner approval on─► pending_partner ─partner approves─► in_review   (V21 banner: «После одобрения событие уйдёт на проверку»)
pending_partner ─partner returns─► returned (author edits → new version → pending_partner) | author withdraws → back to a couple draft (step 4), event row deleted
in_review ─staff reject─► rejected (implied)
published ─organizer cancel─► cancelled (terminal; page stays with «Отменено» + reason)
published/cancelled ─ends_at passes─► past (derived, not a stored state)
published ─staff hide─► hidden (implied, moderation)
```
Invariants:
- Edit never drops interested people, RSVPs, applications, community link, or the couple hold (EVT-004, L6549).
- Change of time or place on edit → automatic announcement «Событие изменено: …» stored on the event + notification to participants (L6547–6548, EVT-019).
- `pending_partner`/`in_review` events are visible only to O (both partners) and S; not in catalog (`evFiltered` L6324), not in community page (L7652), not on profile (`orgEventsOf` L6863).
- Organizer cannot RSVP/apply to own event (`rsvpRow` requires `!orgMe`, L6389).
- No event chat: announcements are one-way («Ответить лично они не смогут — это не чат», L6577).
- No capacity/limit field in V21 (server's decision reason `capacity` exists).

### 1.9 `event_draft`
Owner: profile that wrote it (EVT-008: «drafts belong to the profile that wrote them», L6469; `evfDraft` L6537–6538).
Fields: id, owner_profile_id, created_by_account_id, form (partial jsonb of 1.8 fields + community_id), step 1–4, updated_at. Only constraint: non-empty title («Назови событие, чтобы сохранить черновик»). Visible: O only («видишь только ты / видите только вы двое»). Deleted on successful submit (L6551) or by owner (`evDraftRm` L6539). Couple-event withdrawal recreates a couple draft at step 4 (L9117). Editing a published event does not use drafts («В черновик» hidden in edit mode, L6489).

### 1.10 `event_participation` (RSVP)
Owner: participant profile; per profile (`rsvpMap` = actorStore, L4049; guide §5.2 «ответы на события»).

| Field | Type | Visible to |
|---|---|---|
| event_id, profile_id | | |
| status | `none` \| `interested` («Интересно / Нам интересно») \| `going` («Иду / Идём вдвоём») \| `not_going` («Не иду / Не идём») | O; ORG always; others only if `show_in_list` |
| show_in_list | bool, **default false** (EVT-012 L6443; «Организатор видит всегда») | O |
| ticket_self_marked | bool — «Билет уже куплен» on an external-ticket event, self-declared, never verified (L6455, EVT-029) | O |
| updated_at, acted_by_account_id | | ORG, S |

Rules: RSVP row exists only while event not cancelled, not past, not own; for `requires_application` events the RSVP choice is offered only after the application is approved (L6389). Clearing the answer also clears `ticket_self_marked` (EVT-028). In «Я» the couple's answer is shown and a personal answer is «не нужен» (EVT-037) — separate rows, no auto-copy.
Couple: `going`/`interested` from the couple when the partner requires approval → partner approval kind `event_rsvp` (version, withdrawable, replaceable; L6439–6441, `queueJointRsvp` L4550, EVT-009); the answer is not applied until approved; `not_going`/clear apply at once.

### 1.11 `event_application` (attendance request)
Owner: applicant profile (person or couple — «Заявка от пары», CPL-025 L6459). Evidence: E06 L6458–6465, E16 L6566, `appDecide` L6574–6576, `withdrawApp` L6445, `cDo` L6583.

| Field | Type | Visible to |
|---|---|---|
| id, event_id, applicant_profile_id | | applicant, ORG |
| answers | per question text 3–300 | applicant, ORG |
| note | optional ≤300 «Что важно знать организатору» (collected, **not shown** in E16 — gap) | applicant, ORG |
| requirements_accepted_at | required checkbox | ORG, S |
| status | `pending` → `approved` \| `declined` \| `withdrawn`; `approved` ⇄ `declined` (revoke with confirmation / «Всё-таки одобрить», EVT-018); `pending` → `closed` on event cancel (EVT-023) | applicant (own), ORG |
| decided_by_profile_id, decided_by_account_id, decided_at, revision | | ORG, S |

Applicant identity shown to organizer: nickname + age (both partners for a couple), plus answers; **never** private part or interests (E06 alert L6459). Re-apply allowed after withdraw «пока идёт набор». Invariant from guide/EVT-001: a pending application is **never** counted or listed as «идёт».

Derived **admission** (`evAccess` L6380): organizer always; otherwise not cancelled, not past, and `requires_application ? application.approved : participation.going`. Admission alone unlocks `exact_address` / `join_url` (venue sheet L6447: «Если доступ отзовут, он пропадёт»). Share link never reveals the address (`evShare` L6432).

### 1.12 `event_announcement`
Fields: id, event_id, text 5–500, auto (bool, system-written on time/place change), created_at, created_by_profile_id/account. Visible: participants (going/applicants) and ORG on the event page (EVT-016 L6411). Not repliable.

### 1.13 `event_reminder` (implied, system)
K05 category «События: изменения, отмены, напоминания за день» (L8284); cancel copy «Новые заявки и напоминания остановятся» (L6582). One reminder ~24 h before `starts_at` to admitted participants (interested? — open question); cancelled on event cancel or participant leaving. Implement as scheduled outbox job, no table needed beyond a dedupe key.

### 1.14 Per-profile bookmarks (belongs to saved-items domain)
`saveEvent` L6431 («Сохранено. Это не ответ «Иду»»), `saveDisc21` (C06). Prototype keeps events in `S.me.saved.events` (personal only) — guide §5.2 says saved belongs to the acting profile → key by profile.

---

## 2. Commands (writes)

General: every command takes `actingProfileId` (person or couple; server checks membership in the couple and couple active, guide §5.1), `operationId` (idempotency, replay returns the stored receipt), and `expectedRevision` for updates. All writes go through the outbox for notifications/«Нужно решить»/moderation/search.

### 2.1 Communities

| Command | Input | Who may call | Effects | Errors / limits |
|---|---|---|---|---|
| `community.create` | name, description, topics[1–3], privacy open\|closed\|hidden, joinQuestion?, location, rules[], coverMediaId?\|plate | any eligible profile; couple allowed («Ведущие — вы оба», L7739) | community(in_review, rev 1) + membership(owner) ; couple: also couple membership; staff review item; outbox `community.submitted`; couple → notify partner `coupleAct:community` (L7754) | `name_taken`, validation (field-level, L7751); cover must pass media scan; rate limit implied |
| `community.update` | id, rev, name, description, rules | owner (prototype: owner only, `v6CommunityEdit` L8591) | updates fields; prototype saves immediately without review (see §7) | name <3 / no rules → 422 |
| `community.setPrivacy` | id, rev, privacy | owner (`c10Priv` L7762) | open→closed hides discussions/members from non-members at once; →hidden removes from catalog/search; hidden→open/closed puts it into the catalog | widening while in_review? (open q) |
| `community.invite.create` / `.revoke` | id | owner/host of a hidden community (implied) | token | — |
| `community.join` | id, rulesAccepted=true, answer? (closed/hidden) | any eligible profile not owner/member/pending (`communityJoinAllowed` L7697); couple allowed | open → membership(active, joined_via open_join), counter +1; closed/hidden → join_request(pending) + `pendingJoin`; couple → notify partner `coupleAct:join` (no approval in V21); hosts get «Нужно решить» `capp` | community in_review/unknown → 404; already member/pending → 409; answer <10 when question exists, rules not accepted → 422 inline (COMM-005); removed member joining an *open* community — open q |
| `community.request.withdraw` | requestId | applicant profile | request → withdrawn (hosts see «Отозвана» in history); couple's withdraw withdrawn for hosts too (L7716) | not pending → 409 |
| `community.request.decide` | requestId, rev, decision approve\|decline | owner (prototype); hosts per copy «Сможет принимать заявки» (L7683) — implied | approve: membership(active, joined_via request), counter +1, clears previous `removed`; notify applicant `groupok`/`groupno`; resolves «Нужно решить» for **all** hosts / both partners | community not published, request changed, own request, applicant blocked → 409/404 |
| `community.request.undo` | requestId | decider, short window (toast «Отменить», L8588) | reverts to pending, removes membership | implied; could be client-side delayed send |
| `community.leave` | id | member (not owner) | membership → left, counter −1; own discussions stay | owner → 409 |
| `community.member.setHost` | id, profileId, on | owner | role host/member; notify `hostAdded`/`hostRemoved`; host stays member | target not member → 404 |
| `community.member.restrict` | id, profileId, readOnly | owner (hosts implied) | restriction row add/remove; notify `communityMuted`/`communityUnmuted` | target is host → 409 |
| `community.member.remove` | id, profileId | owner (hosts implied) | membership → removed (once), counter −1 once, approved request → `removed`, notify `communityRemoved`; target loses closed content immediately | already removed → idempotent no-op; target owner → 409 |
| `community.notifications.mute` | id, muted | any profile (per profile) | mute row | — |
| `community.report` | id, reason, details? | any viewer | report → staff queue | see §5 |

### 2.2 Discussions

| Command | Input | Who | Effects | Errors |
|---|---|---|---|---|
| `discussion.create` | communityId, title, text, media[], poll?, tags[], people[] | member with write right (`communityAuthorAllowed` L4512); couple: couple is member **or** both partners members and not restricted | person → published at once (prototype: no staff review even with media, L6275 `hasPhoto … &&!d.community`, path L6294); couple without trust → partner approval kind `discussion` (`submitJointPost` L4540, `commitJointPost` L4562–4566) → published on approval, partner notified `workApproved`; tagged people → tag consent flow (feed domain) | not member / restricted → 403 with reason text (`coupleAuthorBlock` L4075: «Не все из пары состоят…») |
| `discussion.reply` | discussionId, parentId?, text, media? | as above with kind `comment`; couple replies are **immediate** (only `coupleReply` notice, L7731) | reply row; notify discussion author/parent author (`notifyReply`) | parent deleted / author blocked → 409 |
| `discussion.react` / `reply.react` | id | member (COMM-900: non-members get «Ставить отметки и отвечать могут участники», L9095) | per-profile reaction; notify author `postLike` | 403 |
| `discussion.pin` | id, pinned | hosts (`isHost` L6053) | pinned flag | — |
| `discussion.setPopularExclusion` | id, excluded | hosts | flag (feed «Популярное» respects it) | — |
| `discussion.delete` | id | author profile | delete + replies gone (L6061) | — |
| `discussion.remove` | id | hosts | status removed_by_host; notify author `discRemoved` (L6062) | — |
| `discussion.save` / `.report` | id | readers | bookmark / report | — |

### 2.3 Events

| Command | Input | Who | Effects | Errors / limits |
|---|---|---|---|---|
| `event.draft.save` | draftId?, form (partial), step, actingProfile | any eligible profile | upsert draft owned by acting profile (EVT-008) | empty title → 422 |
| `event.draft.delete` | draftId | owner profile | delete | — |
| `event.submit` | draftId? + full form, actingProfile | any eligible profile; couple | validate all 4 steps (L6520); create event; person/trusted couple → `in_review` + staff item; couple untrusted → `pending_partner` + partner approval kind `event` (v1) + partner «Нужно решить»; trusted couple → `coupleAct:event` notice; delete the draft | start in past, end≤start, missing addr/area/link, bad URL, missing price/ticket site, approval without question → 422; community not hosted by acting profile / not published → 403 |
| `event.update` | id, rev, form | organizer profile (either partner of a couple, implied) | replace form fields only; keep participations/applications/community/hold (EVT-004); if time or place changed → auto announcement + notify participants; if `pending_partner` → new partner-approval version (EVT-005) | cancelled → 409; review policy — §7 |
| `event.withdrawPending` | id | couple author while `pending_partner`/`returned` | delete event, recreate couple draft (step 4), drop partner notifications (L9116–9117) | not author → 403 |
| `event.cancel` | id, rev, reason ≤300 | organizer | status cancelled; pending applications → `closed`; reminders cancelled; notify going/interested/applicants (toast promises it, L6583 — implied) | already cancelled → idempotent |
| `event.announce` | id, text 5–500 | organizer | announcement row; notify participants (copy: «все, кто ответил «Иду» или подал заявку»; code: only `crowd.going`, L6578) | text <5 → 422 |
| `event.rsvp.set` | id, status interested\|going\|not_going | any eligible profile except organizer; event published, not cancelled, not past; if requires_application → only after approval | upsert participation (show_in_list keeps value, default false); couple + partner requires approval + status widening → partner approval `event_rsvp` (replaces older pending version) instead of write; trusted couple → `coupleAct:rsvp` notice | 409 when cancelled/past; repeat same pending answer → no-op «уже ждёт» |
| `event.rsvp.clear` | id | participant | status none, ticket mark cleared; undo allowed (re-set) | — |
| `event.rsvp.setVisibility` | id, show | participant (not organizer) | show_in_list | cancelled/past → 409 |
| `event.ticket.mark` / `.unmark` | id | participant on external-ticket event | ticket_self_marked; mark also sets status going (L6455) | no external tickets → 422 |
| `event.application.submit` | id, answers[], note?, requirementsAccepted | eligible profile (couple allowed, no partner approval in V21) | application pending; participation status set to `going` in prototype (L6465) — server should keep application separate and not count it (EVT-001); ORG «Нужно решить» `eapp` + notification (implied) | answers <3 chars / not accepted → 422; existing pending → 409 |
| `event.application.withdraw` | id | applicant | withdrawn, organizer stops seeing it | not pending → 409 |
| `event.application.decide` | applicationId, rev, decision approve\|decline | organizer profile (both partners for couple event, L7943) | pending→approved/declined; approved→declined = revoke (confirm; address disappears for them); declined→approved; notify `evapp` / `evdeclined`; one decision at a time (EVT-017: lock both buttons, CAS); undo via toast | event cancelled → 409; stale rev → 409 |
| `event.save` / `.unsave` | id | any profile | bookmark (not an RSVP) | — |
| `event.report` | id, reason, details | any viewer | moderation | §5 |

### 2.4 Partner approvals in this domain (rows in shared `partner_approvals`)
| kind | created by | approve effect | return effect | withdraw |
|---|---|---|---|---|
| `event` (couple event create/edit) | `event.submit` / `event.update` while held | event → `in_review` (prototype publishes directly, L4544 — **don't copy**), notify initiator `workApproved:event` | `returned` with optional note ≤300 («Вернуть с комментарием»), initiator gets edit/withdraw | → couple draft |
| `event_rsvp` | `event.rsvp.set` from couple | participation written, `show:true` (L4545) | «Предложить иначе» with note | delete request |
| `discussion` | `discussion.create` from couple | discussion published | returned | withdraw |
Each approval: version, pair id, initiator account, reviewer must be the other partner, stale if pair safety/approval epoch changed (`validAuthor`/`approveJointWork` L4541).

### 2.5 Staff commands
| Command | Effect |
|---|---|
| `staff.community.decide` approve\|reject (reason) | in_review → published/rejected; notify owner (approve notice implied; prototype only clears status, L8772) |
| `staff.event.decide` approve\|reject (reason) | in_review → published + `evok` to organizer (L6552); reject implied |
| `staff.community.hide` / `staff.event.hide` / `staff.discussion.hide` | from reports |
| `staff.report.resolve` | dismiss / hide / restrict author |

---

## 3. Queries (reads)

| Query | Input | Viewer-dependent projection | Pagination |
|---|---|---|---|
| `community.catalog` | topics[] (multi, OR), privacy any\|open\|closed, onlineOnly, cursor | published, non-hidden; plus own in_review for O (L7623); blocked owners excluded (implied); returns card: name, cover/plate, privacy, member_count, city/online, topics, viewer state (member/pending/host) | cursor 20 (prototype `firstLoad`) |
| `community.mine` | actingProfile | three groups: «Ты ведёшь / Вы ведёте» (hosted **as this profile** — COMM-003: couple communities in «Мы», personal in «Я»), «Ты участник / Пара участвует», «Заявки на рассмотрении / Заявки пары» (L7629) | — |
| `community.get` | id | header (always for visible community): name, desc, rules, topics, privacy (hidden shown as «скрытое · по приглашению», COMM-007), member_count, location, muted flag; viewer state + action (join / request / withdraw / member pill / manage + pending-request count for owner, COMM-012); next upcoming event; review banner for O | — |
| `community.discussions` | id, cursor | **closed/hidden non-member → locked veil, no titles** (L7662); pinned first then newest; couple-authored hidden if couple inactive; blocked authors hidden | cursor |
| `community.events` | id | published, not past, not in review (L7654) — open q for closed communities | — |
| `community.members` | id, cursor | non-member of closed → «доступен после вступления» only count; hosts first (couple host = one «вы» row, COMM-016), then `listed` members; exclude removed, blocked, own partner (shown merged), viewer shown as «это ты / это вы» row; owner sees row actions + «не может писать» subtitle | 20 per page («Показать ещё», L7688) |
| `community.requests` | id, tab pending\|history, cursor | H only: applicant row, relative time, answer, status label | cursor |
| `community.manage` | id | O: counts (members, discussions, reports), pending requests badge, privacy | — |
| `discussion.get` | id | full discussion + reply tree; member gets composer, non-member «Отвечать могут участники»; couple-author unavailable when couple inactive | replies cursor (implied) |
| `profile.communityContext` | profileId | «Ведёт сообщество X (и ещё N)», «Вместе с тобой в A, B» — only communities where the other is a *listed* member and the viewer is member (L6866–6869); organised upcoming published events (`orgEventsOf`) | — |
| `event.catalog` | format all\|offline\|online, when any\|week\|weekend\|month, types[], price any\|free\|paid, openOnly (no application), cursor | published, not past; own in-review visible to O; **offline = viewer's city only** (L6325); groups «скоро» (<7d), «позже», «отменённые» (L6335) | cursor |
| `event.get` | id | public: everything in 1.8 marked A; place row = area + city / «Онлайн»; exact_address/join_url only when admitted or ORG (EVT-015), else hint («откроется после одобрения / когда ответишь «Иду»», hidden for past/cancelled, EVT-014); my participation, application status, ticket mark, partner-pending answer («Ждёт Kira», EVT-009), couple's answer shown in «Я» (EVT-037); times in event tz for offline, viewer tz for online + organizer tz when different; announcements; crowd summary; review/hold banner for O | — |
| `event.attendees` | id, kind going\|interested\|attended, cursor | «Идут» = approved applications (approval events) or `going` RSVPs; «Интересуются» = `interested`; only rows with `show_in_list` for non-organizers; couple = one row counted as two (EVT-003); line «Ещё N скрыли участие» for guests only (EVT-002); organizer sees everyone; viewer's own row only if shown, else «Тебя нет в списке…» note; past event → «Были» | cursor |
| `event.mine` | actingProfile | groups: going, waiting (couple answer pending partner), applications, interested, organising, past (attended), cancelled; drafts of this profile (EVT-008) (L5044, L6469) | — |
| `event.organizer.dashboard` | id | ORG: status pill (published / in review / «Ждёт Kira» / cancelled), next-step hint, tiles: approval events → pending/approved/interested; else going/interested (EVT-001/024); sent announcements | — |
| `event.applications` | id, status pending\|approved\|declined | ORG: applicant (nick, age; both for couple), answers, actions | cursor |
| `event.interested` | id | ORG: people who publicly marked interested (copy) — prototype lists all interested (L6571) | cursor |
| `needs.decide` (shared) | — | items from this domain: `capp` (community join requests for O — couple-owned visible to both partners), `eapp` (pending event applications for ORG — couple events to both partners), partner approvals `event`, `event_rsvp`, `discussion` (pending for the other partner; returned for the initiator) (L7938–7946) | — |

---

## 4. Notifications and «Нужно решить»

Addressee: person or couple (couple → both partners, labelled «Паре», NTF-001). Muted community suppresses `group` notifications for that profile (L9140). Category «События» / «Сообщества» in K05 (L8284–8285: groups default push off, email off).

| Type (prototype key) | Trigger | Addressee | Actions |
|---|---|---|---|
| `groupok` «Тебя приняли в …» | join request approved | applicant profile | open community |
| `groupno` (implied text) | request declined | applicant | — |
| `hostAdded` / `hostRemoved` | owner changes role | member | open community |
| `communityMuted` / `communityUnmuted` | read-only toggled | member | — |
| `communityRemoved` | member removed | removed profile | — |
| `discRemoved` | host removed a discussion | author | — |
| `group` «Новые правила в …» | community update/news (seed only, L3701/3703) | members (not muted) | open rules — implied |
| reply / `postLike` on discussion | reply or reaction | author / parent author | open C06 |
| community submitted / approved / rejected | staff decision | owner profile | implied (only status flip in V21) |
| new join request | `community.join` closed | hosts | «Нужно решить» `capp`: Одобрить / Отклонить (approve first, COMM-011) |
| `evok` «Событие … опубликовано» | staff approved | organizer | open E15 |
| `evapp` «Заявка на … одобрена» | application approved | applicant | open event |
| `evdeclined` | declined or admission revoked | applicant | — |
| new application | `event.application.submit` | organizer | «Нужно решить» `eapp`: Одобрить / Отклонить |
| `event` «Изменение: …» | announcement (manual or auto on time/place edit) | participants | open event |
| event cancelled | `event.cancel` | going/interested/applicants (implied) | similar events |
| reminder day before | scheduler (implied) | admitted participants | open event / venue |
| `pair:eventApproval` «Событие от пары … ждёт тебя» | couple event pending | other partner | «Нужно решить»: Одобрить / Вернуть с комментарием; initiator: Изменить / Снять событие |
| `pair:rsvpApproval` «Ответ пары на … ждёт тебя» | couple RSVP pending | other partner | Согласиться / Предложить иначе; initiator: Изменить / Отозвать |
| `pair:postApproval` (discussion) | couple discussion pending | other partner | Одобрить / Вернуть |
| `pair:workApproved` (event/rsvp/post) / `workReturned` | partner decided | initiator | open item |
| `pair:coupleAct` (join, community, event, rsvp, like) / `coupleReply` | the couple acted without needing approval | other partner | info only |
Withdrawn or replaced couple requests remove their stale «ждёт тебя» notifications (`dropPairNotifs`, L9148).

---

## 5. Moderation hooks

| Object | Auto-checks | Staff review | Reports |
|---|---|---|---|
| Community | text safety (name/desc/rules), cover → media scan (must be `safe`) | **mandatory pre-publication** («Отправить на проверку», L7749) | `community.report` from «⋯ → Пожаловаться» (L7692); host tile «жалоб» in C10 implies hosts see reports about their community (empty in V21) |
| Community edits / privacy widening | text safety | prototype: none (immediate) — recommend re-review of name/description/cover, see §7 | — |
| Discussion | text safety, media scan; people tags need consent | prototype: none (published at once) — media must at least pass the media pipeline before others see it | report reasons: threat, private, minor, spam, other + details ≤500 + «Также заблокировать» (L7094–7100); host remove; staff hide |
| Discussion reply | text safety | — | report |
| Event | text safety, URL safety (https, no IP/localhost — already in `event-contract.js`), cover/gallery scan | **mandatory pre-publication** («обычно до часа», L6411) | `event.report` (L6433) |
| Event edit of published | text/URL safety | prototype: none — see §7 | — |
| Join answers / application answers | text safety (no intimate details hint) | — | — |
| Community restriction/removal, application revoke | audit log for S | — | — |
| «Популярное» | excludes discussions with reports, unreviewed photos, untagged consent, host-excluded (`popInfo`, L6051) | — | — |

---

## 6. Mapping to the existing server

| V21 entity | Existing | Verdict |
|---|---|---|
| community | `feture_groups` (`20261012235000`): owner_hash, slug, title 2–100, summary ≤500, rules ≤2000, visibility public\|closed, state draft\|pending\|published\|hidden\|deleted, revision (`20261013001000`); `feture_group_operations` receipts; RPC `feture_group_catalog_command` (catalog/preview, wired in `lib/feture/groups.js`) and `feture_group_owner_command` (mine/save/submit/delete — SQL + `tests/group-owner-postgres.mjs` only, **not wired** in JS) | **Rework**: owner_hash → owner_profile_id + acted_by; privacy add `hidden`; add topics, location, join_question, plate, cover_media_id, counters; rules as list; slug not used by V21 (keep internal or drop); V21 has no owner drafts (create = submit) — keep `draft` state unused or drop; add staff review for groups (none exists) |
| community_membership, roles | none (mvp card C03 planned owner/mod/member) | **New** |
| community_join_request | none | **New** |
| community_restriction | none | **New** |
| community_notification_mute | `docs/community-follow-mute.md` covers author mute in feed, not communities | **New** (prefs) |
| community_invite | none | **New** (implied) |
| discussion + replies | feed posts `feture_*` posts (`20261011133134` …), `post-comments.js`, `post-reactions.js`, `post-reports.js`, `post-photos.js`, `post-bookmarks.js` | **Rework/extend**: add `community_id`, title, pinned, excluded_from_popular, host removal; ACL = community membership/restriction; reuse comments/reactions/reports/media |
| event | `feture_events` (`20261013002000`): owner_hash, `draft` jsonb (EventDraft: title ≤120, summary, description ≤6000, conditions ≤3000, format, visibility public\|private, startsAt/endsAt, timeZone, language, city, publicLocation, privateLocation, privateJoinUrl, ticketUrl, price{amountMinor,currency}), state draft\|pending\|approved\|rejected\|published\|hidden\|cancelled\|deleted, revision; `submitted_at`; contract in `event-contract.js`; repo `events.js` | **Rework**: owner → profile + acted_by; add type, requires_application, application_questions, community_id, cover/gallery media, plate, area (= publicLocation), price variants door/external (ticketUrl + amount), cancel_reason; add `pending_partner` (+ `returned`) state; V21 has no `visibility private`, `language`, `summary` (drop or keep hidden defaults); title 5–80 and description 20–1500 are stricter in V21; offline city now must be the city id. Two-stage staff approve→publish (`approved` then `feture_event_staff_publish`) vs V21 single «проверка → опубликовано» — keep internally or collapse |
| event_draft | drafts are `feture_events` rows in state `draft` requiring a fully valid EventDraft | **New** lenient `event_draft` (partial form + step + profile) or relax validation for state draft |
| staff review | `feture_event_reviews` + `events-staff.js` (`feture.events.queue/decide/publish`), `feture_event_publications` | **Keep** (re-key actors), add community review analogue |
| cancel | `20261013002500` owner cancel (works after eligibility expiry) | **Keep**; add reason, close pending applications, outbox notifications |
| event_participation | `feture_event_rsvps` (event, actor_hash, status interested\|going\|declined\|withdrawn, visible_to_attendees default false, revision) + ops receipts (`20261013002600`) | **Keep/rework**: actor → profile; `declined`→`not_going`, `withdrawn`→`none`; add ticket_self_marked; couple partner approval path; RSVP currently requires `visibility='public'` and no tie to applications |
| event_application | `feture_event_attendance_requests` (state pending\|withdrawn\|approved\|declined, PK event+actor) + `feture_event_attendance_decisions` (reasons reviewed\|capacity\|policy\|safety\|other) + reactivation trigger (`20261013002800/2900/3200`) | **Rework**: store answers + note + requirements_accepted_at; allow approved⇄declined (revoke/reconsider) — current trigger/decision only from pending; add `closed`; approval must **grant admission** (exact address / join URL) — current SQL explicitly grants no venue |
| admission / venue reveal | none (privateLocation never exposed) | **New** read path gated by admission |
| attendee lists | `20261013003300` organizer roster (rsvp + approved requests, nickname); `20261013003400` peers visible only to viewers with their own active opted-in RSVP | **Rework**: V21 shows opted-in going/interested to any viewer of the event + hidden count; decide (open q) |
| counts | `events.rsvpStatus` returns interested/going counts (nullable) | Keep; add hidden-count, couple counts as two |
| event_announcement | none | **New** |
| reminders | none | **New** (scheduler + outbox) |
| bookmarks of events/discussions | `post-bookmarks.js` posts only | **Extend** to events/discussions, keyed by profile |
| reports for community/event | `post-reports.js` posts only | **Extend** targets |
| partner approvals (event, event_rsvp, discussion) | none | **New** — shared `partner_approvals` |

---

## 7. Open questions and unsafe prototype behaviour

1. **Couple event skips staff review after partner approval.** `approveJointWork` sets `e.status='published'` directly (L4544) while the banner promises «После одобрения событие уйдёт на проверку» (L6411, L6560). Server: partner approval → `in_review`.
2. **Edits bypass review.** Published event edits «сохранятся сразу … событие остаётся опубликованным» (EVT-019, `status:old.status` L6549); community name/description/rules saved immediately (`v6CommunitySave` L8592); privacy can go hidden→open (into the catalog) at once (L7762). Feed posts use «мелкая правка — сразу, крупная — на проверку» (guide §4 B, FEED-012). Decide the same policy here; at minimum re-check text/URL/media automatically.
3. **Discussions with media are published without review** (`hasPhoto=…&&!d.community`, L6275; `publishDiscussion` L4539). Media must go through `media_asset` scanning; explicit media is not allowed in public places — closed community discussion: public or private place?
4. **Couple widening actions without partner consent**: community creation as the couple (only `coupleAct` notice, L7754), joining/requesting a community as the couple (L7712), event application as the couple which reveals both partners' nicknames and ages (L6459/L6465), couple replies in discussions (L7731), couple reactions. Decision says publish/open access/widen visibility needs partner consent — which of these count?
5. **Who besides the owner manages a community.** All management checks `ownsCommunity` (owner only), but «Сделать ведущим» says a host «Сможет принимать заявки и следить за порядком» (L7683), and `isHost` (owner + mods) can pin/remove discussions (L6053). Need a permission matrix: owner vs host (decide requests? restrict/remove members? remove other hosts? edit rules?). For a couple-owned community, either partner acts alone (L7943).
6. **Removed person and open communities.** Removal copy says «Вступить снова сможет только по новой заявке» (L7687), but `communityJoinAllowed` (L7697) does not check `communityRemoved`, so a removed member can rejoin an open community instantly. Server needs a `removed` block (ban) that forces a request even for open communities, or an explicit «бан».
7. **Restrictions vs couple identity.** `communityMemberCanWrite` checks restrictions per member id, but the couple path in `communityAuthorReason` (`social('couple').joined.has(id)`) skips restriction checks (L4512). Must a restriction on a partner also block «от пары»? Can a couple profile itself be restricted/removed?
8. **Couple membership counting** — events count a couple as two (EVT-003); communities do not say. Member count, «Ведёт» row and member list for couples need a rule.
9. **Member list exposure.** Membership in 18+ kink communities is sensitive. Prototype lists only seeds/`showMember:true`; every new request gets `showMember:false` and there is no toggle (L7712). Proposed default `listed=false` + a member-side toggle (not in V21 → confirm). Open-community member lists are readable by non-members (`canRead`, L7667).
10. **Hidden community access by URL.** Invite is a plain community link (`copyReviewLink('C03',{id})`, L7761); C03 opens for anyone with the id (L7652). Server: unguessable revocable invite token; without it a hidden community is 404.
11. **Events of closed/hidden communities** are shown in the community «События» tab and in the global catalog regardless of membership (L7654, `evFiltered` L6322). Should they be members-only?
12. **Application vs RSVP state.** `sendApp` writes `status:'going', app:'pending'` (L6465); counting logic then excludes it (EVT-001, L6365). Server must keep them as separate records; «pending is not идёт» must hold in every count and list (organizer tiles, E18, «Мои события», reminders, announcements).
13. **«Интересуюсь» on application events.** The RSVP row is hidden until the application is approved (L6389), yet the seed own event e8 (approval) has `interestedPeople` (L3720) and E15 shows an «интересуются» tile for approval events (L6562). Can a non-applicant mark «Интересно» on an application event?
14. **Attendee list audience.** V21: any viewer sees opted-in going/interested and a hidden count (E18, L6373–6377). Existing server (E04c2) shows peers only to viewers who themselves have an active opted-in RSVP. Choose one.
15. **Announcement recipients.** Copy: «Получат все, кто ответил «Иду» или подал заявку» (L6577); code notifies only `crowd.going` (L6578). Include interested? pending applicants?
16. **Cancellation/reminder notifications** are promised only by copy (L6582–6583: «Участники получат уведомление»); no code. Same for reminders («напоминания за день», L8284). Confirm audience (going + approved; interested?).
17. **Staff rejection** of communities/events has no UI or copy (QA only approves, L8761–8773). Need reject reasons, owner notification, edit-and-resubmit path.
18. **Couple dissolution/deletion** (`dissolvePair`/`expirePair`, L4517–4524) handles posts and discussions authored by the couple but not couple-owned communities, couple-organised events, couple memberships, RSVPs or applications. Need rules (freeze? transfer to a partner? cancel future events with notification?).
19. **Undo windows**: request decisions, application decisions and RSVP clear offer «Отменить» in a 4 s toast (L8588, L6575, L6438). Server: compensating command within N seconds vs delayed client send.
20. **Saved events are personal only** (`S.me.saved.events`, L6431) although the guide puts saved items on the acting profile.
21. **`excluded_from_popular` lives in viewer state** (`S.popOff`, L6058) — must be a property of the discussion set by hosts.
22. **Application `note` is collected but never shown** to the organizer (E06 L6461 vs E16 L6567). Show or drop.
23. **Price as free text.** Prototype builds a display string («15 €»); server already uses amountMinor + ISO currency; ₽/€/$/£/CHF map to RUB/EUR/USD/GBP/CHF. «external» price is «со слов организатора» and never verified (L6452).
24. **Event `type` `edu`** exists in the label map (L4945) but not in the editor — drop or add.
25. **Offline catalog filter = viewer's city only** (L6325) — derived from profile city (location domain) or explicit filter?
26. **Multiple application questions** — data supports `q[]`, UI only `q0`; community `questions[]` likewise. Fix at one or allow N?
27. **Community creation has no drafts** and goes straight to review; events have drafts. Confirm asymmetry is intended.
28. **Rate limits/quotas** for creating communities/events, join requests, applications, announcements are absent in V21 — server should add sane defaults (not product-visible).
