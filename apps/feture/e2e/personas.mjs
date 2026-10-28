// FetUre e2e personas (owner, 28.10.2026): every scenario runs as a known account state, and every lane (an agent, an
// area) has its own accounts, so runners never share sessions, daily limits, requests or links.
//   const p = await persona('feed', 'full')   → { email, handle, kind, personId, … }
// Kinds (see e2e/README.md for the table):
//   new        signed in, no FetUre account yet (registration screens) — a fresh one each call
//   temp       registered, hidden, nothing else — a fresh one each call (someone whose «no» starts a cooldown)
//   owner      temp + a private part open to requests — a fresh one each call (to decline a request: 30-day cooldown)
//   basic      registered, onboarding done, hidden from Discover, no photo, no interests
//   full       basic + visible in Discover, an approved profile photo, age verified, public interests, a private text
//   pair       two `full` people (…-pa, …-pb) in an active couple; returns the first, with `partner` and `coupleId`
//   asker      a `full` person (age verified) who asks others for their private part (asker2, asker3: the same,
//              taking over when `asker` has used up its 10 requests a day)
//   mate       a `full` person who talks with `chats` (text both ways) and sends it photos
//   chats      a `full` person with conversations: `mate`, `asker`, `basic` (each has messages)
//   host       a `full` person who owns two published communities (open and closed with a question) and a
//              published open offline event; creation goes through review by STAFF
//   stranger   a `basic` person for short-lived contacts (a match that is ended, a block that is undone)
//   inviter, invitee   two `basic` people for the couple flow (free of couples between runs)
//   staff      the shared qa moderator (STAFF) — only for staff screens and review steps; its second factor (TOTP) is
//              enrolled on first use and a code is entered whenever needed (lib.mjs staffFactor)
//   staff2     a second staff account (STAFF2, moderator) whose factor scenarios reset and enrol again on the screen
// Building is idempotent: a second call only adds what is missing (fresh kinds excepted). Staff steps (approving
// photos, the age check, communities and events) are done by STAFF, which holds the moderator role on production
// (granted once by the owner's session). Never edit an account in the database: every state comes from app commands.
import { PROD, api, boot, post, session, staffFactor, uploadFixture, uuid7, sleep } from './lib.mjs';

export const STAFF = 'qa-staff@feture.test';
export const STAFF2 = 'qa-staff2@feture.test';
const mail = (lane, kind) => `qa-${lane}-${kind}@feture.test`;
const handleOf = (lane, kind) => `qa_${lane}_${kind}`.slice(0, 20);
const must = (r, what) => { if (r.status && r.status >= 400) throw new Error(`${what}: ${r.status} ${JSON.stringify(r).slice(0, 300)}`); return r; };
const FULL = new Set(['full', 'pa', 'pb', 'asker', 'asker2', 'asker3', 'mate', 'chats', 'host']);
const BASIC = new Set(['basic', 'stranger', 'inviter', 'invitee']);
export const KINDS = ['new', 'temp', 'owner', ...BASIC, ...FULL, 'pair', 'staff', 'staff2'];

let docs;
async function documents() {
  if (docs) return docs;
  const r = await fetch(`${PROD}/api/catalog?resource=documents&locale=ru`, { cache: 'no-store' }).then(x => x.json());
  return (docs = r.documents.filter(d => d.requiresAccept).map(d => ({ id: d.id, contentHash: d.hash })));
}

async function registered(email, handle, discover) {
  let b = await boot(email);
  if (!b.profiles?.some(p => p.kind === 'person')) {
    must(await api(email, 'account.create', { opId: uuid7(), handle, birthDate: '1992-05-14', locale: 'ru', documents: await documents(), newsOptIn: false }), 'account.create ' + email);
    b = await boot(email);
  }
  if (!b.account?.onboarded) {
    must(await api(email, 'onboarding.complete', { opId: uuid7(), detailsVis: 'all', genders: [], orients: [], roles: [], formats: [], seeks: [], status: null, discover }), 'onboarding ' + email);
    b = await boot(email);
  }
  return b;
}

async function approvePhoto(email, s) {
  const prof = (await api(email, 'profile.get', { profileId: s.personId })).profile;
  if (prof?.photos?.some(p => !p.pending)) return;
  const asset = await uploadFixture(email, 'avatar');
  must(await api(email, 'profile.photosSet', { opId: uuid7(), assetIds: [asset] }), 'photosSet');
  await staff();
  for (let i = 0; i < 20; i++) { // the scan job runs first; the asset then shows up in the queue
    const r = await api(STAFF, 'staff.mediaDecide', { opId: uuid7(), assetId: asset, decision: 'approve', explicit: false });
    if (r.status === 200) return;
    await sleep(3000);
  }
  throw new Error('photo approval for ' + email + ' did not go through');
}

