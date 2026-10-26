# FEED & CONTENT — server domain requirements from prototype V21

Scope: posts (text / media / poll / interests / article), audiences, composer and drafts, edits and review, replies, reactions, poll votes, mentions, photo marks (people on photos), topics, saved, «Скрытое в ленте», follows and article subscriptions, activity stream, feed composition, reports and moderation of posts, galleries and albums, content search.
Source: `apps/feture/public/prototype-v21.html` (line numbers are given as `L1234`), V21-INTEGRATION-GUIDE §5/§11, V21-CHANGELOG (FEED-001…043), existing `lib/feture/*`, migrations, `docs/community-posts.md`, `community-follow-mute.md`, `moderation.md`.

Conventions:
- **P** = profile (person | couple). The acting profile is always explicit (`actingProfileId`). Each write stores `profile_id` (owner) and `acted_by_account_id`.
- Visibility tags: `owner` (members of the owning profile), `partner` (other member of a couple), `followers`, `anyone` (any eligible signed-in 18+ viewer not blocked either way), `granted` (viewer holds a private-part grant from the author), `tagged` (people marked on the photo), `staff`.
- "implied" = V21 implies it but has no explicit UI or code.
- Blocks are owned by the blocks domain; here: "not blocked" means **no block in either direction between the viewer's acting profile and the author profile**. The prototype checks only the viewer's own blocks (`isBlocked` L4356). The server must check both directions.

---

## 1. Entities

### 1.1 `post`
Owner: profile. One post type with optional parts (L4713 «one post type with optional attachments»). `type`: `post` | `note` (article). Composition is derived from the parts (`postKinds` L4715: note / text / photo / poll / result).

| Field | Type / constraint | Visible to | Evidence |
|---|---|---|---|
| id | uuid v7 | per visibility | |
| profile_id | fk profile (person or couple) | per visibility | `author` |
| created_by_account_id | fk account. For a couple: the member who created it. Drafts are visible only to that member. | owner | `creator`, `ownPost` L6192 |
| type | `post` \| `note` | per visibility | `postFromDraft` L6267 |
| title | text 3–120, **note only** | per visibility | `validatePost` L6246 |
| body_md | safe Markdown subset. Post ≤1000 chars. Note 20–10 000 chars. May be empty if media, poll or interests exist. | per visibility | L6246, `md()` L4730ff |
| audience | `all` \| `followers` \| `granted` \| `only` (see §1.2) | owner. Viewers see a badge for non-`all` | `AUD` L6181, badge in `postCard` L4898 |
| in_feed | bool, default true. `false` = «не в ленте»: kept out of the feed, topic pages, search and Popular. Shown in the profile, the gallery and «Мои публикации» (marked «не в ленте»). | owner sees the mark | `galleryOnly`, `filterPosts` L5695, FEED-003 L9047 |
| topics | topic_id[] ≤3, from the published topic catalog (admin-hidden topics are excluded) | per visibility | `ACT.postTag` L6225, `ADMIN_HIDDEN_TOPICS` L3451 |
| media | ordered list ≤6 of `media_asset` refs (image / video). Aspect 4:5, 1:1 or original. | per visibility; explicit media are never in public places | `MEDIA_MAX` L5116, `ACT.postMedia` L6227 |
| album_id | fk album, nullable. Only when media exist and audience ≠ granted. | owner, viewers of album | L6203, `ACT.setAlbum` L6234 |
| poll | see `post_poll` | per visibility | |
| interests_snapshot | ≤4 entries `[topic, level 1–10, direction[]]` copied at publish from the author profile's **public** interests (not limits, not hidden) | per visibility | `resEligible` L6185, `postFromDraft` L6267 |
| status | `draft` \| `review` \| `published` \| `removed` \| `archived` (couple post hidden / pair dissolved) | owner. Others see only `published`. | L6289, `delPost` L5850, `dissolvePair` L4517 |
| pending_revision_id | nullable fk `post_revision`. A major edit in review; viewers keep seeing the live version. | owner | `pendingEdit` L6289 |
| version | int, increments on every committed change (CAS for couple approvals) | owner | `commitJointPost` L4562 |
| author_name_snapshot | couple name at publish, nullable | per visibility | `authorName` L6267 |
| approved_by_account_ids | for couple posts: the [creator, approver], or both when delegated | owner | `commitJointPost` |
| unmentioned_profile_ids | profiles that removed their mention. Rendered as plain text, without a link. | per visibility | `ACT.unmentionMe` L6146 |
| disputed | {by_profile, at} \| null. Someone objected that they are in the photo. Hidden for everyone except the author until staff decide. | owner (reason only), staff | `tagObject` L6027 |
| removed_reason | `consent` \| `report` \| null | owner, staff | `modDecide` L6110 |
| published_at, updated_at, edited | timestamps | per visibility | |

Counters (derived, never trusted from client): `like_count`, `reply_count` (live and visible only, FEED-008, L9031), `poll totals`. V21 shows **no view counts**.

Lifecycle (`status`):

| From → To | Trigger | Rule |
|---|---|---|
| ∅ → draft | `post.saveDraft` | text or media required (L6272) |
| ∅/draft → published | `post.publish`, **no media** | text-only posts are not pre-moderated (`editNeedsReview` returns false without media, L6262) |
| ∅/draft → review | `post.publish` **with media** | «Отправлено на проверку», «обычно до 30 минут» (L6275, L6289) |
| review → published | staff / auto media approval | notif `postok` (L8768). The rejection path is **not in V21** (open question) |
| published → published (live edit) | minor edit | see §1.4 |
| published + pending_revision | major edit | the old version stays live; on approval it replaces the post |
| any → (deleted) | person author deletes | hard delete with replies (L5850) |
| published → archived | couple post «Скрыть совместную публикацию» | goes to a private archive; media detached; the pending queue item is cancelled (L5850) |
| published → removed | staff decision | the author still sees it with a banner and may delete it (L5995 `consentNote`) |
| couple posts → archived | pair dissolved; after 30 days media wiped and couple replies cleared | `dissolvePair`, `expirePair` L4517–4518 |

