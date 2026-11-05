// @ts-check
/** The notification catalog (docs/notifications.md «Модель»): one entry per notification type, and per subtype that
 * needs its own words. The server (notify.mjs, push.mjs), the inbox and later email read everything from here — record
 * kind, filter and icon, card template, texts, push, email, destination, collapse key, the «unavailable» text — and
 * keep no dictionaries of their own. tests/fe-notification-catalog.mjs fails on a type the code writes that is not
 * here, and on an entry without texts, destination or push category.
 *
 * Texts: plain and short; the name of whoever did it comes first, in the nominative («{name} отвечает на твою
 * публикацию»). `[person, couple]` where a couple's verb differs. Other placeholders: {couple} (the couple the item is
 * addressed to, named as it was then), {date}, {role}. A text with {name} and no actor uses `alone`, or the text
 * without the name.
 *
 * Destinations (`destination()` below) are the one way from a notification to a screen: the inbox row, the web push
 * `url` and the native push route all take it, and `routeOk()` (the same rule as public/fe-sw.js) accepts only the
 * app's own /n screens with UUIDs and known query keys. */

/** @typedef {{ru: string | readonly [string, string], en: string | readonly [string, string]}} Text */
/** @typedef {'notice' | 'task' | 'result'} RecordKind */
/** @typedef {'news' | 'decision' | 'result' | 'safety' | 'event' | 'summary'} Card */
/** @typedef {'none' | 'now' | 'now-if-unread' | 'digest'} Email */
/** @typedef {'none' | 'object' | 'actor' | 'type'} Collapse */
/** @typedef {'access' | 'likes' | 'matches' | 'replies' | 'events' | 'groups' | 'pair' | 'follows' | 'links' | 'posts' | 'other'} Filter */
/** @typedef {'messages' | 'likes' | 'match' | 'decide' | 'requests' | 'events' | 'replies' | 'follows' | 'groups' | 'pair' | 'news' | 'security' | 'other'} PushCat */
/**
 * @typedef {{
 *   kind: RecordKind, filter: Filter, icon: string, tone: '' | 'l' | 'g' | 'v', card: Card,
 *   text: Text, alone?: Text,
 *   push: {cat: PushCat, safe: Text, normal: Text, named: boolean, important: boolean, noisy: boolean, off: boolean, summary?: Text},
 *   email: Email, subject: Text, dest: string, collapse: Collapse, gone: Text,
 * }} Entry
 * push.important: in quiet hours it waits for the morning (if still actual) instead of being dropped (owner decision 4:
 * tasks, an event cancelled or moved, security). push.noisy: at most one push an hour per type; what came meanwhile is
 * one `summary` push at the end of the hour. push.off: in the history only, never a push (a partner's trust-mode
 * actions, docs/notifications.md «Push»).
 */

/** @param {string | readonly [string, string]} ru @param {string | readonly [string, string]} en @returns {Text} */
const T = (ru, en) => ({ ru, en });

export const SAFE_PUSH = T('Новое уведомление', 'New notification');
const GONE = T('Больше недоступно', 'No longer available');
const GONE_POST = T('Публикация больше недоступна', 'This post is no longer available');
const GONE_EVENT = T('Событие больше недоступно', 'This event is no longer available');
const GONE_COMMUNITY = T('Сообщество больше недоступно', 'This community is no longer available');
const GONE_PROFILE = T('Профиль больше недоступен', 'This profile is no longer available');
const GONE_CHAT = T('Переписка больше недоступна', 'This conversation is no longer available');
const GONE_PAIR = T('Пары больше нет', 'This couple no longer exists');

/** Push words that are not one type's: the title, the media kinds of a chat message. */
export const PUSH_WORDS = Object.freeze({
  ru: { title: 'KINHAZE', media: { image: 'Фото', video: 'Видео', audio: 'Голосовое' } },
  en: { title: 'KINHAZE', media: { image: 'Photo', video: 'Video', audio: 'Voice message' } },
});
/** Settings category of each push category (V21 K05, owner 03.11.2026: «Сообщения», «Решения» и «Пара» отдельно); the
 * rest (security, account and moderation decisions) follow only the global switches. Email uses the same categories. */
export const PUSH_SETTING = Object.freeze({ messages: 'messages', likes: 'likes', match: 'match', decide: 'decide', requests: 'req', events: 'events',
  replies: 'replies', follows: 'follows', groups: 'groups', pair: 'pair', news: 'news' });
export const PUSH_CATS = /** @type {const} */ (['messages', 'likes', 'match', 'decide', 'requests', 'events', 'replies', 'follows', 'groups', 'pair', 'news', 'security', 'other']);
/** The settings categories in screen order (contracts/me.mjs notificationSettings): every one has a push and an email
 * switch that really does something (tests/fe-notification-catalog.mjs checks each is some entry's category). */
export const SETTING_CATS = /** @type {const} */ (['messages', 'match', 'likes', 'req', 'decide', 'pair', 'events', 'replies', 'follows', 'groups', 'news']);
/** The settings category of an entry, or null (only the global switches hold it back). @param {Entry} e @returns {string | null} */
export const settingOf = e => /** @type {Record<string, string | undefined>} */ (PUSH_SETTING)[e.push.cat] ?? null;
/** Inbox filters in chip order (V21 inboxKind). */
export const FILTERS = /** @type {const} */ (['access', 'likes', 'matches', 'replies', 'events', 'groups', 'pair', 'follows', 'links', 'posts', 'other']);
export const CARDS = /** @type {const} */ (['news', 'decision', 'result', 'safety', 'event', 'summary']);
export const EMAILS = /** @type {const} */ (['none', 'now', 'now-if-unread', 'digest']);
/** «Нужно решить» kinds (server/commands/inbox.mjs decisions()); their entries are `decide.<kind>`. */
export const DECIDE_KINDS = /** @type {const} */ (['pinv', 'req', 'capp', 'eapp', 'link', 'linkChange', 'tag', 'joint', 'status']);

/** Raw entries. A key `type.sub` takes everything from `type` and changes what it names. Defaults: a notice, card
 * «news», filter «other», email in the digest, push category «other» with no name, no collapse, «Больше недоступно».
 * `quiet: true`: history only, no push (a partner's everyday action in trust mode, a daily summary). */