async function verifyAge(email) {
  const st = await api(email, 'verification.ageStatus');
  if (st.verified || st.state === 'approved' || st.ageVerified) return;
  const decide = async checkId => {
    await staff(); let d;
    // The selfie is scanned first (a job); until then the check has no picture to compare.
    for (let i = 0; i < 20; i++) { d = await api(STAFF, 'staff.ageCheckDecide', { opId: uuid7(), checkId, approve: true }); if (d.rule !== 'selfie_missing') break; await sleep(6000); }
    must(d, 'ageCheckDecide');
  };
  if (st.check?.state === 'submitted') return decide(st.check.id);
  // The approved photo becomes the avatar through a background job (about a minute); the age check needs it.
  const pid = (await session(email)).personId;
  for (let i = 0; i < 18; i++) { const pr = (await api(email, 'profile.get', { profileId: pid })).profile; if (pr?.avatar) break; await sleep(10000); }
  const start = must(await api(email, 'verification.ageStart', { opId: uuid7() }), 'ageStart');
  const asset = await uploadFixture(email, 'verification');
  must(await api(email, 'verification.ageSubmit', { opId: uuid7(), checkId: start.id, assetId: asset }), 'ageSubmit');
  await decide(start.id);
}

async function interests(email) {
  const have = (await api(email, 'interests.list', { profileId: (await session(email)).personId })).items ?? [];
  for (const [topicId, value] of [['aftercare', 8], ['bondage', 6], ['roleplay', 5]]) {
    if (have.some(i => i.topicId === topicId)) continue;
    await api(email, 'interests.set', { opId: uuid7(), topicId, vis: 'public', value, dir: ['give', 'get', 'watch'] });
  }
}

/** A private part others can ask for: on, a text, requests from everybody. */
async function privatePart(email) {
  const s = await session(email);
  const p = await api(email, 'private.get', { profileId: s.personId });
  if (!p.text) must(await api(email, 'private.setText', { opId: uuid7(), text: 'Приватная часть тестового человека: о границах и ожиданиях.' }), 'private.setText');
  const st = (await api(email, 'profile.settings', {})).settings ?? {};
  if (st.privateOn === false) must(await api(email, 'private.setOn', { opId: uuid7(), on: true }), 'private.setOn');
  if (st.requestsFrom && st.requestsFrom !== 'all') must(await api(email, 'profile.setVisibility', { opId: uuid7(), setting: 'requestsFrom', value: 'all' }), 'requestsFrom');
}

/** `a` and `b` (persona objects) have a conversation with at least one message from each side. */
async function conversation(a, b) {
  const find = async () => (await api(a.email, 'chats.list', { filter: 'all', archived: false })).items?.find(c => c.other?.id === b.personId && c.state !== 'ended');
  let c = await find();
  if (!c) {
    await api(a.email, 'block.set', { opId: uuid7(), profileId: b.personId, on: false });
    await api(b.email, 'block.set', { opId: uuid7(), profileId: a.personId, on: false });
    const archived = (await api(a.email, 'chats.list', { filter: 'all', archived: true })).items?.find(x => x.other?.id === b.personId && x.state !== 'ended');
    if (archived) { await api(a.email, 'chat.archive', { conversationId: archived.id, on: false }); c = archived; }
    else {
      await api(a.email, 'like.send', { opId: uuid7(), profileId: b.personId, source: 'profile' });
      const r = await api(b.email, 'like.send', { opId: uuid7(), profileId: a.personId, source: 'profile' });
      c = r.conversationId ? { id: r.conversationId } : await find();
      if (!c) throw new Error(`no conversation ${a.kind} ↔ ${b.kind}: ${JSON.stringify(r)}`);
    }
  }
  const msgs = (await api(a.email, 'chat.messages', { conversationId: c.id })).items ?? [];
  if (!msgs.some(m => m.mine && m.body)) must(await api(a.email, 'chat.send', { opId: uuid7(), conversationId: c.id, body: 'Привет! Рада знакомству.' }), 'chat.send');
  if (!msgs.some(m => !m.mine && m.body && !m.system)) must(await api(b.email, 'chat.send', { opId: uuid7(), conversationId: c.id, body: 'Привет, взаимно! Как дела?' }), 'chat.send back');
  return c.id;
}

/** Staff approves a community or event that waits for review (the decision is on the current rev). */
async function approveCommunity(id) {
  await staff();
  for (let i = 0; i < 5; i++) {
    const c = (await api(STAFF, 'community.get', { communityId: id })).community;
    if (c?.state === 'published' && !c.pendingChange) return;
    const d = await api(STAFF, 'staff.communityDecide', { opId: uuid7(), communityId: id, rev: c?.rev ?? 1, decision: 'approve' });
    if (d.status === 200) return;
    await sleep(2000);
  }
  throw new Error('community ' + id + ' not approved');
}

