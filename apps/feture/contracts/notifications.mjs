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
/** @typedef {'messages' | 'likes' | 'match' | 'decide' | 'requests' | 'events' | 'replies' | 'follows' | 'groups' | 'security' | 'other'} PushCat */
/**
 * @typedef {{
 *   kind: RecordKind, filter: Filter, icon: string, tone: '' | 'l' | 'g' | 'v', card: Card,
 *   text: Text, alone?: Text,
 *   push: {cat: PushCat, safe: Text, normal: Text, named: boolean},
 *   email: Email, subject: Text, dest: string, collapse: Collapse, gone: Text,
 * }} Entry
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
/** Settings category of each push category (V21 K05); the rest follow only the global switch. */
export const PUSH_SETTING = Object.freeze({ likes: 'likes', match: 'match', decide: 'req', requests: 'req', events: 'events', replies: 'replies', follows: 'follows', groups: 'groups' });
export const PUSH_CATS = /** @type {const} */ (['messages', 'likes', 'match', 'decide', 'requests', 'events', 'replies', 'follows', 'groups', 'security', 'other']);
/** Inbox filters in chip order (V21 inboxKind). */
export const FILTERS = /** @type {const} */ (['access', 'likes', 'matches', 'replies', 'events', 'groups', 'pair', 'follows', 'links', 'posts', 'other']);
export const CARDS = /** @type {const} */ (['news', 'decision', 'result', 'safety', 'event', 'summary']);
export const EMAILS = /** @type {const} */ (['none', 'now', 'now-if-unread', 'digest']);
/** «Нужно решить» kinds (server/commands/inbox.mjs decisions()); their entries are `decide.<kind>`. */
export const DECIDE_KINDS = /** @type {const} */ (['pinv', 'req', 'capp', 'eapp', 'link', 'linkChange', 'tag', 'joint', 'jointReturned']);

/** Raw entries. A key `type.sub` takes everything from `type` and changes what it names. Defaults: a notice, card
 * «news», filter «other», email in the digest, push category «other» with no name, no collapse, «Больше недоступно». */