const RAW = /** @type {Record<string, any>} */ ({
  // ---- people ----
  like: { noisy: true, summary: T('Новые симпатии: {n}', 'New likes: {n}'), filter: 'likes', icon: 'Heart', tone: 'l', text: T(['{name} ставит тебе симпатию', '{name} ставят тебе симпатию'], '{name} liked you'),
    cat: 'likes', normal: T('Новая симпатия', 'New like'), named: true, dest: 'actor', collapse: 'type', gone: GONE_PROFILE },
  match: { filter: 'matches', icon: 'Heart', tone: 'l', text: T('{name} — это взаимно! Можно написать', '{name} — it’s mutual! You can chat now'),
    cat: 'match', normal: T('Новое совпадение', 'New match'), named: true, dest: 'chat', collapse: 'object', gone: GONE_CHAT },
  chatRequest: { filter: 'matches', icon: 'MessageCircle', tone: 'v', text: T(['{name} хочет начать переписку', '{name} хотят начать переписку'], '{name} wants to start a conversation'),
    cat: 'requests', normal: T('Новый запрос на переписку', 'New message request'), named: true, dest: 'chat', collapse: 'object', gone: GONE_CHAT },
  chatAccepted: { filter: 'matches', icon: 'MessageCircle', tone: 'g', text: T(['{name} принимает твой запрос на переписку', '{name} принимают твой запрос на переписку'], '{name} accepted your message request'),
    cat: 'requests', normal: T('Запрос на переписку принят', 'Your message request was accepted'), named: true, dest: 'chat', collapse: 'object', gone: GONE_CHAT },
  follow: { noisy: true, summary: T('Новые подписчики: {n}', 'New followers: {n}'), filter: 'follows', icon: 'Users', tone: 'v', text: T(['{name} подписывается на тебя', '{name} подписываются на тебя'], '{name} followed you'),
    cat: 'follows', normal: T('Новый подписчик', 'New follower'), named: true, dest: 'actor', collapse: 'actor', gone: GONE_PROFILE },
  grant: { kind: 'result', filter: 'access', icon: 'LockOpen', tone: 'g', card: 'result',
    text: T(['{name} открывает тебе приватную часть', '{name} открывают тебе приватную часть'], '{name} opened their private part to you'),
    // Never named on the lock screen: who opened a private part to whom is private.
    normal: T('Тебе открыли доступ', 'You got access'), email: 'now-if-unread', dest: 'actorPrivate', gone: GONE_PROFILE },
  linkAccepted: { kind: 'result', filter: 'links', icon: 'Users', tone: 'g', card: 'result',
    text: T(['{name} подтверждает связь — она есть в обоих профилях', '{name} подтверждают связь — она есть в обоих профилях'], '{name} confirmed the link — it’s on both profiles'),
    normal: T('Связь подтверждена', 'Link confirmed'), named: true, dest: 'link' },
  linkDeclined: { kind: 'result', filter: 'links', icon: 'Users', tone: '', card: 'result',
    text: T(['{name} не подтверждает связь', '{name} не подтверждают связь'], '{name} didn’t confirm the link'),
    normal: T('Связь не подтверждена', 'Link not confirmed'), named: true, dest: 'link' },
  linkChanged: { kind: 'result', filter: 'links', icon: 'Users', tone: 'v', card: 'result',
    text: T(['{name} отвечает на изменение связи', '{name} отвечают на изменение связи'], '{name} answered your link change'),
    normal: T('Ответ на изменение связи', 'Your link change was answered'), named: true, dest: 'link' },
  'linkChanged.yes': { icon: 'Users', tone: 'g', text: T(['{name} соглашается изменить связь', '{name} соглашаются изменить связь'], '{name} agreed to change the link'),
    normal: T('Связь изменена', 'Link changed') },
  'linkChanged.no': { icon: 'Users', tone: '', text: T(['{name} не соглашается менять связь', '{name} не соглашаются менять связь'], '{name} didn’t agree to change the link'),
    normal: T('Связь осталась прежней', 'The link stays as it was') },
  linkRemoved: { filter: 'links', icon: 'Users', tone: '', text: T(['{name} удаляет связь с тобой', '{name} удаляют связь с тобой'], '{name} removed the link with you'),
    normal: T('Связь удалена', 'Link removed'), named: true, dest: 'links' },

  // ---- posts ----
  reply: { filter: 'replies', icon: 'MessageCircle', tone: 'g', text: T(['{name} отвечает на твою публикацию', '{name} отвечают на твою публикацию'], '{name} replied to your post'),
    cat: 'replies', normal: T('Новый ответ', 'New reply'), named: true, dest: 'post', collapse: 'object', gone: GONE_POST },
  postLike: { noisy: true, summary: T('Лайки твоих публикаций: {n}', 'Likes on your posts: {n}'), filter: 'posts', icon: 'Heart', tone: 'l', text: T(['{name} ставит лайк твоей публикации', '{name} ставят лайк твоей публикации'], '{name} liked your post'),
    cat: 'replies', normal: T('Твоя публикация понравилась', 'Someone liked your post'), named: true, dest: 'post', collapse: 'object', gone: GONE_POST },
  mention: { filter: 'replies', icon: 'AtSign', tone: 'v', text: T(['{name} упоминает тебя в публикации', '{name} упоминают тебя в публикации'], '{name} mentioned you in a post'),
    cat: 'replies', normal: T('Тебя упомянули', 'You were mentioned'), named: true, dest: 'post', gone: GONE_POST },
  mentionRemoved: { filter: 'replies', icon: 'AtSign', tone: '', text: T(['{name} убирает упоминание о себе из твоей публикации', '{name} убирают упоминание о себе из твоей публикации'], '{name} removed their mention from your post'),
    cat: 'replies', normal: T('Упоминание убрано', 'A mention was removed'), named: true, dest: 'post', gone: GONE_POST },
  tagAnswered: { kind: 'result', filter: 'posts', icon: 'Check', tone: 'g', card: 'result', text: T('Ответ на отметку на фото', 'Your photo mark was answered'),
    normal: T('Ответ на отметку на фото', 'Your photo mark was answered'), dest: 'post', gone: GONE_POST },
  'tagAnswered.ok': { text: T('Отметку на фото подтвердили', 'The photo mark was confirmed') },
  'tagAnswered.no': { icon: 'EyeOff', tone: 'l', text: T('Человек на фото против публикации — она скрыта. Замени фото или удали публикацию', 'Someone in the photo objects — the post is hidden. Replace the photo or delete the post') },
  'tagAnswered.remove': { icon: 'EyeOff', tone: 'l', text: T('Человек убирает свою отметку с фото', 'Someone removed their photo mark') },
  postDisputed: { filter: 'posts', icon: 'EyeOff', tone: 'l', card: 'safety', text: T('Человек на фото против публикации — она скрыта до решения модераторов', 'Someone in the photo objects — the post is hidden until moderators decide'),
    normal: T('Публикация скрыта до решения модераторов', 'Your post is hidden until moderators decide'), dest: 'post', gone: GONE_POST },
  postRestored: { kind: 'result', filter: 'posts', icon: 'Check', tone: 'g', card: 'result', text: T('Модераторы вернули твою публикацию — она снова видна', 'Moderators restored your post — it’s visible again'),
    normal: T('Публикация снова видна', 'Your post is visible again'), dest: 'post', gone: GONE_POST },
  disputeResolved: { kind: 'result', filter: 'posts', icon: 'Check', tone: 'g', card: 'result', text: T('Спор об отметке на фото решён', 'The photo mark dispute was resolved'),
    normal: T('Спор об отметке на фото решён', 'The photo mark dispute was resolved'), dest: 'post', gone: GONE_POST },
  'disputeResolved.removed': { text: T('Твоя жалоба «это я на фото» подтвердилась — публикацию удалили', 'Your “that’s me in the photo” report was confirmed — the post was removed') },
  'disputeResolved.restored': { text: T('Публикацию оставили: жалоба «это я на фото» не подтвердилась', 'The post stays: your “that’s me in the photo” report was not confirmed') },
  'disputeResolved.gone': { text: T('Публикации больше нет — спор «это я на фото» закрыт', 'The post is gone — your “that’s me in the photo” dispute is closed') },
  revisionApproved: { kind: 'result', filter: 'posts', icon: 'Check', tone: 'g', card: 'result', text: T('Правка прошла проверку и видна в ленте', 'Your edit passed review and is in the feed'),
    normal: T('Правка прошла проверку', 'Your edit passed review'), dest: 'post', gone: GONE_POST },
  revisionRejected: { kind: 'result', filter: 'posts', icon: 'Shield', tone: 'l', card: 'result', text: T('Правка не прошла проверку', 'Your edit didn’t pass review'),
    normal: T('Правка не прошла проверку', 'Your edit didn’t pass review'), dest: 'moderation' }, // its card: the reason and «Обжаловать» (audit item 9)
  postReturned: { kind: 'result', filter: 'posts', icon: 'TriangleAlert', tone: 'l', card: 'result', text: T('Публикация вернулась с проверки — посмотри, что поправить', 'Your post came back from review — see what to fix'),
    normal: T('Публикация вернулась с проверки', 'Your post came back from review'), dest: 'postEdit', gone: GONE_POST },
  mediaDecided: { kind: 'result', filter: 'posts', icon: 'Image', tone: 'g', card: 'summary', text: T('Файл проверен', 'Your file was reviewed'),
    normal: T('Файл проверен', 'Your file was reviewed'), dest: 'object', collapse: 'type' },
  'mediaDecided.approved': { text: T('Файл одобрен', 'Your file was approved'), normal: T('Файл одобрен', 'Your file was approved') },
  'mediaDecided.rejected': { icon: 'Shield', tone: 'l', text: T('Файл не прошёл проверку', 'Your file didn’t pass review'), normal: T('Файл не прошёл проверку', 'Your file didn’t pass review'), dest: 'moderation' },

  // ---- moderation decisions about the person: their own decision card (src/fe/inbox.tsx NoteScreen) ----
  contentRemoved: { important: true, kind: 'result', filter: 'posts', icon: 'Shield', tone: 'l', card: 'safety', text: T('Модераторы удалили твою публикацию', 'Moderators removed your post'),
    normal: T('Модераторы удалили твой материал', 'Moderators removed your content'), email: 'now', dest: 'moderation' },
  'contentRemoved.reply': { text: T('Модераторы удалили твой ответ', 'Moderators removed your reply') },
  'contentRemoved.community': { text: T('Модераторы скрыли твоё сообщество', 'Moderators hid your community') },
  'contentRemoved.event': { text: T('Модераторы скрыли твоё событие', 'Moderators hid your event') },
  'contentRemoved.announcement': { text: T('Модераторы удалили твоё объявление к событию', 'Moderators removed your event update') },
  reportResolved: { kind: 'result', filter: 'posts', icon: 'Shield', tone: 'g', card: 'result', text: T('Жалоба рассмотрена. Спасибо, что сообщаешь', 'Report reviewed. Thanks for reporting'),
    normal: T('Жалоба рассмотрена', 'Your report was reviewed'), dest: 'moderation' },
  profileSuspended: { important: true, filter: 'other', icon: 'Shield', tone: 'l', card: 'safety', text: T('Профиль заблокирован', 'Your profile is suspended'),
    normal: T('Профиль заблокирован', 'Your profile is suspended'), email: 'now', dest: 'moderation' },
  'profileSuspended.until': { text: T('Профиль заблокирован до {date}', 'Your profile is suspended until {date}') },
  'profileSuspended.forever': { text: T('Профиль заблокирован, пока модераторы не снимут блокировку', 'Your profile is suspended until moderators lift it') },
  profileRestricted: { important: true, filter: 'other', icon: 'Shield', tone: 'l', card: 'safety', text: T('Профиль ограничен', 'Your profile is restricted'),
    normal: T('Профиль ограничен', 'Your profile is restricted'), email: 'now', dest: 'moderation' },
  'profileRestricted.until': { text: T('Профиль ограничен до {date}', 'Your profile is restricted until {date}') },
  'profileRestricted.forever': { text: T('Профиль ограничен, пока модераторы не снимут ограничение', 'Your profile is restricted until moderators lift it') },
  profileRestored: { kind: 'result', filter: 'other', icon: 'Check', tone: 'g', card: 'safety', text: T('Блокировку сняли — профиль снова доступен', 'The suspension was lifted — your profile is available again'),
    normal: T('Профиль снова доступен', 'Your profile is available again'), email: 'now', dest: 'moderation' },
  'profileRestored.expired': { text: T('Срок блокировки закончился — профиль снова доступен', 'The suspension ended — your profile is available again') },
  profileUnrestricted: { kind: 'result', filter: 'other', icon: 'Check', tone: 'g', card: 'safety', text: T('Ограничение сняли', 'The restriction was lifted'),
    normal: T('Ограничение снято', 'The restriction was lifted'), email: 'now', dest: 'moderation' },
  'profileUnrestricted.expired': { text: T('Срок ограничения закончился', 'The restriction ended') },
  appealDecided: { kind: 'result', filter: 'other', icon: 'Shield', tone: '', card: 'result', text: T('Апелляция рассмотрена', 'Your appeal was decided'),
    normal: T('Апелляция рассмотрена', 'Your appeal was decided'), email: 'now', dest: 'moderation' },
  'appealDecided.granted': { icon: 'Check', tone: 'g', text: T('Апелляция принята — решение пересмотрено', 'Appeal accepted — the decision was reviewed') },
  'appealDecided.denied': { text: T('Апелляция отклонена — решение остаётся', 'Appeal declined — the decision stands') },

  // ---- communities ----
  communityApproved: { kind: 'result', filter: 'groups', icon: 'Users', tone: 'g', card: 'result', text: T('Тебя приняли в сообщество', 'You’re in the community'),
    cat: 'groups', normal: T('Тебя приняли в сообщество', 'You’re in the community'), email: 'now-if-unread', dest: 'community', gone: GONE_COMMUNITY },
  communityDeclined: { kind: 'result', filter: 'groups', icon: 'Users', tone: '', card: 'result', text: T('Заявку в сообщество отклонили', 'Your community request was declined'),
    cat: 'groups', normal: T('Заявку в сообщество отклонили', 'Your community request was declined'), email: 'now-if-unread', dest: 'community', gone: GONE_COMMUNITY },
  communityMember: { filter: 'groups', icon: 'Users', tone: 'v', text: T('В сообществе изменилась твоя роль', 'Your role in a community changed'),
    cat: 'groups', normal: T('В сообществе изменилась твоя роль', 'Your role in a community changed'), dest: 'community', gone: GONE_COMMUNITY },
  'communityMember.host': { icon: 'UserCheck', tone: 'g', text: T('Тебя сделали ведущим сообщества', 'You’re now a host of the community') },
  'communityMember.unhost': { icon: 'Users', tone: '', text: T('Ты больше не ведущий сообщества', 'You’re no longer a host of the community') },
  'communityMember.readOnly': { icon: 'Users', tone: '', text: T('В сообществе тебе оставили только чтение', 'You can only read in the community now') },
  'communityMember.canWrite': { icon: 'Users', tone: 'g', text: T('В сообществе тебе снова можно писать', 'You can write in the community again') },
  'communityMember.remove': { icon: 'UserMinus', tone: 'l', text: T('Тебя убрали из сообщества', 'You were removed from the community') },
  communityPublished: { kind: 'result', filter: 'groups', icon: 'Check', tone: 'g', card: 'result', text: T('Твоё сообщество опубликовано', 'Your community is live'),
    cat: 'groups', normal: T('Сообщество опубликовано', 'Your community is live'), dest: 'community', gone: GONE_COMMUNITY },
  'communityPublished.change': { text: T('Правки сообщества приняты', 'Community changes accepted'), normal: T('Правки сообщества приняты', 'Community changes accepted') },
  communityRejected: { kind: 'result', filter: 'groups', icon: 'Shield', tone: 'l', card: 'result', text: T('Сообщество не прошло проверку', 'The community didn’t pass review'),
    cat: 'groups', normal: T('Сообщество не прошло проверку', 'The community didn’t pass review'), dest: 'community', gone: GONE_COMMUNITY },
  'communityRejected.change': { text: T('Правки сообщества не приняты', 'Community changes not accepted'), normal: T('Правки сообщества не приняты', 'Community changes not accepted') },
  // New members of an open community: one summary row a day to the hosts, no push (owner decision 7).
  communityJoins: { filter: 'groups', icon: 'Users', tone: 'v', card: 'summary', text: T('В сообществе новые участники за день', 'New members joined the community in the past day'),
    cat: 'groups', quiet: true, normal: T('Новые участники в сообществе', 'New community members'), dest: 'community', collapse: 'object', gone: GONE_COMMUNITY },
  communityClosed: { filter: 'groups', icon: 'Users', tone: '', text: T('Сообщество закрыто', 'The community was closed'),
    cat: 'groups', normal: T('Сообщество закрыто', 'The community was closed'), dest: 'community', gone: T('Сообщество закрыто', 'The community was closed') },
  'communityClosed.owner': { text: T('Владелец закрыл сообщество', 'The owner closed the community') },
  // Staff hid it (audit item 33): no reason, no staff name.
  communityUnavailable: { filter: 'groups', icon: 'EyeOff', tone: '', text: T('Сообщество больше недоступно', 'The community is no longer available'),
    cat: 'groups', normal: T('Сообщество больше недоступно', 'The community is no longer available'), dest: 'community', gone: T('Сообщество больше недоступно', 'The community is no longer available') },
  // A host who became the owner (audit item 14).
  communityOwner: { filter: 'groups', icon: 'UserCheck', tone: 'g', text: T('Теперь ты владелец сообщества', 'You’re now the owner of the community'),
    cat: 'groups', normal: T('Ты теперь владелец сообщества', 'You’re now the owner of the community'), dest: 'community', gone: GONE_COMMUNITY },
  // Its rules changed (audit item 39): the link opens «Правила»; nobody is asked to agree again.
  communityRules: { filter: 'groups', icon: 'Users', tone: 'v', text: T('Правила сообщества изменились', 'The community rules changed'),
    cat: 'groups', normal: T('Правила сообщества изменились', 'The community rules changed'), dest: 'community', collapse: 'object', gone: GONE_COMMUNITY },
  discussionRemoved: { filter: 'groups', icon: 'Trash2', tone: 'l', card: 'safety', text: T('Ведущие убрали твоё обсуждение', 'Hosts removed your discussion'),
    cat: 'groups', normal: T('Ведущие убрали твоё обсуждение', 'Hosts removed your discussion'), dest: 'community', gone: GONE_COMMUNITY },

  // ---- events ----
  eventPublished: { kind: 'result', filter: 'events', icon: 'Check', tone: 'g', card: 'result', text: T('Твоё событие опубликовано', 'Your event is live'),
    cat: 'events', normal: T('Событие опубликовано', 'Your event is live'), dest: 'event', gone: GONE_EVENT },
  'eventPublished.change': { text: T('Правки события приняты', 'Event changes accepted'), normal: T('Правки события приняты', 'Event changes accepted') },
  eventRejected: { kind: 'result', filter: 'events', icon: 'Shield', tone: 'l', card: 'result', text: T('Событие не прошло проверку', 'The event didn’t pass review'),
    cat: 'events', normal: T('Событие не прошло проверку', 'The event didn’t pass review'), dest: 'event', gone: GONE_EVENT },
  'eventRejected.change': { text: T('Правки события не приняты', 'Event changes not accepted'), normal: T('Правки события не приняты', 'Event changes not accepted') },
  eventLate: { kind: 'result', filter: 'events', icon: 'CalendarClock', tone: 'l', card: 'result', text: T('Время события прошло, пока оно ждало проверки — оно в черновиках', 'The event’s time passed while it waited for review — it’s back in drafts'),
    cat: 'events', normal: T('Событие вернулось в черновики', 'The event is back in drafts'), dest: 'eventDraft' },
  // Staff hid an event people follow (audit item 33): no reason, no staff name.
  eventUnavailable: { important: true, filter: 'events', icon: 'EyeOff', tone: 'l', card: 'event', text: T('Событие больше недоступно', 'The event is no longer available'),
    cat: 'events', normal: T('Событие больше недоступно', 'The event is no longer available'), email: 'now-if-unread', dest: 'event', collapse: 'object', gone: T('Событие больше недоступно', 'The event is no longer available') },
  eventHidden: { filter: 'events', icon: 'EyeOff', tone: 'l', card: 'safety', text: T('Модераторы скрыли событие', 'Moderators hid the event'),
    cat: 'events', normal: T('Модераторы скрыли событие', 'Moderators hid the event'), email: 'now', dest: 'event', gone: GONE_EVENT },
  eventApplicationApproved: { kind: 'result', filter: 'events', icon: 'Check', tone: 'g', card: 'result', text: T('Заявку на событие одобрили — адрес и детали открыты', 'Your event application is approved — address and details are open'),
    cat: 'events', normal: T('Заявку на событие одобрили', 'Your event application is approved'), email: 'now-if-unread', dest: 'event', gone: GONE_EVENT },
  // The partner marked the couple «идём» while this person is also marked alone (audit item 56, В11): only they see it.
  eventPairGoing: { filter: 'events', icon: 'Users', tone: 'v', text: T(['{name} отмечает, что вы идёте парой. У тебя есть и личная отметка — сними её, если идёте вместе', '{name} отмечают, что вы идёте парой. У тебя есть и личная отметка — сними её, если идёте вместе'], '{name} marked you going as a couple. You’re also marked on your own — remove it if you go together'),
    cat: 'events', normal: T('Вы идёте парой', 'You’re going as a couple'), named: true, dest: 'event', gone: GONE_EVENT },
  eventApplicationDeclined: { kind: 'result', filter: 'events', icon: 'Calendar', tone: '', card: 'result', text: T('Заявку на событие отклонили', 'Your event application was declined'),
    cat: 'events', normal: T('Заявку на событие отклонили', 'Your event application was declined'), email: 'now-if-unread', dest: 'event', gone: GONE_EVENT },
  eventCancelled: { important: true, filter: 'events', icon: 'CalendarX', tone: 'l', card: 'event', text: T('Событие отменено', 'The event was cancelled'),
    cat: 'events', normal: T('Событие отменено', 'The event was cancelled'), email: 'now-if-unread', dest: 'event', collapse: 'object', gone: T('Событие отменено', 'The event was cancelled') },
  'eventCancelled.community': { text: T('Событие отменено: сообщество закрыто', 'The event was cancelled: its community closed') },
  eventChanged: { important: true, filter: 'events', icon: 'CalendarClock', tone: 'v', card: 'event', text: T('В событии изменились детали', 'The event details changed'),
    cat: 'events', normal: T('В событии изменились детали', 'The event details changed'), email: 'now-if-unread', dest: 'event', collapse: 'object', gone: GONE_EVENT },
  eventAnnouncement: { filter: 'events', icon: 'Megaphone', tone: 'v', card: 'event', text: T('Новое объявление в событии', 'A new announcement in the event'),
    cat: 'events', normal: T('Новое объявление в событии', 'A new announcement in the event'), dest: 'event', gone: GONE_EVENT },
  eventReminder: { filter: 'events', icon: 'AlarmClock', tone: 'v', card: 'event', text: T('Скоро событие', 'An event starts soon'),
    cat: 'events', normal: T('Скоро событие', 'An event starts soon'), email: 'none', dest: 'event', collapse: 'object', gone: GONE_EVENT },

  // ---- couple (addressed to the couple; {couple} is its name at the time) ----
  'pair.created': { cat: 'pair', filter: 'pair', icon: 'Users', tone: 'v', text: T('{couple} · Пара создана', '{couple} · Your couple is set up'),
    normal: T('Пара создана', 'Your couple is set up'), dest: 'couple', gone: GONE_PAIR },
  'pair.declined': { cat: 'pair', kind: 'result', filter: 'pair', icon: 'Users', tone: '', card: 'result', text: T('Приглашение в пару отклонили', 'Your couple invitation was declined'),
    normal: T('Приглашение в пару отклонили', 'Your couple invitation was declined'), dest: 'couple' },
  'pair.inviteExpired': { cat: 'pair', kind: 'result', filter: 'pair', icon: 'Users', tone: '', card: 'result', text: T('Приглашение в пару истекло — на него не ответили', 'Your couple invitation expired without an answer'),
    normal: T('Приглашение в пару истекло', 'Your couple invitation expired'), dest: 'couple' },
  'pair.deleted': { cat: 'pair', filter: 'pair', icon: 'Users', tone: '', text: T('{couple} · Пара удалена', '{couple} · The couple was deleted'),
    normal: T('Пара удалена', 'The couple was deleted'), email: 'now-if-unread', dest: 'couple', gone: GONE_PAIR },
  // One pause, one row per side (couples.mjs couple.stop): not a «сузил видимость» next to it.
  'pair.unavailable': { cat: 'pair', filter: 'pair', icon: 'Users', tone: '', text: T('{couple} · Пара сейчас недоступна', '{couple} · The couple is unavailable for now'),
    normal: T('Пара сейчас недоступна', 'The couple is unavailable for now'), dest: 'me' },
  'pair.stopped': { cat: 'pair', filter: 'pair', icon: 'Users', tone: '', text: T('{couple} · Пара на паузе', '{couple} · The couple is paused'),
    normal: T('Пара на паузе', 'The couple is paused'), email: 'now-if-unread', dest: 'coupleRestore', gone: GONE_PAIR },
  'pair.restored': { cat: 'pair', filter: 'pair', icon: 'Users', tone: 'g', text: T('{couple} · Пара восстановлена', '{couple} · The couple was restored'),
    normal: T('Пара восстановлена', 'The couple was restored'), dest: 'couple', gone: GONE_PAIR },
  // «Не восстанавливать» by the partner (owner 04.11.2026): the couple is an archive for 30 days, then deleted.
  'pair.ended': { cat: 'pair', filter: 'pair', icon: 'Users', tone: '', text: T('{couple} · Пара завершена. Архив хранится 30 дней — сохрани нужное', '{couple} · The couple has ended. The archive is kept for 30 days — save what you need'),
    normal: T('Пара завершена', 'The couple has ended'), email: 'now-if-unread', dest: 'coupleRestore', gone: GONE_PAIR },
  'pair.purgeAsked': { cat: 'pair', filter: 'pair', icon: 'Users', tone: 'v', text: T('{couple} · Партнёр хочет удалить архив пары сейчас', '{couple} · Your partner wants to delete the couple’s archive now'),
    normal: T('Партнёр хочет удалить архив пары', 'Your partner wants to delete the couple’s archive'), email: 'now-if-unread', dest: 'coupleRestore', gone: GONE_PAIR },
  'pair.restoreRequested': { cat: 'pair', filter: 'pair', icon: 'Users', tone: 'v', text: T('{couple} · Партнёр хочет восстановить пару', '{couple} · Your partner wants to restore the couple'),
    normal: T('Партнёр хочет восстановить пару', 'Your partner wants to restore the couple'), email: 'now-if-unread', dest: 'coupleRestore', gone: GONE_PAIR },
  'pair.narrowed': { cat: 'pair', filter: 'pair', icon: 'Users', tone: 'v', text: T('{couple} · Партнёр сузил видимость пары', '{couple} · Your partner narrowed the couple’s visibility'),
    normal: T('Партнёр сузил видимость пары', 'Your partner narrowed the couple’s visibility'), dest: 'couple', gone: GONE_PAIR },
  'pair.trust': { cat: 'pair', filter: 'pair', icon: 'Users', tone: 'v', text: T('{couple} · Изменилось согласие партнёра', '{couple} · Partner approval changed'),
    normal: T('Изменилось согласие партнёра', 'Partner approval changed'), dest: 'couple', gone: GONE_PAIR },
  'pair.trust.on': { text: T('{couple} · Партнёр теперь подтверждает твои изменения пары', '{couple} · Your partner now approves your couple changes') },
  'pair.trust.off': { text: T('{couple} · Партнёр доверяет: твои изменения пары применяются сразу', '{couple} · Your partner trusts you: your couple changes apply at once') },
  'pair.decided': { cat: 'pair', kind: 'result', filter: 'pair', icon: 'Users', tone: 'v', card: 'result', text: T('{couple} · Партнёр ответил на изменение', '{couple} · Your partner answered a change'),
    normal: T('Партнёр ответил на изменение', 'Your partner answered a change'), dest: 'approval', gone: GONE_PAIR },
  'pair.decided.approved': { tone: 'g', text: T('{couple} · Партнёр согласился', '{couple} · Your partner agreed'), normal: T('Партнёр согласился', 'Your partner agreed') },
  'pair.decided.rejected': { tone: '', text: T('{couple} · Партнёр отказался', '{couple} · Your partner declined'), normal: T('Партнёр отказался', 'Your partner declined') },
  'pair.decided.cancelled': { tone: '', text: T('{couple} · Изменение отменено', '{couple} · The change was cancelled'), normal: T('Изменение отменено', 'The change was cancelled') },
  'pair.decided.expired': { tone: '', text: T('{couple} · Срок истёк', '{couple} · The time ran out'), normal: T('Срок истёк', 'The time ran out') },
  'pair.decided.superseded': { tone: '', text: T('{couple} · Заменено новым предложением', '{couple} · Replaced by a newer proposal'), normal: T('Заменено новым предложением', 'Replaced by a newer proposal') },
  'pair.decided.stale': { tone: '', text: T('{couple} · Не применено: пока ждали, всё изменилось', '{couple} · Not applied: it changed while waiting'), normal: T('Изменение устарело', 'The change is out of date') },
  // A partner's action for the couple in trust mode: in the couple's history, never by email (owner 03.11.2026). A push
  // only for what matters — a post, an event answer or application, access, a link; everyday actions stay quiet.
  'pair.acted': { cat: 'pair', filter: 'pair', icon: 'Users', tone: 'v', text: T('{couple} · Партнёр сделал действие от пары', '{couple} · Your partner acted for the couple'),
    normal: T('Партнёр сделал действие от пары', 'Your partner acted for the couple'), quiet: true, email: 'none', dest: 'couple', collapse: 'type', gone: GONE_PAIR },
  'pair.acted.follow': { text: T('{couple} · Партнёр подписался от пары', '{couple} · Your partner followed someone for the couple'), dest: 'target' },
  'pair.acted.photos': { text: T('{couple} · Партнёр добавил фото пары', '{couple} · Your partner added couple photos'), dest: 'coupleGallery' },
  'pair.acted.album': { text: T('{couple} · Партнёр изменил альбом пары', '{couple} · Your partner changed the couple’s album'), dest: 'coupleGallery' },
  'pair.acted.post': { text: T('{couple} · Партнёр опубликовал от пары', '{couple} · Your partner posted for the couple'), quiet: false, dest: 'myPosts' },
  'pair.acted.event': { text: T('{couple} · Партнёр ответил на событие от пары', '{couple} · Your partner answered an event for the couple'), quiet: false, dest: 'event', gone: GONE_EVENT },
  'pair.acted.eventApply': { text: T('{couple} · Партнёр подал заявку на событие от пары', '{couple} · Your partner applied to an event for the couple'), quiet: false, dest: 'event', gone: GONE_EVENT },
  'pair.acted.community': { text: T('{couple} · Партнёр вступил в сообщество от пары', '{couple} · Your partner joined a community for the couple'), dest: 'community', gone: GONE_COMMUNITY },
  'pair.acted.privateContent': { text: T('{couple} · Партнёр изменил приватную часть пары', '{couple} · Your partner changed the couple’s private part'), dest: 'access' },
  'pair.acted.access': { text: T('{couple} · Партнёр включил приватную часть пары', '{couple} · Your partner turned on the couple’s private part'), quiet: false, dest: 'access' },
  'pair.acted.post_archived': { text: T('{couple} · Партнёр убрал публикацию пары в архив', '{couple} · Your partner archived a couple post'), dest: 'myPosts' },
  'pair.acted.chatRequest': { text: T('{couple} · Партнёр отправил запрос на переписку от пары', '{couple} · Your partner sent a chat request for the couple'), dest: 'chats' },
  'pair.acted.like': { text: T('{couple} · Партнёр лайкнул профиль от пары', '{couple} · Your partner liked a profile for the couple'), dest: 'target' },
  'pair.acted.location': { text: T('{couple} · Партнёр изменил город пары', '{couple} · Your partner changed the couple’s city'), dest: 'couple' },
  'pair.acted.block': { text: T('{couple} · Партнёр заблокировал профиль от пары', '{couple} · Your partner blocked a profile for the couple'), dest: 'blocked' },
  'pair.acted.link': { text: T('{couple} · Партнёр связал профиль с парой', '{couple} · Your partner linked a profile to the couple'), quiet: false, dest: 'links' },
  'pair.acted.linkShown': { text: T('{couple} · Партнёр показал связь пары шире', '{couple} · Your partner showed a couple link more widely'), quiet: false, dest: 'links' },
  'pair.acted.profile': { text: T('{couple} · Партнёр изменил профиль пары', '{couple} · Your partner edited the couple’s profile'), dest: 'me' },
  'pair.acted.interests': { text: T('{couple} · Партнёр изменил интересы пары', '{couple} · Your partner changed the couple’s interests'), dest: 'interests' },
  'pair.acted.discoverMode': { text: T('{couple} · Партнёр изменил показ пары в Знакомствах', '{couple} · Your partner changed how the couple shows in Discover'), dest: 'visibility' },
  'pair.acted.acceptProfileLikes': { text: T('{couple} · Партнёр изменил, принимает ли пара симпатии', '{couple} · Your partner changed whether the couple takes likes'), dest: 'visibility' },
  'pair.acted.requestsFrom': { text: T('{couple} · Партнёр изменил, кто может просить доступ к паре', '{couple} · Your partner changed who may ask the couple for access'), dest: 'visibility' },
  'pair.acted.linksFrom': { text: T('{couple} · Партнёр изменил, кто может предлагать паре связь', '{couple} · Your partner changed who may propose a link to the couple'), dest: 'visibility' },
  'pair.acted.mentionsFrom': { text: T('{couple} · Партнёр изменил, кто может упоминать пару', '{couple} · Your partner changed who may mention the couple'), dest: 'visibility' },
  'pair.acted.activityVis': { text: T('{couple} · Партнёр изменил, кто видит активность пары', '{couple} · Your partner changed who sees the couple’s activity'), dest: 'visibility' },
  'pair.acted.showLikes': { text: T('{couple} · Партнёр изменил показ симпатий пары', '{couple} · Your partner changed how the couple’s likes show'), dest: 'visibility' },
  'pair.acted.messagesFrom': { text: T('{couple} · Партнёр изменил, кто может писать паре', '{couple} · Your partner changed who may message the couple'), dest: 'visibility' },

  // ---- account, staff, platform ----
  ageCheck: { kind: 'result', filter: 'other', icon: 'ShieldCheck', tone: 'g', card: 'result', text: T('Проверка возраста', 'Age check'),
    normal: T('Проверка возраста завершена', 'Your age check is done'), dest: 'age' },
  'ageCheck.approved': { text: T('Возраст подтверждён', 'Your age is verified') },
  'ageCheck.other': { icon: 'Shield', tone: 'l', text: T('Проверка возраста не прошла', 'Age verification didn’t pass') },
  photoCheck: { kind: 'result', filter: 'other', icon: 'ShieldCheck', tone: 'g', card: 'result', text: T('Фото-проверка', 'Photo verification'),
    normal: T('Фото-проверка завершена', 'Your photo check is done'), dest: 'photoCheck' },
  'photoCheck.approved': { text: T('Фото подтверждено', 'Your photo is verified') },
  'photoCheck.other': { icon: 'Shield', tone: 'l', text: T('Фото-проверка не прошла', 'Photo verification didn’t pass') },
  premiumGranted: { filter: 'other', icon: 'Crown', tone: 'g', text: T('Тебе открыт Premium до {date}', 'Premium is on for you until {date}'),
    normal: T('Тебе открыт Premium', 'Premium is on for you'), email: 'now', dest: 'premium' },
  premiumRevoked: { filter: 'other', icon: 'Crown', tone: '', text: T('Premium отключён. Если это ошибка, напиши в поддержку', 'Premium was turned off. If this is a mistake, write to support'),
    normal: T('Premium отключён', 'Premium was turned off'), email: 'now', dest: 'premium' },
  // Soon over (a week / a day ahead) and over: for grants, gifts and a subscription that is not renewing.
  premiumEnding: { filter: 'other', icon: 'Crown', tone: 'l', text: T('Premium закончится {date}', 'Premium ends {date}'),
    normal: T('Premium скоро закончится', 'Premium ends soon'), email: 'now', dest: 'premium' },
  'premiumEnding.week': { text: T('Premium закончится {date}', 'Premium ends {date}') },
  'premiumEnding.day': { text: T('Premium закончится завтра', 'Premium ends tomorrow') },
  premiumEnded: { filter: 'other', icon: 'Crown', tone: '', text: T('Premium закончился', 'Premium has ended'),
    normal: T('Premium закончился', 'Premium has ended'), email: 'now', dest: 'premium' },
  // A partner's Premium reaches the couple (acting as «Мы» it works), and stops reaching it.
  premiumPair: { filter: 'other', icon: 'Crown', tone: 'g', text: T('Партнёр открыл вашей паре Premium до {date}', 'Your partner opened Premium for your couple until {date}'),
    normal: T('Партнёр открыл вашей паре Premium', 'Your partner opened Premium for your couple'), email: 'now', dest: 'premium' },
  'premiumPair.started': { text: T('Партнёр открыл вашей паре Premium до {date}', 'Your partner opened Premium for your couple until {date}') },
  'premiumPair.ended': { tone: '', text: T('У вашей пары закончился Premium', 'Your couple’s Premium has ended'), normal: T('У вашей пары закончился Premium', 'Your couple’s Premium has ended') },
  // The person who invited somebody: the friend finished getting to know the app, so the days are theirs (nobody is named).
  premiumReferral: { filter: 'other', icon: 'Crown', tone: 'g', text: T('Друг пришёл по твоему приглашению: тебе добавлен Premium', 'A friend joined by your invitation: Premium was added for you'),
    normal: T('Друг пришёл по твоему приглашению', 'A friend joined by your invitation'), email: 'now', dest: 'premium' },
  // To the giver, once the gift is paid and given.
  premiumGiftSent: { filter: 'other', icon: 'Crown', tone: 'g', text: T('{name}: подарок Premium вручён', '{name}: your Premium gift was delivered'),
    alone: T('Подарок вручён', 'Your gift was delivered'), normal: T('Подарок вручён', 'Your gift was delivered'), named: true, dest: 'premium' },
  // Ready for when payments are connected (docs/infra/payments.md, «Что подключить»): nothing sends these yet.
  premiumRenewalFailed: { important: true, filter: 'other', icon: 'Crown', tone: 'l', text: T('Продление Premium не прошло. Проверь способ оплаты', 'Your Premium renewal failed. Check your payment method'),
    normal: T('Продление Premium не прошло', 'Your Premium renewal failed'), email: 'now', dest: 'premium' },
  premiumRenewal: { filter: 'other', icon: 'Crown', tone: 'g', text: T('Автопродление Premium включено', 'Premium auto-renewal is on'),
    normal: T('Автопродление Premium изменено', 'Premium auto-renewal changed'), email: 'now', dest: 'premium' },
  'premiumRenewal.on': { text: T('Автопродление Premium включено', 'Premium auto-renewal is on') },
  'premiumRenewal.off': { tone: '', text: T('Автопродление Premium выключено. Premium закончится в срок', 'Premium auto-renewal is off. Premium will end on schedule') },
  premiumReceipt: { filter: 'other', icon: 'Crown', tone: 'g', text: T('Оплата Premium прошла. Чек придёт на почту', 'Premium payment received. The receipt is on its way by email'),
    normal: T('Оплата Premium прошла', 'Premium payment received'), email: 'now', dest: 'premium' },
  premiumRefunded: { filter: 'other', icon: 'Crown', tone: '', text: T('Деньги за Premium возвращены', 'Your Premium payment was refunded'),
    normal: T('Деньги за Premium возвращены', 'Your Premium payment was refunded'), email: 'now', dest: 'premium' },
  premiumGift: { filter: 'other', icon: 'Crown', tone: 'l', text: T(['{name} дарит тебе Premium', '{name} дарят тебе Premium'], '{name} gifts you Premium'),
    alone: T('Тебе подарили Premium', 'You’ve been gifted Premium'), normal: T('Тебе подарили Premium', 'You’ve been gifted Premium'), named: true, email: 'now', dest: 'premium' },
  staffRole: { filter: 'other', icon: 'ShieldCheck', tone: 'v', text: T('Изменилась твоя роль', 'Your role changed'),
    normal: T('Изменилась твоя роль', 'Your role changed'), dest: 'me' },
  'staffRole.grant': { text: T('Тебе выдана роль: {role}', 'You were given a role: {role}'), dest: 'staff' },
  'staffRole.revoke': { tone: '', text: T('Роль снята: {role}', 'A role was taken away: {role}') },
  // Staff alerts: the row's words come from the kind of alert (src/fe/note-status.ts, fe.ibx.staff.*).
  staffAlert: { important: true, filter: 'other', icon: 'ShieldAlert', tone: 'l', card: 'safety', text: T('Срочное в модерации', 'Urgent in moderation'),
    normal: T('Срочное в модерации', 'Urgent in moderation'), email: 'now-if-unread', dest: 'staff', collapse: 'type' },
  signinNew: { important: true, filter: 'other', icon: 'ShieldAlert', tone: 'l', card: 'safety', text: T('Вход с нового устройства', 'New device signed in'),
    cat: 'security', safe: T('Вход с нового устройства', 'New device signed in'), normal: T('Вход с нового устройства', 'New device signed in'), email: 'now', dest: 'security' },
  supportReply: { filter: 'other', icon: 'LifeBuoy', tone: 'v', text: T('Поддержка ответила на твоё обращение', 'Support answered your request'),
    normal: T('Поддержка ответила', 'Support answered'), email: 'now-if-unread', dest: 'help' },
  supportClosed: { filter: 'other', icon: 'LifeBuoy', tone: '', text: T('Обращение закрыто', 'Your request was closed'),
    normal: T('Обращение закрыто', 'Your request was closed'), dest: 'help' },
  datingLaunched: { cat: 'news', filter: 'other', icon: 'Heart', tone: 'v', text: T('Знакомства открылись — можно смотреть анкеты', 'Discover is open — you can look at profiles now'),
    normal: T('Знакомства открылись', 'Discover is open'), dest: 'people' },

  // ---- chat messages: a push and the chat's unread count, never an inbox row ----
  message: { filter: 'matches', icon: 'MessageCircle', tone: 'v', text: T('Новое сообщение', 'New message'),
    cat: 'messages', normal: T('Новое сообщение', 'New message'), email: 'none', dest: 'chat', collapse: 'object', gone: GONE_CHAT },

  // ---- «Нужно решить» (tasks: live until decided, reading does not close them) ----
  'decide.pinv': { kind: 'task', card: 'decision', filter: 'pair', icon: 'Users', tone: 'v', text: T('{name} приглашает тебя связать профили в пару', '{name} invites you to link profiles as a couple'),
    cat: 'decide', normal: T('Приглашение в пару', 'A couple invitation'), email: 'now-if-unread', dest: 'invite' },
  'decide.req': { kind: 'task', card: 'decision', filter: 'access', icon: 'LockOpen', tone: 'v', text: T('{name} просит открыть твою приватную часть', '{name} asks to see your private part'),
    cat: 'decide', normal: T('Просят открыть приватную часть', 'Someone asks for access'), email: 'now-if-unread', dest: 'accessRequest' },
  'decide.req.couple': { text: T('{name} просит открыть приватную часть пары', '{name} asks to see the couple’s private part') },
  'decide.capp': { kind: 'task', card: 'decision', filter: 'groups', icon: 'Users', tone: 'v', text: T('{name} подаёт заявку в сообщество', '{name} asks to join the community'),
    cat: 'decide', normal: T('Новая заявка в сообщество', 'A new community request'), email: 'now-if-unread', dest: 'communityRequests', gone: GONE_COMMUNITY },
  'decide.eapp': { kind: 'task', card: 'decision', filter: 'events', icon: 'Calendar', tone: 'v', text: T('{name} подаёт заявку на событие', '{name} applied to the event'),
    cat: 'decide', normal: T('Новая заявка на событие', 'A new event application'), email: 'now-if-unread', dest: 'eventApplications', gone: GONE_EVENT },
  'decide.link': { kind: 'task', card: 'decision', filter: 'links', icon: 'Users', tone: 'v', text: T('{name} предлагает связь', '{name} proposes a link'),
    cat: 'decide', normal: T('Тебе предлагают связь', 'Someone proposes a link'), email: 'now-if-unread', dest: 'link' },
  'decide.linkChange': { kind: 'task', card: 'decision', filter: 'links', icon: 'Users', tone: 'v', text: T('{name} предлагает изменить связь', '{name} proposes to change a link'),
    cat: 'decide', normal: T('Тебе предлагают изменить связь', 'Someone proposes to change a link'), email: 'now-if-unread', dest: 'link' },
  'decide.tag': { kind: 'task', card: 'decision', filter: 'posts', icon: 'Image', tone: 'v', text: T('{name} отмечает тебя на фото — без твоего согласия публикацию никто не увидит', '{name} marked you in a photo — nobody sees the post without your consent'),
    cat: 'decide', normal: T('Тебя отметили на фото', 'You were marked in a photo'), email: 'now-if-unread', dest: 'post', gone: GONE_POST },
  'decide.joint': { kind: 'task', card: 'decision', filter: 'pair', icon: 'Clock', tone: '', text: T('{name} предлагает изменение', '{name} suggests a change'),
    alone: T('Партнёр предлагает изменение', 'Your partner suggests a change'),
    cat: 'decide', normal: T('Партнёр ждёт твоего согласия', 'Your partner waits for your approval'), email: 'now-if-unread', dest: 'approval', gone: GONE_PAIR },
  // The relationship status of a person in a couple (owner 04.11.2026): nothing enqueues it, so only the counters and the card.
  'decide.status': { kind: 'task', card: 'decision', filter: 'pair', icon: 'Heart', tone: 'v', text: T('Вы в паре — поменять статус в «Данных»?', 'You’re in a couple — change the status in your details?'),
    cat: 'decide', normal: T('Статус в профиле', 'Your profile status'), email: 'now-if-unread', dest: 'me' },
  // «{name} предлагает {action}» per approval kind (server/approvals.mjs APPROVAL_KINDS): the decide card line, the
  // same words on both sides (decide.list carries `approval.kind`).
  'decide.joint.profile.update': { text: T('{name} предлагает изменить профиль пары', '{name} suggests editing the couple’s profile') },
  'decide.joint.profile.photos': { text: T('{name} предлагает добавить фото пары', '{name} suggests adding couple photos') },
  'decide.joint.profile.setVisibility': { text: T('{name} предлагает изменить видимость пары', '{name} suggests changing the couple’s visibility') },
  'decide.joint.interests.set': { text: T('{name} предлагает изменить интересы пары', '{name} suggests changing the couple’s interests') },
  'decide.joint.post.publish': { text: T('{name} предлагает опубликовать пост от пары', '{name} suggests posting for the couple') },
  'decide.joint.post.edit': { text: T('{name} предлагает изменить пост пары', '{name} suggests editing a couple post') },
  'decide.joint.event.submit': { text: T('{name} предлагает отправить событие на проверку', '{name} suggests sending an event for review') },
  'decide.joint.event.update': { text: T('{name} предлагает изменить событие пары', '{name} suggests changing a couple event') },
  'decide.joint.event.rsvp': { text: T('{name} предлагает ответить на событие от пары', '{name} suggests answering an event for the couple') },
  'decide.joint.event.apply': { text: T('{name} предлагает подать заявку на событие', '{name} suggests applying to an event') },
  'decide.joint.access.grant': { text: T('{name} предлагает открыть приватную часть пары', '{name} suggests opening the couple’s private part') },
  'decide.joint.private.on': { text: T('{name} предлагает включить приватную часть пары', '{name} suggests turning on the couple’s private part') },
  'decide.joint.community.create': { text: T('{name} предлагает создать сообщество от пары', '{name} suggests creating a community for the couple') },
  'decide.joint.community.join': { text: T('{name} предлагает вступить в сообщество', '{name} suggests joining a community') },
  'decide.joint.link.propose': { text: T('{name} предлагает связь с профилем', '{name} suggests a link with a profile') },
  'decide.joint.link.accept': { text: T('{name} предлагает подтвердить связь', '{name} suggests confirming a link') },
  'decide.joint.link.visibility': { text: T('{name} предлагает показать связь шире', '{name} suggests showing a link more widely') },
  'decide.joint.location.set': { text: T('{name} предлагает поделиться местом пары', '{name} suggests sharing the couple’s location') },
  'decide.joint.chat.request': { text: T('{name} предлагает написать от пары', '{name} suggests messaging for the couple') },
  'decide.joint.reply.create': { text: T('{name} предлагает ответить от пары', '{name} suggests replying for the couple') },
  'decide.joint.like.send': { text: T('{name} предлагает поставить лайк от пары', '{name} suggests a like for the couple') },
  'decide.joint.follow.set': { text: T('{name} предлагает подписаться от пары', '{name} suggests following for the couple') },
  'decide.joint.link.change': { text: T('{name} предлагает изменить вид связи', '{name} suggests changing a link’s kind') },
  'decide.joint.link.changeAnswer': { text: T('{name} предлагает согласиться на новый вид связи', '{name} suggests agreeing to a link’s new kind') },
  'decide.joint.community.update': { text: T('{name} предлагает изменить сообщество пары', '{name} suggests editing the couple’s community') },
});