Invariants:
- A post is visible to others only if: status=published, not removed, not disputed, **all photo marks are `ok`**, the audience rule passes, and there is no block in either direction (`postVisible` L5998, `mediaPreviewAllowed19` L6940).
- Text ≤1000 for `post` (switching an article back to a post is refused while text >1000, L6232). Poll needs the question and 2–10 distinct options.
- A post needs at least one of: text, media, poll, interests (L6246).
- An album with `vis=followers` forces its posts to `audience=followers` (L6234, L5888).
- `granted` posts never go to a gallery album or the profile gallery (L5869, L6203).
- A person post always belongs to the person. A couple post is created only through the couple-approval flow (§2).

### 1.2 Audience semantics (`mediaPreviewAllowed19` L6940)
| audience | Who may read (besides owner) | Notes |
|---|---|---|
| `all` | anyone eligible | the only audience allowed in Popular (L6037) and in activity cards (`activityOf` L7524) |
| `followers` | viewers whose **acting profile** follows the author profile | `social().follows.has(author)` |
| `granted` | viewers with an active private-part grant from the author. **Per-media scope**: every image needs scope `photos` and every video needs `video`. A text-only post needs `info`. | ties to the access-grants domain (`receivedGrant`) |
| `only` | nobody but the owner (private media library) | listed in the badge (L4898) and the editor init (L6197), but not offered in `AUD()`. Belongs to the media/private-part domain. |
Audience order for "widening": `only < granted < followers < all` (L6264).