async function hostSetup(lane, email) {
  const plain = { name: `QA ${lane} открытое`, privacy: 'open', joinQuestion: null };
  const closed = { name: `QA ${lane} клуб`, privacy: 'closed', joinQuestion: 'Почему хочешь вступить?' };
  // For the join scenarios (communities/joins.mjs): closed without a question, and hidden (reached by an invite link).
  const noQ = { name: `QA ${lane} без вопроса`, privacy: 'closed', joinQuestion: null };
  const hidden = { name: `QA ${lane} скрытое`, privacy: 'hidden', joinQuestion: 'Кто тебя пригласил?' };
  const out = {};
  for (const [key, want] of [['openId', plain], ['closedId', closed], ['closedNoQId', noQ], ['hiddenId', hidden]]) {
    const mine = (await api(email, 'community.mine', {})).hosting ?? [];
    let c = mine.find(x => x.name === want.name && x.role === 'owner');
    if (!c) {
      const r = must(await api(email, 'community.create', {
        opId: uuid7(), name: want.name, privacy: want.privacy, ...(want.joinQuestion ? { joinQuestion: want.joinQuestion } : {}),
        description: 'Сообщество для сценариев FetUre: здесь проверяют вступление, заявки и обсуждения.', topics: ['bondage'],
        rules: ['Уважай границы', 'Без фото без согласия'], plate: 'lilac' }), 'community.create ' + want.name);
      c = { id: r.id, state: r.state };
    }
    const full = (await api(email, 'community.get', { communityId: c.id })).community;
    if (full.state !== 'published' || full.pendingChange) await approveCommunity(c.id);
    if (full.privacy !== want.privacy) {
      must(await api(email, 'community.update', { opId: uuid7(), communityId: c.id, rev: full.rev, privacy: want.privacy, ...(want.privacy === 'open' || !want.joinQuestion ? {} : { joinQuestion: want.joinQuestion }) }), 'privacy back');
      await approveCommunity(c.id);
    }
    out[key] = c.id;
  }
  // One published open offline event far enough ahead (and one with tickets on the organizer's site); a cancelled or
  // past one is replaced.
  out.eventId = await hostEvent(email, `QA ${lane} встреча`, { kind: 'free' });
  out.ticketEventId = await hostEvent(email, `QA ${lane} билеты`, { kind: 'external', amount: 25, currency: 'EUR', ticketUrl: 'https://example.org/tickets' });
  // An online event by application (approval opens the join link) and one cancelled event (the cancelled page).
  out.appEventId = await hostEvent(email, `QA ${lane} по заявке`, { kind: 'free' }, {
    format: 'online', placeId: null, area: null, exactAddress: null, joinUrl: 'https://meet.example.org/qa', tz: 'Europe/Berlin',
    requiresApplication: true, questions: ['Был ли опыт таких встреч?'] });
  out.cancelledEventId = await cancelledEvent(email, `QA ${lane} отменена`);
  return out;
}

/** One cancelled event of the host (made, approved and cancelled once; later runs reuse it). */
async function cancelledEvent(email, title) {
  const ev = (await api(email, 'event.mine', {})).organizing ?? [];
  const done = ev.find(x => x.title === title && x.state === 'cancelled');
  if (done) return done.id;
  const id = await hostEvent(email, title, { kind: 'free' });
  must(await api(email, 'event.cancel', { opId: uuid7(), eventId: id, reason: 'Ведущий заболел' }), 'event.cancel');
  return id;
}

async function hostEvent(email, title, price, extra = {}) {
  const ev = (await api(email, 'event.mine', {})).organizing ?? [];
  let e = ev.find(x => x.title === title && ['published', 'in_review'].includes(x.state) && (!x.startsAt || Date.parse(x.startsAt) > Date.now() + 7 * 864e5));
  if (!e) {
    const places = (await api(email, 'catalog.get', {})).places ?? [];
    const start = new Date(Date.now() + 60 * 864e5); start.setUTCHours(17, 0, 0, 0);
    const r = must(await api(email, 'event.submit', { opId: uuid7(), event: {
      title, kind: 'meetup', description: 'Открытая встреча для сценариев: отметки «иду», адрес, сохранение.', format: 'offline',
      placeId: places[0]?.id ?? null, area: 'Митте', exactAddress: 'Тестовая улица 1, вход со двора', tz: 'Europe/Berlin',
      startsAt: start.toISOString(), endsAt: new Date(+start + 2 * 3600e3).toISOString(), price, plate: 'sea', ...extra } }), 'event.submit');
    e = { id: r.id };
  }
  const got = (await api(email, 'event.get', { eventId: e.id })).event;
  if (got.state !== 'published' || got.pendingChange) {
    await staff();
    must(await api(STAFF, 'staff.eventDecide', { opId: uuid7(), eventId: e.id, rev: got.rev, decision: 'approve' }), 'staff.eventDecide');
  }
  return e.id;
}