/** Which data field picks a subtype of a type (`type.sub` in the catalog). */
const SUB = /** @type {Record<string, (d: Record<string, any>) => unknown>} */ ({
  communityMember: d => d.change,
  communityClosed: d => (d.why === 'owner' ? 'owner' : undefined),
  eventCancelled: d => (d.why === 'community_closed' ? 'community' : undefined),
  'pair.acted': d => d.what,
  'pair.decided': d => d.state,
  'pair.trust': d => (d.approves === true ? 'on' : d.approves === false ? 'off' : undefined),
  linkChanged: d => d.answer,
  tagAnswered: d => d.answer,
  ageCheck: d => (d.state === 'approved' ? 'approved' : 'other'),
  photoCheck: d => (d.state === 'approved' ? 'approved' : 'other'),
  mediaDecided: d => (d.state === 'approved' ? 'approved' : 'rejected'),
  disputeResolved: d => (d.outcome === 'removed' ? 'removed' : d.outcome === 'restored' ? 'restored' : d.outcome === 'gone' ? 'gone' : undefined),
  appealDecided: d => (d.state === 'granted' ? 'granted' : d.state === 'denied' ? 'denied' : undefined),
  staffRole: d => (d.grant === true ? 'grant' : d.grant === false ? 'revoke' : undefined),
  premiumEnding: d => (d.kind === 'day' ? 'day' : 'week'),
  premiumPair: d => (d.kind === 'ended' ? 'ended' : 'started'),
  premiumRenewal: d => (d.kind === 'off' ? 'off' : 'on'),
  contentRemoved: d => d.targetType,
  profileSuspended: d => (d.until ? 'until' : 'forever'),
  profileRestricted: d => (d.until ? 'until' : 'forever'),
  profileRestored: d => (d.rule === 'expired' ? 'expired' : undefined),
  profileUnrestricted: d => (d.rule === 'expired' ? 'expired' : undefined),
  communityPublished: d => (d.what === 'change' ? 'change' : undefined),
  communityRejected: d => (d.what === 'change' ? 'change' : undefined),
  eventPublished: d => (d.what === 'change' ? 'change' : undefined),
  eventRejected: d => (d.what === 'change' ? 'change' : undefined),
  'decide.req': d => (d.label === 'couple' ? 'couple' : undefined),
  // A partner approval's own words per kind of change (`decide.joint.<kind>`): the decide item's `approvalKind`.
  'decide.joint': d => d.approvalKind ?? d.kind,
});