### 1.3 `post_draft_edit` (S.postEdits) — saved changes of a published post
Owner: profile. At most one per post. Visible to the owner only (the couple's saved edits only in «Мы», FEED-041).
Fields: post_id, payload (same shape as the draft: text, title, topics, audience, media refs, poll, interests selection, album, people, note flag), saved_by_account_id, saved_at.
Transitions: create/replace (`post.saveEdits`), discard (`post.discardEdits` L6314), consumed by `post.publish`. «Опубликованная версия не изменится» (L9062).

### 1.4 `post_revision` (major edit pending review)
Created when a published post is edited and `editNeedsReview` is true (L6262):
- the post has media **and** any of these holds:
  - a new media item not present before;
  - the audience widens (by the order in §1.2);
  - added words > max(12, 30% of the old word count). Words are counted as a bag over title+text.
- A post without media **never** needs review, even for edits.
Fields: id, post_id, payload snapshot, submitted_by_account_id, status `review|approved|rejected|superseded`, created_at.
On approval the payload replaces the live version and is published. A newer edit supersedes an open revision.
Visible: owner (listed as «Правки на проверке», L6301), staff.

### 1.5 `post_poll`, `poll_option`, `poll_vote`
- poll: post_id, question ≤200, options 2–10, each ≤80 chars, unique case-insensitive (L6246, `POLL_MAX` L6183).
- poll_vote: (post_id, **voter_profile_id**) unique, option_index, acted_by_account_id, at. A vote belongs to the acting profile (FEED-002, `myVote` L9026, `setVote` L5840). The person's vote and the couple's vote are independent.
- A vote can be withdrawn (`unvote`). To change it, withdraw first: `vote` is refused when a vote exists (L5841).
- Results (bars, totals) are shown **only after the viewer's acting profile voted** (`pollHTML` L4718). The voters of each option are listable (`pollPeople` L4720). A couple shows as the couple (FEED-024).
- Editing the post keeps the votes only if the question and options are identical. Otherwise the votes are reset (`samePoll` L6267).

### 1.6 `post_reaction`
(post_id, reactor_profile_id) unique, kind=`like`, acted_by_account_id, at. A toggle per acting profile (`likePost` L5829). Not allowed on unavailable posts or when blocked.
Likers list (`likers` L6066): profiles whose «показывать мои лайки» is off are **counted but never listed** («часть людей не показывает свои лайки»).
The same model applies to discussion likes (`likeDisc` L6054) and reply likes (`rLike` L4799) (communities domain reuses it).

### 1.7 `post_reply` (comments)
| Field | Constraint |
|---|---|
| id, post_id | |
| parent_reply_id | nullable. Threads are flattened to 2 levels in the UI. Deep replies show «в ответ X» (`replyTree` L4761). |
| author_profile_id | acting profile (`replyActor` L4073). A couple may reply «от пары». |
| sent_by_account_id | member who typed it (`sender: pairMember()` L6161) |
| body | plain text 1–1000 (L6161, L9076) |
| state | `published` \| `deleted` (soft) \| `removed` (staff; implied) |
| edited_at | set on own edit (FEED-025, L9073–9076) |
| like counts | via reaction model |
Rules:
- A deleted reply loses its text. It disappears if no live replies are under it; otherwise it stays as a stub «Ответ удалён» (FEED-008).
- Replies of blocked authors are shown as «Ответ скрыт: автор заблокирован».
- Couple replies after dissolution read «Ответ недоступен» (L4766).
- `reply_count` counts only live, visible replies.
- Ordering: «Сначала интересные» uses likes only if ≥100 and a branch only if ≥10 replies (`score` L4775), else newest. The order is frozen per screen open (client-side). Page size 50 roots.
- Edit allowed only for own, not deleted, already delivered replies (`rEdit` L9073).

### 1.8 `post_mention`
Derived from `@handle` in post / reply / discussion text (regex `@[a-z0-9_.]{2,30}`, L6125). Server-side table (implied) for notification idempotency and «убрать упоминание»:
(source_kind post|reply|discussion, source_id, mentioned_profile_id, notified bool, removed_by_mentioned bool).
- Handle resolution: person nick only. Couples cannot be mentioned (`resolveHandle` L6121).
- Allowed if `mentionsFrom` of the mentioned profile permits it: `all` / `follow` (only if the mentioned profile follows the author's acting profile) / `none`. Not allowed when blocked (`mentionIssue` L6124).
- A disallowed mention is still published as plain text, but **no notification and no link** (publish toast «Не получат уведомление», L6224).
- One notification per (source, person). Drafts never notify (`askTagged` L6018).

### 1.9 `post_person_tag` (people on photos)
Owner of the record: post. Subject: tagged profile (persons only; couples, the author's own members and blocked profiles excluded, `tagCandidates` L6010).
Fields: post_id, tagged_profile_id, state `pending|ok|no`, asked_at, decided_at.
- ≤10 per post (L6015). Only when the post has media.
- While any mark is `pending` or `no`, the post is visible **only to the author and the tagged people** (`consentHidden` L5991, `postVisible` L5998).
- Requests are sent once per mark, only after the post leaves draft (`askTagged` L6018).
- A `no` mark cannot be removed by the author while the photos are the same (L6015).
- **Marks survive an edit only while the media list is unchanged.** New photos reset everyone to `pending` and lift a dispute (`postPeople` L6259).
- The tagged person may: confirm, decline (`tagAnswer` L6024), remove their mark (the photo stays, `tagRemoveMe` L6026), or object later (`tagObject` L6027 → state `no`).
- A non-tagged viewer may raise «Это я на фото — против публикации» → `post.disputed` (hidden for all at once + staff queue).
- Accepted marks show «На фото: …» and put the post into the tagged person's gallery album «Со мной / Отметки» (`taggedPosts` L5875).

### 1.10 `topic` (catalog, system/staff)
Static catalog: id, ru/en name, category, description (`TOPICS` L3416, `TOPIC_DESC` L3730, `CATS` L3458). Admin-hidden topics (`ADMIN_HIDDEN_TOPICS` L3451) are not taggable and not listed. Read-only for users. Interests (jars) are another domain; posts reference topics only.

### 1.11 `saved_item` (bookmarks)
(owner_profile_id, kind `post|event|topic|discussion`, target_id, saved_at) unique. No duplicates (FEED-042). Shown in «Я/Мы → Моё → Сохранённое» (G04 L8202). Unsaving there removes it with an undo.
- Visibility re-checked on read: an item that is no longer visible is dropped silently (G04 filters `postVisible`).
- **Owner = acting profile** per guide §5.2, but the prototype always writes `S.me.saved` (L5833, L8937). See §7 Q3.

### 1.12 `feed_hide` («Скрытое в ленте», per profile — FEED-011/014)
(owner_profile_id, kind `post|author|activity|event`, target_id, created_at) unique. Created by `hidePost` L5848, `muteAuthor` L5849, `actMute` L5807, `feedEvLess` L8270, and automatically when the viewer reports a post (L7101).
- **The author is never told** («Автор не узнает об этом»).
- `author` mute hides the author's posts from all feed tabs. Mute wins over follow (existing contract §10).
- `activity` mute hides only activity cards. «Публикации в ленте останутся» (L5806).
- The list is manageable and reversible from the «Скрытое в ленте» sheet (L9034) and Settings (L8266).
- **Owner: profile**. The person's and the couple's lists are independent (`feedSet(k,a)` L5692).

### 1.13 `follow` and `note_subscription`
- follow: (follower_profile_id, target_profile_id) unique, acted_by_account_id, at. Person or couple on both sides. A profile cannot follow its own identities (`ACT.follow` L7076). Blocking (either direction) removes follows of **only the blocking profile** (`doBlockData` L7106).
- note_subscription: (subscriber_profile_id, author_profile_id) unique. «Следить за статьями» = article-only subscription. The author **is not told** (L6150). Per acting profile (FEED-001, `noteSubSet` L9024).
- Lists «Подписчики / Подписки» of any viewable profile are browsable (P10 L7554; `followersOf`/`followingOf` L7550). See §7 Q7.

### 1.14 `activity` (derived, not stored as its own entity — implied)
Items for the «Подписки» stream (`activityOf` L7524): `like` (only on `audience=all` posts), `event` (going / interested with show flag), `comm` (joined a non-hidden community), `follow`.
Visible per the actor's `activityVis` = `all` / `followers` (followers & matches) / `off` (`activityShown` L7511). Likes are additionally hidden when the actor turned off «показывать лайки».
Source tables: reactions, rsvps, memberships, follows. The server builds the stream from them with the same filters. No separate write.

### 1.15 `album` (S.albums)
Owner: profile. Fields:
- id;
- name 1–40, unique per owner case-insensitive (`albErr21` L9203);
- vis `all|followers`;
- sort `new|old`;
- cover_post_id;
- position (manual order, `galAlbumMove` L6094);
- system flag (profile-photos album `<owner>_profile`: no vis change, cannot receive posts, L5890/L7429).

Transitions:
- Narrowing `vis` to followers: confirm, then all album posts become `followers`.
- Widening to all: either album only, or album + posts (L6090).
- Delete: posts stay, album_id cleared (L5895).

Visitors see followers-only albums with a lock, but their posts only if they follow (`albumsOf` L5876, PRF-028).

### 1.16 Gallery (derived)
The gallery is a view, not an entity: all published / in-review posts of a profile that have real media, newest first or the album's order. It excludes:
- removed posts;
- posts without consent;
- audience `granted` and `only`;
- profile-photo mirror posts, in lists (`ownListed` L9048).

`galleryOnly` posts (in_feed=false) are included. In-review posts appear to the owner only.
Seeded demo gallery (`seedGallery` L5859, `S.galSeeded`) is **prototype-only, drop**.

### 1.17 `post_report`
Fields:
- reporter_profile_id (acting profile `by: activeActor()`, L7101), reporter_account_id;
- target_kind `post|reply|profile`, target_id, target_version;
- reason `threat|private|minor|spam|other` (RP_WHY L9068);
- details ≤500 chars;
- state `open|resolved`, resolution `removed|kept`, created_at, resolved_at.
Reporter identity is never shown to the author («Автор узнает только…», L6028).

### 1.18 `search_recent` (S.searchRecent)
≤6 recent queries, newest first, dedup (L8243). **Recommendation: keep client-local only** (an 18+ search history should not be stored on the server). Content search itself is a query (§3).

### 1.19 Couple joint-work item for posts (`jointQueue` L4536) → shared `partner_approvals`
kind=`post` (also used for community discussions). Fields:
- post_id, version, base_version (CAS on the existing post version);
- pair/profile_id, requested_by_account_id;
- draft payload snapshot;
- status `pending|approved|returned|cancelled`.
Decision by the **other** member only (L4541, L4563). Withdrawn on dissolve (L4517) and on delete/hide (L5850).

---

## 2. Commands (writes)

All commands carry `actingProfileId`, `operationId` (uuid, idempotent replay returns the current state), and `expectedVersion` where a CAS is noted. The server checks for every command:
- membership in the acting profile;
- the pair is active (for a couple);
- 18+ / consent eligibility;
- no block either way with the target.

| Command | Input | Who may call | Effects | Limits / errors |
|---|---|---|---|---|
| `post.saveDraft` | postId?, type, title?, body, topics[≤3], audience, inFeed, mediaIds[≤6], poll?, interestsSel[≤4], albumId?, taggedProfileIds[≤10] | member of acting profile. Couple drafts are owned by the couple, but visible and editable only to `created_by_account_id` (L6192) | creates/updates a draft; no notifications | empty draft (no text and no media) → `empty_draft`. A draft edited from a published post must use `post.saveEdits`. |
| `post.saveEdits` | postId, same payload | owner member | upserts the private saved edits; the live post is unchanged | post deleted → `not_found` |
| `post.discardEdits` | postId | owner member | deletes the saved edits | |
| `post.publish` (new or from draft) | payload or draftId | **person**: the person themselves. **couple**: creates a partner approval unless the partner has delegated (pair «trusted», `pairTrusted` L4560). Then committed at once. | Person: no media → `published`; with media → `review` (+ media moderation job). Tagged people get `tagReq` notifications and «Нужно решить» items. Mentions get notified on publish (or on approval for review?, see Q11). Article (`type=note`) → `noteNew` to note subscribers (implied, L7934). Couple, pending: «Совместная публикация ждёт подтверждения» to the partner + «Нужно решить» item; the toast «Отправлено партнёру на согласование» (L6289). | validation as §1.1. Interests no longer public → `interests_unavailable` (L6188). Pair inactive → `couple_inactive` (L4068). Version CAS for couple. |
| `post.edit` (publish over a published post) | postId, payload, expectedVersion | as publish | `editNeedsReview` false → live edit, `edited` set, toast «небольшие правки не проверяются повторно». True → creates a `post_revision` (review), and the live version stays visible. Changed media resets marks (§1.9). Poll votes are kept only if the poll is unchanged. Saved edits are cleared. | source deleted → `source_deleted` («Исходная публикация удалена», L6289) |
| `post.approveJoint` / `post.returnJoint` | approvalId, version, note? | the **other** member of the couple only | Approve: commit the post with `approved_by` = both members. Status = published, or review if media. **Note:** the prototype uses `media? review : published` here, not `editNeedsReview` (L4568), see Q5. Return: status `returned`, the creator gets «Совместная публикация возвращена на доработку». | stale version / base mismatch → `version_conflict`. Self-approval refused. |
| `post.delete` | postId, expectedVersion | person: author. Couple: any member (narrowing = immediate, partner notified, implied by guide §5.4) | Person: hard delete incl. replies, reactions, marks; saved edits removed. Couple: status `archived` (private archive), media detached, open joint approval cancelled. | |
| `post.setAlbum` | postId, albumId\|null | owner | Moving into a followers-only album narrows the audience to followers, with a toast (L5888) | album of another owner → `not_found`; `granted` post → `invalid` |
| `post.setAudienceBulk` (gallery «Кто видит») | postIds[], audience `all|followers` | owner | Narrowing → immediate. Widening a media post → review per §1.4 (implied: the prototype sets it directly, L7435, see Q6). | |
| `post.deleteBulk` (gallery) | postIds[] | owner | as `post.delete`. If the last profile photo is removed while Discover is «показываюсь», ask, then switch to «смотрю незаметно» (L7442, profile domain) | |
| `reaction.set` | postId \| replyId \| discussionId, active | acting profile | Toggle. On like of a foreign post: notification `postLike` to the author profile (grouped per post while unread, `notePostLike` L6074). If the actor is the couple → the partner gets «от пары: лайк» (`pairNotify coupleAct`). | blocked / unavailable post → `not_found` |
| `poll.vote` | postId, optionIndex | acting profile | inserts a vote | already voted → `already_voted`; no option → `invalid` |
| `poll.unvote` | postId | acting profile | deletes the vote | |
| `reply.create` | postId, parentReplyId?, body ≤1000 | acting profile (person or couple; `canAct('comment')`) | Inserts a published reply. Notifies the **parent reply author** and the **post author** (deduped, excluding self and blocked; couple → both members, `notifyReply` L4794). Mentions in replies notify (§1.8). Couple reply → partner informed (`coupleReply`). | parent deleted / blocked → `not_found`. Post unavailable → `not_found`. Rate limit (implied). Body >1000 → `too_long`. |
| `reply.edit` | replyId, body, expectedVersion | author profile member | sets body, `edited_at` | deleted → `not_found` |
| `reply.delete` | replyId | author profile member | soft delete, text cleared | |
| `save.toggle` | kind post\|event\|topic\|discussion, id | acting profile (see Q3) | upsert/delete `saved_item` | invisible target → `not_found` |
| `feed.hide` / `feed.unhide` | kind post\|author\|activity\|event, targetId | acting profile | upsert/delete `feed_hide`. The author is not notified. | own post / own identity cannot be muted (L9043 hides the action) |
| `follow.set` | targetProfileId, active | acting profile | upsert/delete follow. On follow: `follow` notification to the target (couple target → both members). If the actor is the couple → partner info «от пары: подписка» (L7076). | self/own identity, blocked → `invalid`/`not_found`; rate limit (existing contract §14) |
| `noteSub.set` | authorProfileId, active | acting profile | upsert/delete; **no notification** to the author | |
| `mention.removeSelf` | sourceKind, sourceId | the mentioned person | adds to `unmentioned_profile_ids`; the author gets `mentionRemoved` | |
| `tag.answer` | postId, answer yes\|no | the tagged person | yes → `ok`; the post becomes visible when all marks are ok; the author gets `tagOk`. No → `no`; the post is hidden; the author gets `tagNo` | not tagged → `not_found` |
| `tag.removeSelf` | postId | tagged person (state ok) | deletes the mark; the photo stays; the author gets `tagRemoved` | |
| `tag.object` | postId | tagged person, or **any viewer who says they are pictured** | Tagged: state `no`. Not tagged: `post.disputed`, hidden for everyone at once, staff queue item (dispute); the author gets `disputed` («человек на фото против», without who). | one open dispute per post |
| `report.create` | targetKind post\|reply\|profile, targetId, reason, details ≤500, alsoBlock bool | acting profile | Inserts a report, adds the post to the reporter's `feed_hide`, staff queue (§5), optional block (blocks domain). Response: «Сообщим о решении в уведомлениях». | one open report per (reporter, target) (existing); daily cap (existing: 5/day posts, 10/day profiles) |
| `album.create` | ownerProfileId, name | owner member | creates an album | empty name → `name_required`; duplicate → `name_taken` |
| `album.rename` / `album.setSort` / `album.setCover` / `album.move` / `album.delete` | albumId, … | owner | as §1.15 | system album: no vis, no move-in |
| `album.setVisibility` | albumId, vis, applyToPosts bool | owner | Narrowing: posts → followers (immediate). Widening: album only or album + posts. Widening posts of a **couple** needs consent (implied by guide §5.4). | |
| `settings.mentionsFrom` | value all\|follow\|none | person: self. Couple: narrowing immediate + partner notified; widening through partner consent (`coupleSetting` L7583) | | |
| `settings.activityVis` / `settings.showLikes` | | same rule as above | | |

Couple consent summary for this domain:

| Action as couple | Partner consent? |
|---|---|
| publish / edit a post | Yes, unless the partner delegated it. The base version is checked (CAS). |
| post a community discussion | Yes, same queue (L4566) |
| widen an album, a post audience, mentionsFrom or activityVis | Yes (implied for album/post; explicit for settings) |
| delete / hide a joint post; narrow an audience; mute; hide; unfollow | No. Immediate; partner informed (`coupleAct` / implied) |
| like, vote, reply, follow, save | No. Immediate. The partner gets an informational «от пары: …» for like and follow. Reply → `coupleReply`. |

---

## 3. Queries (reads)

Common projection for every post read (viewer = acting profile V):
- Apply the visibility in §1.2 and the invariants in §1.1. The "unavailable couple" placeholder: a post of a dissolved couple shows «Совместный профиль недоступен» with no text, media, poll or interests; other people's replies stay (`postById` L4712).
- Return `likedByMe` / `myVote` / `savedByMe` **for V** (not for the person by default).
- Counters as in §1.1. Likers exclude hidden-likes profiles from the names, but the total includes them.
- Explicit media are never served in feed / profile / gallery (decision: public places = safe only). Media in review are returned to the owner only.
- Mentions of profiles in `unmentioned_profile_ids` or blocked are rendered as text. Photo marks are listed only when all are ok, excluding blocked.
- Author identity: the profile id/handle is needed for links. The existing `publicAuthorId` opt-in model conflicts with V21 (§6).

| Query | Input | Projection / rules | Pagination |
|---|---|---|---|
| `feed.forYou` | actingProfileId, filters {topicsInclude[], topicsExclude[], kinds[note,text,photo,poll,result]} | All visible published posts with `in_feed=true`, minus V's `feed_hide` posts/authors and blocked. Newest first (`F01` L5708). Event cards interleaved: 1 per 6 posts, at most 3 distinct events per day; rank: mine > organiser V follows > community V joined > V's city or online; ≤14 days ahead; not cancelled or in review; not V's own; V's hidden events excluded (`feedEventPicks` L5700). The interleave may be done by the client from a separate `events.feedPicks` query. | cursor (at,id) |
| `feed.following` | actingProfileId, filters + activityKinds[posts,likes,events,comm,follows] | Posts by profiles V follows, plus V's own posts, plus `type=note` posts by authors V note-subscribes to (L5717). Activity cards of followed profiles (§1.14) unless muted. Bursts of the same kind by one actor with gaps ≤6 h fold into one group card. ≤60 items per page (`followStream` L5747). Topic/type filters hide activity cards. | cursor |
| `feed.popular` | actingProfileId, topic? | Last 7 days; `audience=all`; not reported/removed. Topics ∈ V's interests (level>0, not limits), and none of V's hard limits. Score = 10·distinct live repliers + 3·live replies + 0.2·likes; top 20 (`popularPosts` L6036). Plus ≤3 community discussions under the same rules, excluding host-excluded ones (`popOff`). Offered topic chips: only V's interests with content this week. | top-N, no cursor |
| `topic.posts` | topicId | visible, `in_feed`, tagged with the topic, newest first; plus communities with the topic (`F04` L6165) | cursor |
| `post.get` | postId | Full card + replies tree + likes line. Gallery context `{ownerProfileId, albumId}` returns prev/next ids (`galNav` L5897). Invisible → `not_found` (no existence leak). | |
| `post.replies` | postId, sort top\|new | as §1.7; roots page 50; deleted-without-children are omitted | cursor |
| `post.likers` | postId | listable profiles + `hiddenCount` | cursor |
| `poll.voters` | postId, optionIndex | **only if V voted** (L4720); profiles, couple as couple, blocked excluded | cursor |
| `me.posts` («Мои публикации», F10) | ownerProfileId | Drafts (couple: only those created by the caller member), saved edits, pending revisions, in review, published (incl. «не в ленте» marked), pending/returned joint items. Profile-photo mirrors excluded (L6301). | sections, cursor each |
| `profile.posts` | profileId | Visible posts of the profile **without** media (with media they are in the gallery), including `in_feed=false` (FEED-003) | cursor |
| `profile.gallery` | profileId, albumId? \| `@tagged` | §1.16; albums visible to V; `@tagged` = posts by others where the profile is marked ok and V may see them | cursor |
| `profile.albums` | profileId | name, count visible to V, cover (safe media only), lock flag | |
| `profile.followers` / `profile.following` | profileId | blocked excluded; V's own identities labelled «Ты / Ваша пара» (FEED-024) | cursor |
| `saved.list` | ownerProfileId | posts / events / discussions / topics still visible to V | cursor |
| `feedHide.list` | actingProfileId | posts (title/text excerpt ≤60, author), authors, activity authors. Events are not listed in V21 (Q9). Count for «Скрыто в ленте: N». | |
| `search.posts` | q (≥2 chars), filters | Matches text, title or topic name; same visibility and `feed_hide` filters as the feed. `in_feed=false` excluded (`searchData` L8218). | cursor |
| `mention.suggest` | prefix, actingProfileId | persons by nick/name prefix ≤5; each with `canMention` (+ reason) for this author | |
| `tag.candidates` | actingProfileId, q | persons, not blocked, not the author's members. Groups «Знакомые» (follow either way, links, partner) / «Все». Needs a privacy review (Q8). | |
| `postReports.mine` (implied) | | status of own reports | |

---

## 4. Notifications and «Нужно решить» items

Addressee is a profile. A couple addressee is delivered to **both members**, except the member who acted as the couple. Every notification carries `addressee: Тебе | Паре` (NTF-001).

| Type | Addressee | Trigger | Text / action | Evidence |
|---|---|---|---|---|
| `postLike` (grouped `postlike`) | post author profile | like of their post by another profile; grouped per post while unread («Mia и ещё 2») | open post | L5829, L6074, L7934 |
| `reply` | parent reply author + post author | new reply | open the reply | `notifyReply` L4794 |
| `mention` | mentioned person (if allowed) | mention in post / reply / discussion | open source | L6129 |
| `mentionRemoved` | author | mentioned person removed their name | — | L6146 |
| `follow` | target profile | new follow | open followers list | L7076 |
| `noteNew` | note subscribers | new article by a followed author (implied delivery) | open article | L7934, L8759 |
| `tagReq` → «Нужно решить» item `tag` | tagged person | post with a mark leaves draft | **Посмотреть и решить** → sheet with photos and who will see it; **Подтвердить / Против публикации** | L6019, L6021, L7947 |
| `tagOk` / `tagNo` / `tagRemoved` | author | answer / removal of a mark | tagNo: «Замени фото или удали публикацию» | L6024–6026 |
| `disputed` | author | someone objects to being in the photo | identity not revealed | L6028 |
| `postok` | author (couple → both) | post or edit approved after review | open «Мои публикации» | L8768 |
| `modRemoved` (why consent\|report) | author | staff removed the post | — | L6112 |
| `modRestored` | author | dispute resolved in favour of the author | open post | L6113 |
| `reportDone` / `reportKept` | reporter | decision on the report | — | L6115 |
| `discRemoved` | discussion author | host removed it (communities domain) | — | L6062 |
| pair `postApproval` → «Нужно решить» item `joint` | other couple member | couple post / discussion submitted | **Одобрить / Вернуть** (with the word diff, CPL-016) | L4540, L7942 |
| pair `workApproved` / `workReturned` | creator member | partner decided | open post / back to editor | L4569, L7935 |
| pair `coupleAct` (like, follow, setting) | other member | member acted as the couple | info only | L5829, L7076, L7583 |
| pair `reply` | both members | reply to a couple post | open | L7935 |

Grouping rule (implied from `notePostLike`): one unread line per post for likes. Mentions dedupe per (source, person). Tag requests are sent once per mark.

---

## 5. Moderation hooks

| Hook | Goes to | Behaviour in V21 | Notes |
|---|---|---|---|
| Media in a new post / major edit | media moderation (auto scan + staff) | the post is `review` until approved; «обычно до 30 минут». Text-only posts are **not** pre-moderated. | The existing server pre-moderates **all** text manually (C01.2a). See §6 and Q1. |
| Explicitness label of media | media_asset | Explicit media are not allowed in feed / profile / gallery. The composer has no explicit/safe choice. The server must refuse or blur (decision). | Q2 |
| Post report | staff queue `report` | Reasons threat/private/minor/spam/other + details; the card shows the reason, details, number of reports and the time of the last one. Priority: minor (0) > dispute (1) > threat (2) > private (3) > spam (5) > other (6) (`modRank` L9069). The post opens from the card. Removal asks first (L9071). | Existing reasons differ: policy/privacy/nonconsent/minor/illegal/spam/other → map. |
| «Это я на фото» dispute | staff queue `dispute` | The post is hidden for everyone at once. Restore only if the person is not recognisable or consent is confirmed (M01 rules L6105). Both sides are notified. | |
| Decision `remove` | post.status=removed, removed_reason | The author sees a banner and may delete; the reporter gets `reportDone`. | append-only decision log (existing pattern) |
| Decision `keep` / restore | report resolved / dispute cleared | `reportKept` / `modRestored` | |
| Reply report | staff queue (implied) | In V21 the reply «Пожаловаться» passes only the author id. `rpSend` stores nothing for a reply unless «Также заблокировать» is on (L7094–7101). | Must be fixed: store the reply id (Q4). |
| Auto checks (implied) | outbox → moderation-engine | text classifier label, link safety (Markdown links http/https only, confirm on open, L4751), rate limits | `moderation-engine.js` label adapter exists |
| Popular exclusion | feed | reported or removed posts never in Popular; hosts may exclude discussions | |
| Staff screen | admin (M01/MOD) | admin-only, «видят только модераторы» | roles from the staff domain |

---

## 6. Mapping to the existing server

The existing server is account-owned (`author_hash`, `account_hash`, `viewer_hash`), pre-moderates all text, and uses opt-in `publicAuthorId` pseudonyms. V21 is profile-owned, publishes text instantly, and links authors to profiles. The common rework is to replace `*_hash` with `profile_id` + `acted_by_account_id`, use UUIDv7, and move notifications to the outbox.

| Entity (here) | Existing tables / modules | Verdict |
|---|---|---|
| post | `feture_posts` (+ `feture_post_operations`), `posts.js`, `feture_post_command`, `feture_post_feed_command` | **Rework.** Owner = profile. `kind text/story/question` → `type post/note` + parts. Text limit 3000 → 1000 (post) / 10 000 (note) + title. States: drop `pending/rejected/hidden` for text and add `review` (media), `removed`, `archived`. `audience private/public/granted` → `all/followers/granted/only` + `in_feed`. Drop `author_label` (use profile name; couple name snapshot). Keep CAS/operationId/receipts, cursor pagination, the "no hidden counts" rule. |
| post edit / revision | none (current: an edit reverts to a private draft and re-review) | **New:** `post_revisions` (major edit pending, live stays visible) + `post_saved_edits`. Different from the existing "edit unpublishes" rule. |
| post review (staff) | `feture_post_reviews`, `post-review.js`, `feture_post_review_command` | **Rework.** Restrict to media review and pending revisions. Keep self-review denial, role generation and the audit log without text. |
| selected recipients | `feture_post_recipients`, `feture_post_addresses`, `posts.address/rotateAddress/revokeRecipient` | **Drop.** V21 `granted` = the private-part grant holders (access domain), not per-post codes. |
| test-result posts | `feture_test_share_templates`, `feture_test_share_operations`, `posts.testPreview/fromTest` | **Drop** (tests removed; archive). Replace with `interests_snapshot` (≤4 public interests) — **new**. |
| photos in posts | `feture_post_photos`, `feture_photo_gc`, `post-photos.js`, bucket `feture-post-photos` (Supabase Storage, 1 JPEG ≤1024 px) | **Rework → media_asset** (Cloudflare, images + video, ≤6 per post, quarantine → scanned → approved). Keep the GC-queue idea, EXIF stripping, no public URLs. |
| photo review consent / staff photo read | `feture_photo_review_consent` (not applied), `feture_staff_photo_read` (not applied), `post-photo-consent.js`, `staff-photo-read.js` | **Rework** into media moderation. A separate author consent for staff review is not in V21 (ToS-level; Q2). |
| poll / votes | none | **New:** `post_polls`, `poll_votes` (per profile). |
| reactions | `feture_post_reactions` (+ops), `post-reactions.js` | **Keep the shape, rework the owner** → `reactor_profile_id`. Extend the target to replies and discussions (or separate tables). Add likers listing with the hidden-likes rule. |
| replies | `feture_post_comments` (+ops, review, mine), `post-comments.js`, `comment-review.js` | **Rework.** V21 publishes replies at once (no `pending` pre-moderation). Body 1200 → 1000. Author = profile (couple allowed). Keep edit/delete CAS. Soft-delete stub rule. Comment review → reply reports. |
| mentions | none | **New:** `post_mentions` + `mentionsFrom` setting (profile settings domain). |
| photo marks | none | **New:** `post_person_tags`, dispute fields. |
| topics | `feture_categories`, `feture_interests` (001), catalog editorial `feture_catalog_topic_drafts`, `feture_catalog_publications`, `catalog-admin.js`, `catalog-public.js` | **Keep** as the topic catalog (admin-edited, published releases). Add the admin-hidden flag. Posts reference topic ids. |
| saved | `feture_post_bookmarks` (+ops), `post-bookmarks.js` | **Rework:** owner = profile; kinds post/event/topic/discussion. |
| feed hide | `feture_author_relationships(kind='mute')`, `20261012233000_feture_muted_feed.sql` (feed filter) | **Rework:** generic `feed_hides` (post/author/activity/event) per profile. Mute keyed by profile, not by public author id. |
| follow | `feture_author_relationships(kind='follow')`, `author-relationships.js` | **Rework:** `follows(follower_profile_id, target_profile_id)`; notification to the target; follower lists. The existing contract had "no notification, no public lists, no counters" — V21 has all three (Q7). |
| note subscriptions | none | **New:** `note_subscriptions`. |
| public author pseudonym | `feture_public_authors` (+ops, resolve), `public-authors.js` | **Drop or demote.** V21 links every post to the author profile, with no opt-in. The privacy rationale (docs/community-follow-mute.md §1–7) must be re-decided by the owner (Q7). |
| views / metrics | `feture_post_view_receipts`, `feture_post_view_totals`, `feture_post_view_secret`, retention cron, `post-views.js` | **Keep as internal analytics** (not shown in V21). Re-key to post_id with an anonymous viewer digest. Not part of the DTO. |
| reports on posts | `feture_post_reports`, `feture_post_report_decisions`, `post-reports.js`, author-privacy migration | **Rework:** reporter = profile; reasons → V21 set (or map); target kinds post/reply; auto-hide for the reporter; notify the reporter of the decision. Keep "one open per reporter+target", daily caps, versioned target, no reporter identity to the author. |
| moderation (profile reports, appeals) | `moderation.js`, `moderation-admin.js`, `moderation-engine.js`, P03 tables | **Keep** (staff domain). Extend `targetKind` to post/reply/media/dispute; the engine label adapter is reused for text auto-checks. |
| albums | none | **New:** `albums` + `post.album_id`. |
| gallery | none (derived) | **New query.** Seeded demo galleries: drop. |
| activity stream | none | **New query** over reactions/rsvps/memberships/follows with `activityVis`. |
| couple post approval | none | **New** via the shared `partner_approvals` (kind=post). |
| search recent | none | **None (client-local)**. |
| content search | none | **New** (outbox → search index), same visibility filters. |
| ephemeral preview | docs/ephemeral-preview.md (client-only sandbox) | **Keep as is**. No server impact. Must never call real post commands. |

---

## 7. Open questions, ambiguities and unsafe prototype behaviour

1. **Text-only posts publish without review** (`editNeedsReview` returns false without media, L6262). The existing server pre-moderates every text (C01.2a). The owner must confirm post-moderation for text: reports plus an auto-classifier via outbox. Related: a text-only post can be **widened** (followers → all) live, with no review.
2. **Explicit media in posts.** V21 has no safe/explicit choice in the composer, and posts appear in public places. By the platform decision, explicit is allowed only in the private part and chats. Proposal: a media item labelled explicit can only be attached to `granted`/`only` posts; otherwise the publish is refused or the media rejected. Needs the owner's decision.
3. **Saved items are always personal** in the prototype (`S.me.saved`, L5833, L6431, L8937). The toast still says «Мы → Моё → Сохранённое», and guide §5.2 says saved belongs to the profile. Proposal: owner = acting profile.
4. **Reply reports are lost**: `ACT.report` from a reply passes only `data-who` (L4802). `rpSend` (L7101) stores a report only for `post`, so a reply report is a no-op unless "also block" is on. The server must store a reply report with the reply id and version.
5. **Couple edit review inconsistency**: `commitJointPost` sets `status = media ? 'review' : 'published'` and replaces the whole post (L4568). It ignores `editNeedsReview` and `pendingEdit`, so a minor edit of a couple photo post unpublishes it into review, and a major edit hides the old version. Proposal: apply the same rule as person posts.
6. **Gallery bulk audience** (`galSelAudSet` L7435) and album widening (L6090) set `audience='all'` directly. They bypass the media review rule and couple consent. The server must route widening through review/consent.
7. **Author identity and follower lists.** V21 shows authors as clickable profiles, sends `follow` notifications and shows follower/following lists to anyone (P10 L7554). The existing contract (community-follow-mute.md) required opt-in pseudonymous `publicAuthorId`, no follower notifications, no public lists. The owner must decide. Also: who may see a profile's follower list (no setting exists in V21).
8. **Tag/mention candidate pickers list «Все» people** (`tagCandidates` L6010, `mentionPick` L6130). On the server this would be a directory of all members. Proposal: only server-side search by exact or prefix nick with a minimum length, rate-limited, and eligible profiles only.
9. **Hidden events are not listed** in «Скрытое в ленте» (`feedHiddenCount` L9033 counts posts, authors and activity only), so they cannot be undone after the toast. Decide whether to list them.
10. **Poll voters are visible to every voter** (`pollPeople` L4720), and a vote cannot be anonymous. For an 18+ product this may expose preferences. Confirm, or add an "anonymous poll" flag (not in V21).
11. **When do mention and mark requests go out for posts in review?** `askTagged` runs right after publish, even if status=review (L6289). This means people are notified about photos staff have not approved yet. Proposal: send after media approval.
12. **Interests snapshot staleness**: `interests_snapshot` is copied at publish. If the author later makes an interest private, the published post keeps showing it. Decide: re-check on read and drop entries no longer public (safer), or keep the snapshot.
13. **Media rejection flow is absent**: QA only approves (`qaApproveAll` L8768). The author notification, the state of a rejected new post (back to draft?) and of a rejected revision (the live version stays) are needed.
14. **Activity reveals likes on `audience=all` posts only.** Events need `show` (rsvp domain). Confirm that the activity of a couple is built from the couple's own actions only (FEED-001 implies yes).
15. **Popular excludes posts "reported"** — in the prototype that means reported **by the viewer** (`S.reportedPosts`, L6037). Server meaning: exclude posts with any open report, or only removed ones? Using any open report enables brigading.
16. **Block symmetry**: the prototype filters only the viewer's own blocks (`isBlocked` L4356). The server must hide content in both directions and stop replies, mentions, marks, follows and reactions.
17. **«Реже такое»** from the brief no longer exists in V21: it was renamed «Скрыть» for events (FEED-014). There is no "less like this" ranking signal; do not build one.
18. **Couple post deletion is «Скрыть»**: archived for both members, not deleted (L5850). Confirm who may hard-delete the archive (both members? after dissolution?). The same applies to the 30-day restore window.
19. **Search history**: `searchRecent` is per session and person-only. Recommend client-local storage. If server-side storage is wanted, it must be per profile and erasable.
20. **Markdown and links**: the prototype escapes the text first and allows http/https links with a confirm dialog (L4730–4751). The server must store raw Markdown, sanitize on render, and never store HTML. `![img](url)` must render as a link, never as an image.
21. **Rate limits are absent in V21** for posts, replies, likes and follows. Use the existing pattern (daily caps + global quota). `S.quota` in the prototype is **not content-related**: it is the private-part request quota (10/day, L4380) and belongs to the access domain.
22. **Mention of couples** is impossible (handles resolve only to persons, L6121), but couples have `mentionsFrom` settings (L6147). Either allow `@couple-handle` or drop the couple setting.
23. **Prototype-only artefacts to drop**: `seedGallery` / `seedOwnGallery` / `S.galSeeded` (demo galleries); `p.likes` base counts and deterministic demo likers (L6066); `pollVoters` seeding (L3670); `autoResolve`/`qaApproveAll`; `S.ui.feedJustHidden` (UI-only "row stays after hide"); `firstLoad` skeletons; the feed event-seen memo `S.ui.feedEvSeen` (keep only as a client hint, or move the "not repeated after 3 days" rule server-side if needed).