/** The staff account exists, holds a role (granted once, out of band) and has its second factor with a code from the
 * last few minutes in this sign-in — so the browser page, which shares the session, opens the staff area directly. */
export async function staff() {
  await registered(STAFF, 'qa_mod1', 'off');
  const me = await staffFactor(STAFF, { fresh: true });
  if (!me.roles?.length) throw new Error('qa-staff has no staff role — grant it once (feture.staff_role)');
  return STAFF;
}

const built = new Map(); // one build per process and kind; later calls in the same run reuse it
export async function persona(lane, kind) {
  if (!/^[a-z0-9]{1,8}$/.test(lane)) throw new Error('lane: 1–8 lowercase letters/digits');
  const key = lane + ':' + kind;
  // staff: built every time, so a scenario starts with a fresh code (dangerous actions want one from the last 10 min).
  if (!['new', 'temp', 'owner', 'staff'].includes(kind) && built.has(key)) return built.get(key);
  const p = await build(lane, kind);
  if (!['new', 'temp', 'owner'].includes(kind)) built.set(key, p);
  return p;
}

async function build(lane, kind) {
  if (kind === 'new') {
    const email = mail(lane, 'new-' + Date.now().toString(36)); await session(email); return { email, kind };
  }
  if (kind === 'staff') { await staff(); const s = await session(STAFF); return { email: STAFF, handle: 'qa_mod1', kind, personId: s.personId }; }
  if (kind === 'staff2') {
    // Holds the moderator role (granted out of band like STAFF's); scenarios reset its factor and enrol on the screen.
    await registered(STAFF2, 'qa_mod2', 'off');
    const me = await api(STAFF2, 'staff.me');
    if (!me.roles?.length) throw new Error('qa-staff2 has no staff role — grant «moderator» once (feture.staff_role)');
    return { email: STAFF2, handle: 'qa_mod2', kind, personId: (await session(STAFF2)).personId };
  }
  if (kind === 'temp' || kind === 'owner') {
    const ts = Date.now().toString(36);
    const email = mail(lane, 'tmp-' + ts), handle = handleOf(lane, 't' + ts);
    await registered(email, handle, 'off');
    if (kind === 'owner') await privatePart(email);
    return { email, handle, kind, personId: (await session(email)).personId };
  }
  if (kind === 'pair') {
    const a = await persona(lane, 'pa'), b = await persona(lane, 'pb');
    let ba = await boot(a.email);
    if (!ba.profiles?.some(p => p.kind === 'couple' && p.state === 'active')) {
      const inv = must(await api(a.email, 'couple.invite', { opId: uuid7(), handle: b.handle, replacePaused: true }), 'couple.invite');
      must(await api(b.email, 'couple.inviteAnswer', { opId: uuid7(), inviteId: inv.id, accept: true }), 'inviteAnswer');
      ba = await boot(a.email);
    }
    const s = await session(a.email);
    return { ...a, kind: 'pair', partner: b, coupleId: s.coupleId };
  }
  if (!FULL.has(kind) && !BASIC.has(kind)) throw new Error('unknown persona kind: ' + kind + ' (known: ' + KINDS.join(', ') + ')');
  const full = FULL.has(kind);
  const email = mail(lane, kind), handle = handleOf(lane, kind);
  await registered(email, handle, full ? 'visible' : 'off');
  const s = await session(email);
  if (full) { await approvePhoto(email, s); await verifyAge(email); await interests(email); await privatePart(email); }
  const p = { email, handle, kind, personId: s.personId };
  if (kind === 'host') Object.assign(p, await hostSetup(lane, email));
  if (kind === 'chats') {
    p.with = {};
    for (const other of ['mate', 'asker', 'basic']) {
      const o = await persona(lane, other);
      p.with[other] = { ...o, conversationId: await conversation(p, o) };
    }
  }
  return p;
}

// CLI: node e2e/personas.mjs <lane> <kind>  — builds it and prints it (for agents preparing a run).
if (import.meta.url === `file://${process.argv[1]}`) {
  const [lane, kind] = process.argv.slice(2);
  persona(lane, kind).then(p => console.log(JSON.stringify(p, null, 1)), e => { console.error(e.message); process.exit(1); });
}
void post;