/** @param {any} o @returns {Entry} */
function build(o) {
  return Object.freeze({
    kind: o.kind ?? 'notice', filter: o.filter ?? 'other', icon: o.icon ?? 'Bell', tone: o.tone ?? '', card: o.card ?? 'news',
    text: o.text, ...(o.alone ? { alone: o.alone } : {}),
    push: Object.freeze({ cat: o.cat ?? 'other', safe: o.safe ?? SAFE_PUSH, normal: o.normal, named: !!o.named,
      // Every task waits for the morning in quiet hours; so do the entries marked important. `quiet`: history only, no push.
      important: o.important ?? o.kind === 'task', noisy: !!o.noisy, off: !!o.quiet, ...(o.summary ? { summary: o.summary } : {}) }),
    email: o.email ?? 'digest', subject: o.subject ?? o.normal, dest: o.dest ?? 'inbox', collapse: o.collapse ?? 'none', gone: o.gone ?? GONE,
  });
}

/** The base key a `type.sub` key extends: the longest other key it starts with. @param {string} key */
function baseOf(key) {
  let best = '';
  for (const k of Object.keys(RAW)) if (k !== key && key.startsWith(k + '.') && k.length > best.length) best = k;
  return best;
}

/** @type {Readonly<Record<string, Entry>>} */
export const CATALOG = Object.freeze(Object.fromEntries(Object.keys(RAW).map(key => {
  /** @type {any[]} */
  const chain = [];
  for (let k = key; k; k = baseOf(k)) chain.unshift(RAW[k]);
  return [key, build(Object.assign({}, ...chain))];
})));

