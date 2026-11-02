// Solo testing helper: the test moderator (qa-staff) approves everything that is waiting in the review queues —
// photos/media, age checks and photo checks — so one tester can walk through the whole flow with their own account.
// A moderator never sees their own items (by design), so the owner's own avatar needs a second reviewer: this one.
//   FE_ADMIN_KEY=… FE_API=https://app.kinhaze.com node e2e/approve-pending.mjs [--explicit]
// Test world only: it approves WITHOUT looking. Never run it where real people's photos wait for review.
import { api, uuid7, sleep } from './lib.mjs';
import { STAFF, staff } from './personas.mjs';

if (!process.env.FE_ADMIN_KEY) { console.error('FE_ADMIN_KEY is required'); process.exit(1); }
const explicit = process.argv.includes('--explicit');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** Approving removes an item from its queue, so the first page is read again until nothing is left (or nothing moves). */
async function drain(queue, decide, what) {
  let done = 0;
  for (let round = 0; round < 40; round++) {
    const r = await api(STAFF, queue, { limit: 50 });
    if (r.status >= 400) { log('  ✗', queue, r.status, r.error ?? ''); break; }
    const items = r.items ?? [];
    if (!items.length) break;
    let moved = 0;
    for (const it of items) {
      const d = await decide(it);
      if (d?.status >= 400) log('  ✗', what, it.id, d.status, d.error ?? '', d.rule ?? ''); else { done++; moved++; }
    }
    if (!moved) break;
  }
  log(`${what}: approved ${done}`);
}

await staff();
await drain('staff.mediaQueue', it => api(STAFF, 'staff.mediaDecide', { opId: uuid7(), assetId: it.id, decision: 'approve', explicit }), 'media');
await drain('staff.ageCheckQueue', async it => { for (let i = 0; i < 20; i++) { const d = await api(STAFF, 'staff.ageCheckDecide', { opId: uuid7(), checkId: it.id, approve: true }); if (!/_missing/.test(d.rule ?? '')) return d; await sleep(6000); } }, 'age checks');
await drain('staff.photoCheckQueue', it => api(STAFF, 'staff.photoCheckDecide', { opId: uuid7(), checkId: it.id, approve: true }), 'photo checks');
