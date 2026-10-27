// FetUre e2e personas (owner, 28.10.2026): every scenario runs as a known account state, and every lane (an agent, an
// area) has its own accounts, so runners never share sessions, daily limits, requests or links.
//   const p = await persona('feed', 'full')   → { email, handle, personId, coupleId? }
// Kinds:
//   new        signed in, no FetUre account yet (registration screens)
//   basic      registered, onboarding done, hidden from Discover, no photo, no interests
//   full       basic + visible in Discover, an approved profile photo, age verified, public interests
//   pair       two `full` people (…-pa, …-pb) in an active couple; returns the first, with `partner` and `coupleId`
// Building is idempotent: a second call only adds what is missing. Staff steps (approving the photo and the age
// check) are done by STAFF, which holds the moderator role on production (granted once by the owner's session).
import { api, boot, post, session, uploadFixture, uuid7 } from './lib.mjs';

export const STAFF = 'qa-staff@feture.test';
const mail = (lane, kind) => `qa-${lane}-${kind}@feture.test`;
const handleOf = (lane, kind) => `qa_${lane}_${kind}`.slice(0, 20);
const must = (r, what) => { if (r.status && r.status >= 400) throw new Error(`${what}: ${r.status} ${JSON.stringify(r).slice(0, 300)}`); return r; };

async function documents() {
  const r = await fetch(`${(await import('./lib.mjs')).PROD}/api/catalog?resource=documents&locale=ru`, { cache: 'no-store' }).then(x => x.json());
  return r.documents.filter(d => d.requiresAccept).map(d => ({ id: d.id, contentHash: d.hash }));
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
    await new Promise(z => setTimeout(z, 3000));
  }
  throw new Error('photo approval for ' + email + ' did not go through');
}

async function verifyAge(email) {
  const st = await api(email, 'verification.ageStatus');
  if (st.verified || st.state === 'approved' || st.ageVerified) return;
  if (st.check?.state === 'submitted') { st.id = st.check.id;
    await staff(); let d;
    for (let i = 0; i < 20; i++) { d = await api(STAFF, 'staff.ageCheckDecide', { opId: uuid7(), checkId: st.id, approve: true }); if (d.rule !== 'selfie_missing') break; await new Promise(z => setTimeout(z, 6000)); }
    must(d, 'ageCheckDecide'); return;
  }
  // The approved photo becomes the avatar through a background job (about a minute); the age check needs it.
  const pid = (await session(email)).personId;
  for (let i = 0; i < 18; i++) { const pr = (await api(email, 'profile.get', { profileId: pid })).profile; if (pr?.avatar) break; await new Promise(z => setTimeout(z, 10000)); }
  const start = await api(email, 'verification.ageStart', { opId: uuid7() });
  must(start, 'ageStart');
  const asset = await uploadFixture(email, 'verification');
  must(await api(email, 'verification.ageSubmit', { opId: uuid7(), checkId: start.id, assetId: asset }), 'ageSubmit');
  await staff();
  // The selfie is scanned first (a job); until then the check has no picture to compare.
  let d;
  for (let i = 0; i < 20; i++) { d = await api(STAFF, 'staff.ageCheckDecide', { opId: uuid7(), checkId: start.id, approve: true }); if (d.rule !== 'selfie_missing') break; await new Promise(z => setTimeout(z, 6000)); }
  must(d, 'ageCheckDecide');
}

async function interests(email) {
  const have = (await api(email, 'interests.list', { profileId: (await session(email)).personId })).items ?? [];
  for (const [topicId, value] of [['aftercare', 8], ['bondage', 6], ['roleplay', 5]]) {
    if (have.some(i => i.topicId === topicId)) continue;
    await api(email, 'interests.set', { opId: uuid7(), topicId, vis: 'public', value, dir: ['give', 'get', 'watch'] });
  }
}

/** The staff account exists and holds a role (the role itself is granted once, out of band). */
export async function staff() {
  await registered(STAFF, 'qa_mod1', 'off');
  const me = await api(STAFF, 'staff.me');
  if (!me.roles?.length && me.status !== 200) throw new Error('qa-staff has no staff role — grant it once (feture.staff_role)');
  return STAFF;
}

export async function persona(lane, kind) {
  if (!/^[a-z0-9]{1,8}$/.test(lane)) throw new Error('lane: 1–8 lowercase letters/digits');
  if (kind === 'new') {
    const email = mail(lane, 'new-' + Date.now().toString(36)); await session(email); return { email, kind };
  }
  if (kind === 'pair') {
    const a = await persona(lane, 'pa'), b = await persona(lane, 'pb');
    let ba = await boot(a.email);
    if (!ba.profiles?.some(p => p.kind === 'couple' && p.state === 'active')) {
      const inv = must(await api(a.email, 'couple.invite', { opId: uuid7(), handle: b.handle }), 'couple.invite');
      must(await api(b.email, 'couple.inviteAnswer', { opId: uuid7(), inviteId: inv.id, accept: true }), 'inviteAnswer');
      ba = await boot(a.email);
    }
    const s = await session(a.email);
    return { ...a, kind: 'pair', partner: b, coupleId: s.coupleId };
  }
  const full = kind === 'full' || kind === 'pa' || kind === 'pb';
  const email = mail(lane, kind), handle = handleOf(lane, kind);
  await registered(email, handle, full ? 'visible' : 'off');
  const s = await session(email);
  if (full) { await approvePhoto(email, s); await verifyAge(email); await interests(email); }
  return { email, handle, kind, personId: s.personId };
}

// CLI: node e2e/personas.mjs <lane> <kind>  — builds it and prints it (for agents preparing a run).
if (import.meta.url === `file://${process.argv[1]}`) {
  const [lane, kind] = process.argv.slice(2);
  persona(lane, kind).then(p => console.log(JSON.stringify(p, null, 1)), e => { console.error(e.message); process.exit(1); });
}
void post;