/** The catalog key of a notification: its subtype when the catalog has one, else the type; null for an unknown type.
 * @param {string} type @param {Record<string, unknown> | null | undefined} [data] @returns {string | null} */
export function noteKey(type, data) {
  const pick = SUB[type];
  const sub = pick ? pick(data ?? {}) : undefined;
  if (typeof sub === 'string' && CATALOG[`${type}.${sub}`]) return `${type}.${sub}`;
  return CATALOG[type] ? type : null;
}

/** @param {string} type @param {Record<string, unknown> | null | undefined} [data] @returns {Entry | null} */
export const entryFor = (type, data) => { const k = noteKey(type, data); return k ? CATALOG[k] : null; };

/** One text in a language, for a person or a couple. @param {Text} text @param {string} locale @param {boolean} [couple] */
export function textOf(text, locale, couple = false) {
  const v = locale === 'en' ? text.en : text.ru;
  return typeof v === 'string' ? v : v[couple ? 1 : 0];
}

/** What someone did, without their name — the push body under the name in «Обычные», and the line under the name on a
 * decision card: «{name} ставит тебе симпатию» → «Ставит тебе симпатию». @param {Text} text @param {string} locale @param {boolean} [couple] */
export function actOf(text, locale, couple = false) {
  const s = textOf(text, locale, couple).replace('{name}', '').replace(/^[\s—:–-]+/, '');
  return s.charAt(0).toLocaleUpperCase(locale === 'en' ? 'en' : 'ru') + s.slice(1);
}