const RAW = /** @type {Record<string, any>} */ ({
  // ---- people ----
  like: { filter: 'likes', icon: 'Heart', tone: 'l', text: T(['{name} ставит тебе симпатию', '{name} ставят тебе симпатию'], '{name} liked you'),
    cat: 'likes', normal: T('Новая симпатия', 'New like'), named: true, dest: 'actor', collapse: 'type', gone: GONE_PROFILE },
  match: { filter: 'matches', icon: 'Heart', tone: 'l', text: T('{name} — это взаимно! Можно написать', '{name} — it’s mutual! You can chat now'),
    cat: 'match', normal: T('Новое совпадение', 'New match'), named: true, dest: 'chat', collapse: 'object', gone: GONE_CHAT },
  chatRequest: { filter: 'matches', icon: 'MessageCircle', tone: 'v', text: T(['{name} хочет начать переписку', '{name} хотят начать переписку'], '{name} wants to start a conversation'),
    cat: 'requests', normal: T('Новый запрос на переписку', 'New message request'), named: true, dest: 'chat', collapse: 'object', gone: GONE_CHAT },
  follow: { filter: 'follows', icon: 'Users', tone: 'v', text: T(['{name} подписывается на тебя', '{name} подписываются на тебя'], '{name} followed you'),
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
  postLike: { filter: 'posts', icon: 'Heart', tone: 'l', text: T(['{name} ставит лайк твоей публикации', '{name} ставят лайк твоей публикации'], '{name} liked your post'),
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
  revisionApproved: { kind: 'result', filter: 'posts', icon: 'Check', tone: 'g', card: 'result', text: T('Правка прошла проверку и видна в ленте', 'Your edit passed review and is in the feed'),
    normal: T('Правка прошла проверку', 'Your edit passed review'), dest: 'post', gone: GONE_POST },
  revisionRejected: { kind: 'result', filter: 'posts', icon: 'Shield', tone: 'l', card: 'result', text: T('Правка не прошла проверку', 'Your edit didn’t pass review'),
    normal: T('Правка не прошла проверку', 'Your edit didn’t pass review'), dest: 'post', gone: GONE_POST },
  postReturned: { kind: 'result', filter: 'posts', icon: 'TriangleAlert', tone: 'l', card: 'result', text: T('Публикация вернулась с проверки — посмотри, что поправить', 'Your post came back from review — see what to fix'),
    normal: T('Публикация вернулась с проверки', 'Your post came back from review'), dest: 'postEdit', gone: GONE_POST },
  mediaDecided: { kind: 'result', filter: 'posts', icon: 'Image', tone: 'g', card: 'summary', text: T('Файл проверен', 'Your file was reviewed'),
    normal: T('Файл проверен', 'Your file was reviewed'), dest: 'object', collapse: 'type' },
  'mediaDecided.approved': { text: T('Файл одобрен', 'Your file was approved'), normal: T('Файл одобрен', 'Your file was approved') },
  'mediaDecided.rejected': { icon: 'Shield', tone: 'l', text: T('Файл не прошёл проверку', 'Your file didn’t pass review'), normal: T('Файл не прошёл проверку', 'Your file didn’t pass review') },

  // ---- moderation decisions about the person: their own decision card (src/fe/inbox.tsx NoteScreen) ----
  contentRemoved: { kind: 'result', filter: 'posts', icon: 'Shield', tone: 'l', card: 'safety', text: T('Модераторы удалили твою публикацию', 'Moderators removed your post'),
    normal: T('Модераторы удалили твой материал', 'Moderators removed your content'), email: 'now', dest: 'moderation' },
  'contentRemoved.reply': { text: T('Модераторы удалили твой ответ', 'Moderators removed your reply') },
  'contentRemoved.community': { text: T('Модераторы скрыли твоё сообщество', 'Moderators hid your community') },
  'contentRemoved.event': { text: T('Модераторы скрыли твоё событие', 'Moderators hid your event') },
  reportResolved: { kind: 'result', filter: 'posts', icon: 'Shield', tone: 'g', card: 'result', text: T('Жалоба рассмотрена. Спасибо, что сообщаешь', 'Report reviewed. Thanks for reporting'),
    normal: T('Жалоба рассмотрена', 'Your report was reviewed'), dest: 'moderation' },
  profileSuspended: { filter: 'other', icon: 'Shield', tone: 'l', card: 'safety', text: T('Профиль заблокирован', 'Your profile is suspended'),
    normal: T('Профиль заблокирован', 'Your profile is suspended'), email: 'now', dest: 'moderation' },
  'profileSuspended.until': { text: T('Профиль заблокирован до {date}', 'Your profile is suspended until {date}') },
  'profileSuspended.forever': { text: T('Профиль заблокирован, пока модераторы не снимут блокировку', 'Your profile is suspended until moderators lift it') },
  profileRestricted: { filter: 'other', icon: 'Shield', tone: 'l', card: 'safety', text: T('Профиль ограничен', 'Your profile is restricted'),
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
  communityClosed: { filter: 'groups', icon: 'Users', tone: '', text: T('Сообщество закрыто', 'The community was closed'),
    cat: 'groups', normal: T('Сообщество закрыто', 'The community was closed'), dest: 'community', gone: T('Сообщество закрыто', 'The community was closed') },
  discussionRemoved: { filter: 'groups', icon: 'Trash2', tone: 'l', card: 'safety', text: T('Ведущие убрали твоё обсуждение', 'Hosts removed your discussion'),
    cat: 'groups', normal: T('Ведущие убрали твоё обсуждение', 'Hosts removed your discussion'), dest: 'community', gone: GONE_COMMUNITY },

  // ---- events ----
  eventPublished: { kind: 'result', filter: 'events', icon: 'Check', tone: 'g', card: 'result', text: T('Твоё событие опубликовано', 'Your event is live'),
    cat: 'events', normal: T('Событие опубликовано', 'Your event is live'), dest: 'event', gone: GONE_EVENT },
  'eventPublished.change': { text: T('Правки события приняты', 'Event changes accepted'), normal: T('Правки события приняты', 'Event changes accepted') },
  eventRejected: { kind: 'result', filter: 'events', icon: 'Shield', tone: 'l', card: 'result', text: T('Событие не прошло проверку', 'The event didn’t pass review'),
    cat: 'events', normal: T('Событие не прошло проверку', 'The event didn’t pass review'), dest: 'event', gone: GONE_EVENT },
  'eventRejected.change': { text: T('Правки события не приняты', 'Event changes not accepted'), normal: T('Правки события не приняты', 'Event changes not accepted') },
  eventHidden: { filter: 'events', icon: 'EyeOff', tone: 'l', card: 'safety', text: T('Модераторы скрыли событие', 'Moderators hid the event'),
    cat: 'events', normal: T('Модераторы скрыли событие', 'Moderators hid the event'), email: 'now', dest: 'event', gone: GONE_EVENT },
  eventApplicationApproved: { kind: 'result', filter: 'events', icon: 'Check', tone: 'g', card: 'result', text: T('Заявку на событие одобрили — адрес и детали открыты', 'Your event application is approved — address and details are open'),
    cat: 'events', normal: T('Заявку на событие одобрили', 'Your event application is approved'), email: 'now-if-unread', dest: 'event', gone: GONE_EVENT },
  eventApplicationDeclined: { kind: 'result', filter: 'events', icon: 'Calendar', tone: '', card: 'result', text: T('Заявку на событие отклонили', 'Your event application was declined'),
    cat: 'events', normal: T('Заявку на событие отклонили', 'Your event application was declined'), email: 'now-if-unread', dest: 'event', gone: GONE_EVENT },
  eventCancelled: { filter: 'events', icon: 'CalendarX', tone: 'l', card: 'event', text: T('Событие отменено', 'The event was cancelled'),
    cat: 'events', normal: T('Событие отменено', 'The event was cancelled'), email: 'now-if-unread', dest: 'event', collapse: 'object', gone: T('Событие отменено', 'The event was cancelled') },
  eventChanged: { filter: 'events', icon: 'CalendarClock', tone: 'v', card: 'event', text: T('В событии изменились детали', 'The event details changed'),
    cat: 'events', normal: T('В событии изменились детали', 'The event details changed'), email: 'now-if-unread', dest: 'event', collapse: 'object', gone: GONE_EVENT },
  eventAnnouncement: { filter: 'events', icon: 'Megaphone', tone: 'v', card: 'event', text: T('Новое объявление в событии', 'A new announcement in the event'),
    cat: 'events', normal: T('Новое объявление в событии', 'A new announcement in the event'), dest: 'event', gone: GONE_EVENT },
  eventReminder: { filter: 'events', icon: 'AlarmClock', tone: 'v', card: 'event', text: T('Скоро событие', 'An event starts soon'),
    cat: 'events', normal: T('Скоро событие', 'An event starts soon'), email: 'none', dest: 'event', collapse: 'object', gone: GONE_EVENT },

  // ---- couple (addressed to the couple; {couple} is its name at the time) ----
  'pair.created': { filter: 'pair', icon: 'Users', tone: 'v', text: T('{couple} · Пара создана', '{couple} · Your couple is set up'),
    normal: T('Пара создана', 'Your couple is set up'), dest: 'couple', gone: GONE_PAIR },
  'pair.declined': { kind: 'result', filter: 'pair', icon: 'Users', tone: '', card: 'result', text: T('Приглашение в пару отклонили', 'Your couple invitation was declined'),
    normal: T('Приглашение в пару отклонили', 'Your couple invitation was declined'), dest: 'couple' },
  'pair.deleted': { filter: 'pair', icon: 'Users', tone: '', text: T('{couple} · Пара удалена', '{couple} · The couple was deleted'),
    normal: T('Пара удалена', 'The couple was deleted'), email: 'now-if-unread', dest: 'couple', gone: GONE_PAIR },
  'pair.stopped': { filter: 'pair', icon: 'Users', tone: '', text: T('{couple} · Пара остановлена', '{couple} · The couple was stopped'),
    normal: T('Пара остановлена', 'The couple was stopped'), email: 'now-if-unread', dest: 'couple', gone: GONE_PAIR },
  'pair.restored': { filter: 'pair', icon: 'Users', tone: 'g', text: T('{couple} · Пара восстановлена', '{couple} · The couple was restored'),
    normal: T('Пара восстановлена', 'The couple was restored'), dest: 'couple', gone: GONE_PAIR },
  'pair.restoreRequested': { filter: 'pair', icon: 'Users', tone: 'v', text: T('{couple} · Партнёр хочет восстановить пару', '{couple} · Your partner wants to restore the couple'),
    normal: T('Партнёр хочет восстановить пару', 'Your partner wants to restore the couple'), email: 'now-if-unread', dest: 'couple', gone: GONE_PAIR },
  'pair.narrowed': { filter: 'pair', icon: 'Users', tone: 'v', text: T('{couple} · Партнёр сузил видимость пары', '{couple} · Your partner narrowed the couple’s visibility'),
    normal: T('Партнёр сузил видимость пары', 'Your partner narrowed the couple’s visibility'), dest: 'couple', gone: GONE_PAIR },
  'pair.trust': { filter: 'pair', icon: 'Users', tone: 'v', text: T('{couple} · Изменилось согласие партнёра', '{couple} · Partner approval changed'),
    normal: T('Изменилось согласие партнёра', 'Partner approval changed'), dest: 'couple', gone: GONE_PAIR },
  'pair.trust.on': { text: T('{couple} · Партнёр теперь подтверждает твои изменения пары', '{couple} · Your partner now approves your couple changes') },
  'pair.trust.off': { text: T('{couple} · Партнёр доверяет: твои изменения пары применяются сразу', '{couple} · Your partner trusts you: your couple changes apply at once') },
  'pair.decided': { kind: 'result', filter: 'pair', icon: 'Users', tone: 'v', card: 'result', text: T('{couple} · Партнёр ответил на изменение', '{couple} · Your partner answered a change'),
    normal: T('Партнёр ответил на изменение', 'Your partner answered a change'), dest: 'approval', gone: GONE_PAIR },
  'pair.decided.approved': { tone: 'g', text: T('{couple} · Партнёр согласился', '{couple} · Your partner agreed'), normal: T('Партнёр согласился', 'Your partner agreed') },
  'pair.decided.cancelled': { tone: '', text: T('{couple} · Изменение отменено', '{couple} · The change was cancelled'), normal: T('Изменение отменено', 'The change was cancelled') },
  'pair.decided.expired': { tone: '', text: T('{couple} · Срок согласия истёк', '{couple} · The approval expired'), normal: T('Срок согласия истёк', 'The approval expired') },
  // A partner's action for the couple: in the couple's history, never by email (owner 03.11.2026).
  'pair.acted': { filter: 'pair', icon: 'Users', tone: 'v', text: T('{couple} · Партнёр сделал действие от пары', '{couple} · Your partner acted for the couple'),
    normal: T('Партнёр сделал действие от пары', 'Your partner acted for the couple'), email: 'none', dest: 'couple', collapse: 'type', gone: GONE_PAIR },
  'pair.acted.follow': { text: T('{couple} · Партнёр подписался от пары', '{couple} · Your partner followed someone for the couple'), dest: 'couple' },
  'pair.acted.photos': { text: T('{couple} · Партнёр добавил фото пары', '{couple} · Your partner added couple photos'), dest: 'coupleGallery' },
  'pair.acted.album': { text: T('{couple} · Партнёр изменил альбом пары', '{couple} · Your partner changed the couple’s album'), dest: 'coupleGallery' },
  'pair.acted.post': { text: T('{couple} · Партнёр опубликовал от пары', '{couple} · Your partner posted for the couple'), dest: 'myPosts' },
  'pair.acted.post_archived': { text: T('{couple} · Партнёр убрал публикацию пары в архив', '{couple} · Your partner archived a couple post'), dest: 'myPosts' },
  'pair.acted.chatRequest': { text: T('{couple} · Партнёр отправил запрос на переписку от пары', '{couple} · Your partner sent a chat request for the couple'), dest: 'chats' },
  'pair.acted.like': { text: T('{couple} · Партнёр лайкнул профиль от пары', '{couple} · Your partner liked a profile for the couple'), dest: 'target' },
  'pair.acted.location': { text: T('{couple} · Партнёр изменил город пары', '{couple} · Your partner changed the couple’s city'), dest: 'couple' },
  'pair.acted.block': { text: T('{couple} · Партнёр заблокировал профиль от пары', '{couple} · Your partner blocked a profile for the couple'), dest: 'blocked' },
  'pair.acted.link': { text: T('{couple} · Партнёр связал профиль с парой', '{couple} · Your partner linked a profile to the couple'), dest: 'links' },
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
  placeDecided: { kind: 'result', filter: 'other', icon: 'MapPin', tone: 'g', card: 'result', text: T('Предложенный тобой город рассмотрен', 'The city you proposed was reviewed'),
    normal: T('Город рассмотрен', 'Your city was reviewed'), dest: 'me' },
  'placeDecided.approved': { text: T('Предложенный тобой город добавлен — теперь его можно выбрать', 'The city you proposed was added — you can choose it now') },
  'placeDecided.rejected': { tone: '', text: T('Предложенный тобой город не добавлен', 'The city you proposed was not added') },
  premiumGranted: { filter: 'other', icon: 'Crown', tone: 'g', text: T('Тебе открыт Premium до {date}', 'Premium is on for you until {date}'),
    normal: T('Тебе открыт Premium', 'Premium is on for you'), email: 'now', dest: 'premium' },
  premiumRevoked: { filter: 'other', icon: 'Crown', tone: '', text: T('Premium отключён', 'Premium was turned off'),
    normal: T('Premium отключён', 'Premium was turned off'), email: 'now', dest: 'premium' },
  premiumGift: { filter: 'other', icon: 'Crown', tone: 'l', text: T(['{name} дарит тебе Premium', '{name} дарят тебе Premium'], '{name} gifts you Premium'),
    alone: T('Тебе подарили Premium', 'You’ve been gifted Premium'), normal: T('Тебе подарили Premium', 'You’ve been gifted Premium'), named: true, email: 'now', dest: 'premium' },
  staffRole: { filter: 'other', icon: 'ShieldCheck', tone: 'v', text: T('Изменилась твоя роль', 'Your role changed'),
    normal: T('Изменилась твоя роль', 'Your role changed'), dest: 'me' },
  'staffRole.grant': { text: T('Тебе выдана роль: {role}', 'You were given a role: {role}'), dest: 'staff' },
  'staffRole.revoke': { tone: '', text: T('Роль снята: {role}', 'A role was taken away: {role}') },
  // Staff alerts: the row's words come from the kind of alert (src/fe/note-status.ts, fe.ibx.staff.*).
  staffAlert: { filter: 'other', icon: 'ShieldAlert', tone: 'l', card: 'safety', text: T('Срочное в модерации', 'Urgent in moderation'),
    normal: T('Срочное в модерации', 'Urgent in moderation'), email: 'now-if-unread', dest: 'staff', collapse: 'type' },
  signinNew: { filter: 'other', icon: 'ShieldAlert', tone: 'l', card: 'safety', text: T('Вход с нового устройства', 'New device signed in'),
    cat: 'security', safe: T('Вход с нового устройства', 'New device signed in'), normal: T('Вход с нового устройства', 'New device signed in'), email: 'now', dest: 'security' },
  supportReply: { filter: 'other', icon: 'LifeBuoy', tone: 'v', text: T('Поддержка ответила на твоё обращение', 'Support answered your request'),
    normal: T('Поддержка ответила', 'Support answered'), email: 'now-if-unread', dest: 'help' },
  datingLaunched: { filter: 'other', icon: 'Heart', tone: 'v', text: T('Знакомства открылись — можно смотреть анкеты', 'Discover is open — you can look at profiles now'),
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
  'decide.joint': { kind: 'task', card: 'decision', filter: 'pair', icon: 'Clock', tone: '', text: T('Партнёр: изменение на подтверждение', 'Partner: a change to approve'),
    cat: 'decide', normal: T('Партнёр ждёт твоего согласия', 'Your partner waits for your approval'), email: 'now-if-unread', dest: 'approval', gone: GONE_PAIR },
  'decide.jointReturned': { kind: 'task', card: 'decision', filter: 'pair', icon: 'Pencil', tone: '', text: T('Изменение вернули на доработку', 'A change was sent back'),
    cat: 'decide', normal: T('Изменение вернули на доработку', 'A change was sent back'), email: 'now-if-unread', dest: 'approval', gone: GONE_PAIR },
});

/** Which data field picks a subtype of a type (`type.sub` in the catalog). */
const SUB = /** @type {Record<string, (d: Record<string, any>) => unknown>} */ ({
  communityMember: d => d.change,
  'pair.acted': d => d.what,
  'pair.decided': d => d.state,
  'pair.trust': d => (d.approves === true ? 'on' : d.approves === false ? 'off' : undefined),
  linkChanged: d => d.answer,
  tagAnswered: d => d.answer,
  ageCheck: d => (d.state === 'approved' ? 'approved' : 'other'),
  photoCheck: d => (d.state === 'approved' ? 'approved' : 'other'),
  mediaDecided: d => (d.state === 'approved' ? 'approved' : 'rejected'),
  placeDecided: d => (d.state === 'approved' ? 'approved' : 'rejected'),
  disputeResolved: d => (d.outcome === 'removed' ? 'removed' : d.outcome === 'restored' ? 'restored' : undefined),
  appealDecided: d => (d.state === 'granted' ? 'granted' : d.state === 'denied' ? 'denied' : undefined),
  staffRole: d => (d.grant === true ? 'grant' : d.grant === false ? 'revoke' : undefined),
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
  // A partner approval's own words per kind of change (`decide.joint.<kind>`), when the catalog has them.
  'decide.joint': d => d.kind,
  'decide.jointReturned': d => d.kind,
});

/** @param {any} o @returns {Entry} */
function build(o) {
  return Object.freeze({
    kind: o.kind ?? 'notice', filter: o.filter ?? 'other', icon: o.icon ?? 'Bell', tone: o.tone ?? '', card: o.card ?? 'news',
    text: o.text, ...(o.alone ? { alone: o.alone } : {}),
    push: Object.freeze({ cat: o.cat ?? 'other', safe: o.safe ?? SAFE_PUSH, normal: o.normal, named: !!o.named }),
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
  access: '/n/me/access', visibility: '/n/me', accessRequest: '/n/me/access', invite: '/n/inbox', link: '/n/me/links', moderation: '/n/inbox',
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
    case 'event': { const id = obj?.type === 'event' ? obj.id : d.eventId; if (isId(id)) path = `/n/events/${id}`; break; }
    case 'eventApplications': { const id = obj?.type === 'event' ? obj.id : d.eventId; if (isId(id)) path = `/n/events/${id}/applications`; break; }
    case 'community': { const id = obj?.type === 'community' ? obj.id : d.communityId; if (isId(id)) path = `/n/communities/${id}`; break; }
    case 'communityRequests': { const id = obj?.type === 'community' ? obj.id : d.communityId; if (isId(id)) path = `/n/communities/${id}/requests`; break; }
    case 'chat': { const id = obj?.type === 'conversation' ? obj.id : d.conversationId; path = isId(id) ? `/n/chats/${id}` : '/n/chats'; break; }
    case 'actor': if (isId(n.actor)) path = `/n/people/${n.actor}`; break;
    case 'actorPrivate': if (isId(n.actor)) { path = `/n/people/${n.actor}`; q.part = 'private'; } break;
    case 'target': path = isId(d.target) ? `/n/people/${d.target}` : '/n/me'; break;
    case 'object': path = obj ? objectPath(obj.type, obj.id) : '/n/me'; break;
    case 'approval': { const id = obj?.type === 'approval' ? obj.id : d.approvalId; path = '/n/me/pair'; if (isId(id)) q.approval = id; break; }
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
  + `|feed/post/${U}(?:/edit)?|events/${U}(?:/applications)?|communities/${U}(?:/requests)?|people/${U}(?:/gallery)?)$`);
export const ROUTE_QUERY = Object.freeze(/** @type {Record<string, RegExp>} */ ({
  reply: new RegExp(`^${U}$`), approval: new RegExp(`^${U}$`), ticket: new RegExp(`^${U}$`), as: new RegExp(`^${U}$`),
  part: /^private$/, tab: /^(?:byme|withme|out|todo|all)$/, layer: /^(?:vis|priv|mine)$/,
  request: new RegExp(`^${U}$`), item: new RegExp(`^${U}$`), link: new RegExp(`^${U}$`),
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