/** The words of a row as plain text with its placeholders filled ({name} falls back to `alone`, or the act).
 * @param {Entry} e @param {string} locale @param {{name?: string | null, couple?: boolean, vars?: Record<string, string>}} [o] */
export function noteLine(e, locale, { name = null, couple = false, vars = {} } = {}) {
  let s = textOf(e.text, locale, couple);
  if (s.includes('{name}') && !name) s = e.alone ? textOf(e.alone, locale) : actOf(e.text, locale);
  return s.replace(/\{(\w+)\}/g, (m, k) => (k === 'name' ? name ?? '' : vars[k] ?? m));
}

// ---- destinations ----

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** @param {unknown} v @returns {v is string} */
const isId = v => typeof v === 'string' && UUID.test(v);

/**
 * @typedef {{type: string, id?: string | null, data?: Record<string, any> | null, object?: {type: string, id: string | null} | null,
 *   sub?: {type: string, id: string | null} | null, actor?: string | null, addressee?: string | null, couple?: string | null}} NoteRef
 * `id`: the notification's own id (a moderation decision opens its own card).
 */

/** Screens of an object type. @param {string | undefined} type @param {string} id */
function objectPath(type, id) {
  if (type === 'post') return `/n/feed/post/${id}`;
  if (type === 'community') return `/n/communities/${id}`;
  if (type === 'event') return `/n/events/${id}`;
  if (type === 'conversation') return `/n/chats/${id}`;
  if (type === 'profile') return `/n/people/${id}`;
  return null;
}

/** Fixed screens of a destination kind, also the fallback of the ones that need an id. */
const FIXED = /** @type {Record<string, string>} */ ({
  inbox: '/n/inbox', me: '/n/me', chats: '/n/chats', links: '/n/me/links', myPosts: '/n/me/posts', interests: '/n/me/interests',
  couple: '/n/me/pair', approval: '/n/me/pair', blocked: '/n/settings/blocked', security: '/n/settings/security', age: '/n/settings/age',
  photoCheck: '/n/settings/photo-check', help: '/n/help', premium: '/n/premium', staff: '/n/staff', people: '/n/people',
  access: '/n/me/access', visibility: '/n/me', accessRequest: '/n/me/access', invite: '/n/inbox', link: '/n/me/links', moderation: '/n/inbox', coupleRestore: '/n/me/pair',
});

/** Where a notification (or a «Нужно решить» item, or a chat message push) opens: a route of the /n screens, with the
 * profile to act as (`as`) for anything addressed to a couple or to one of the person's profiles — the screen then
 * switches to it (src/fe/shell.tsx ActAs). Unknown or incomplete items open the inbox. The result always passes
 * `routeOk`. @param {NoteRef} n @returns {string} */
export function destination(n) {
  const e = entryFor(n.type, n.data);
  const d = n.data ?? {};
  const kind = e?.dest ?? 'inbox';
  const obj = n.object && isId(n.object.id) ? /** @type {{type: string, id: string}} */ (n.object) : null;
  /** @type {Record<string, string>} */
  const q = {};
  /** @type {string | null} */
  let path = null;
  const postId = obj?.type === 'post' ? obj.id : isId(d.postId) ? d.postId : null;
  switch (kind) {
    case 'post': {
      if (postId) path = `/n/feed/post/${postId}`;
      const reply = n.sub?.type === 'reply' && isId(n.sub.id) ? n.sub.id : isId(d.replyId) ? d.replyId : null;
      if (path && reply) q.reply = reply;
      break;
    }
    case 'postEdit': if (postId) path = `/n/feed/post/${postId}/edit`; break;
    // A couple post (an archived one too: the owner can still open it); without its id «Публикации пары» with «Архив».
    case 'myPosts': path = postId ? `/n/feed/post/${postId}` : '/n/me/posts'; break;
    case 'event': { const id = obj?.type === 'event' ? obj.id : d.eventId; if (isId(id)) path = `/n/events/${id}`; break; }
    case 'eventDraft': path = isId(d.draftId) ? `/n/events/new?draft=${d.draftId}` : '/n/me/events'; break;
    case 'eventApplications': { const id = obj?.type === 'event' ? obj.id : d.eventId; if (isId(id)) path = `/n/events/${id}/applications`; break; }
    case 'community': { const id = obj?.type === 'community' ? obj.id : d.communityId; if (isId(id)) path = `/n/communities/${id}`; break; }
    case 'communityRequests': { const id = obj?.type === 'community' ? obj.id : d.communityId; if (isId(id)) path = `/n/communities/${id}/requests`; break; }
    case 'chat': { const id = obj?.type === 'conversation' ? obj.id : d.conversationId; path = isId(id) ? `/n/chats/${id}` : '/n/chats'; break; }
    case 'actor': if (isId(n.actor)) path = `/n/people/${n.actor}`; break;
    case 'actorPrivate': if (isId(n.actor)) { path = `/n/people/${n.actor}`; q.part = 'private'; } break;
    case 'target': path = isId(d.target) ? `/n/people/${d.target}` : '/n/me'; break;
    case 'object': path = obj ? objectPath(obj.type, obj.id) : '/n/me'; break;
    case 'approval': { const id = obj?.type === 'approval' ? obj.id : d.approvalId; path = '/n/me/pair'; if (isId(id)) q.approval = id; break; }
    // The restore screen of that couple (by id), not whichever profile is active.
    case 'coupleRestore': { const c = n.couple ?? n.addressee; path = '/n/me/pair'; if (isId(c)) q.restore = c; break; }
    case 'coupleGallery': { const c = n.couple ?? n.addressee; if (isId(c)) path = `/n/people/${c}/gallery`; break; }
    case 'access': path = '/n/me/access'; q.tab = 'byme'; break;
    // That request by ID: «Доступы → Открыто» shows it first.
    case 'accessRequest': {
      const id = obj?.type === 'accessRequest' ? obj.id : d.requestId;
      path = '/n/me/access'; q.tab = 'byme'; if (isId(id)) q.request = id; break;
    }
    // The invitation's own card in «Нужно решить».
    case 'invite': {
      const id = obj?.type === 'invite' ? obj.id : d.inviteId;
      path = '/n/inbox'; q.tab = 'todo'; if (isId(id)) q.item = id; break;
    }
    // That link in «Мои связи» (a proposal to answer, or the link a result is about).
    case 'link': { const id = obj?.type === 'link' ? obj.id : d.linkId; path = '/n/me/links'; if (isId(id)) q.link = id; break; }
    case 'visibility': path = '/n/me'; q.layer = 'vis'; break;
    case 'help': path = '/n/help'; if (isId(d.ticketId)) q.ticket = d.ticketId; break;
    // A moderation decision opens its own card: what was decided, why, until when, «Обжаловать» (never other
    // reporters or the closed material). Without the row's id (an old push) the inbox.
    case 'moderation': if (isId(n.id)) path = `/n/inbox/${n.id}`; break;
    default: path = FIXED[kind] ?? null;
  }
  if (!path) path = FIXED[kind] ?? '/n/inbox';
  const as = isId(n.couple) ? n.couple : isId(n.addressee) ? n.addressee : null;
  if (as) q.as = as;
  const query = new URLSearchParams(q).toString();
  return query ? `${path}?${query}` : path;
}

// ---- the one rule for a route that came from outside (a push payload): public/fe-sw.js keeps the same lines ----

const U = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const ROUTE_PATH = new RegExp(`^/n/(?:inbox|inbox/${U}|chats|chats/requests|chats/${U}|me|me/pair|me/links|me/access|me/posts|me/interests`
  + `|settings|settings/(?:security|age|photo-check|blocked|notifications)|help|premium|staff|people|feed`
  + `|feed/post/${U}(?:/edit)?|events/new|me/events|events/${U}(?:/applications)?|communities/${U}(?:/requests)?|people/${U}(?:/gallery)?)$`);
export const ROUTE_QUERY = Object.freeze(/** @type {Record<string, RegExp>} */ ({
  reply: new RegExp(`^${U}$`), approval: new RegExp(`^${U}$`), ticket: new RegExp(`^${U}$`), as: new RegExp(`^${U}$`), restore: new RegExp(`^${U}$`),
  part: /^private$/, tab: /^(?:byme|withme|out|todo|all)$/, layer: /^(?:vis|priv|mine)$/,
  request: new RegExp(`^${U}$`), item: new RegExp(`^${U}$`), link: new RegExp(`^${U}$`), draft: new RegExp(`^${U}$`),
}));

/** Is this an app route a push may open: a known /n screen, UUIDs only, known query keys once each.
 * @param {unknown} route @returns {route is string} */
export function routeOk(route) {
  if (typeof route !== 'string' || route.length > 300) return false;
  const [path, query, ...rest] = route.split('?');
  if (rest.length || !ROUTE_PATH.test(path)) return false;
  if (query === undefined) return true;
  if (!query) return false;
  const seen = new Set();
  for (const pair of query.split('&')) {
    const [k, v, ...more] = pair.split('=');
    if (more.length || v === undefined || seen.has(k) || !Object.hasOwn(ROUTE_QUERY, k) || !ROUTE_QUERY[k].test(v)) return false;
    seen.add(k);
  }
  return true;
}

/** The push payload's `url` for a route (hash routes of the /n screens); the inbox when it does not pass.
 * @param {string} route */
export const pushUrl = route => '/#' + (routeOk(route) ? route : '/n/inbox');

// ---- push tags: one per object or collapse key, so a new push replaces only its own kind (public/fe-sw.js) ----

export const TAG = /^[a-z]{1,2}:[0-9a-zA-Z:._-]{1,120}$/;
/** @param {string} s */
const tagged = s => (TAG.test(s) ? s : null);
/** The tag of a chat's pushes. @param {string} conversationId */
export const chatTag = conversationId => `c:${conversationId}`;
/** The tag of a «Нужно решить» item's push. @param {string} kind @param {string} id */
export const decideTag = (kind, id) => `d:${kind}:${id}`;
/** The tag of a push (web push `tag`, Android notification tag): a chat, a task, a noisy type's one summary, the
 * notification's collapse key, its object, or the notification itself. Ids and catalog keys only. null: none fits.
 * @param {{key?: string | null, notificationId?: string | null, collapseKey?: string | null, object?: {type: string, id: string} | null,
 *   decide?: {kind: string, id: string} | null, conversationId?: string | null}} r @returns {string | null} */
export function pushTag(r) {
  if (r.conversationId && isId(r.conversationId)) return chatTag(r.conversationId);
  if (r.decide && isId(r.decide.id)) return tagged(decideTag(r.decide.kind, r.decide.id));
  const e = r.key ? CATALOG[r.key] : null;
  if (e?.push.noisy && r.key) return tagged(`s:${r.key.split('.')[0]}`);
  if (r.collapseKey) return tagged(`k:${r.collapseKey}`);
  if (r.object && isId(r.object.id)) return tagged(`o:${r.object.type}:${r.object.id}`);
  if (r.notificationId && isId(r.notificationId)) return `n:${r.notificationId}`;
  return null;
}

// ---- email words (server/email.mjs): the one template's chrome, the digest, the unsubscribe page ----

/** Russian plural: 1 решение, 2 решения, 5 решений. @param {number} n @param {readonly [string, string, string]} f */
export function ruPlural(n, f) {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? f[2] : b === 1 ? f[0] : b >= 2 && b <= 4 ? f[1] : f[2];
}

export const EMAIL_WORDS = Object.freeze({
  ru: {
    brand: 'KINHAZE', open: 'Открыть', digestSubject: 'Что нового в KINHAZE', digestOpen: 'Открыть KINHAZE',
    youHave: 'У тебя', and: 'и', more: 'И ещё {n} в приложении',
    tasks: /** @type {const} */ (['решение', 'решения', 'решений']),
    notes: /** @type {const} */ (['новое уведомление', 'новых уведомления', 'новых уведомлений']),
    chats: /** @type {const} */ (['непрочитанный чат', 'непрочитанных чата', 'непрочитанных чатов']),
    why: 'Это письмо пришло, потому что в KINHAZE включены уведомления на почту.',
    unsubscribe: 'Отписаться', settings: 'Настроить уведомления',
    unsubTitle: 'Отписаться от писем?', unsubText: 'Больше не присылать: {what}.', unsubButton: 'Отписаться',
    unsubDone: 'Готово. Письма «{what}» больше не придут. Включить их снова можно в настройках уведомлений.',
    unsubBad: 'Ссылка не подходит. Настроить письма можно в приложении: Настройки → Уведомления.',
    what: {
      all: 'все письма KINHAZE', digest: 'сводка', messages: 'Сообщения', match: 'Совпадения', likes: 'Симпатии', req: 'Запросы на переписку',
      decide: 'Решения', pair: 'Пара', events: 'События', replies: 'Ответы и реакции', follows: 'Подписчики', groups: 'Сообщества', news: 'Новости KINHAZE',
    },
  },
  en: {
    brand: 'KINHAZE', open: 'Open', digestSubject: 'What’s new on KINHAZE', digestOpen: 'Open KINHAZE',
    youHave: 'You have', and: 'and', more: 'And {n} more in the app',
    tasks: /** @type {const} */ (['decision', 'decisions', 'decisions']),
    notes: /** @type {const} */ (['new notification', 'new notifications', 'new notifications']),
    chats: /** @type {const} */ (['unread chat', 'unread chats', 'unread chats']),
    why: 'You get this email because email notifications are on in KINHAZE.',
    unsubscribe: 'Unsubscribe', settings: 'Notification settings',
    unsubTitle: 'Unsubscribe?', unsubText: 'Stop sending: {what}.', unsubButton: 'Unsubscribe',
    unsubDone: 'Done. You won’t get “{what}” emails any more. You can turn them back on in notification settings.',
    unsubBad: 'This link doesn’t work. You can change emails in the app: Settings → Notifications.',
    what: {
      all: 'all KINHAZE emails', digest: 'the digest', messages: 'Messages', match: 'Matches', likes: 'Likes', req: 'Message requests',
      decide: 'Decisions', pair: 'Couple', events: 'Events', replies: 'Replies and reactions', follows: 'Followers', groups: 'Communities', news: 'KINHAZE news',
    },
  },
});
