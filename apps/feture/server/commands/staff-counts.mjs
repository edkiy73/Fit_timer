// @ts-check
import { staffCountsCommands } from '../../contracts/staff.mjs';
import { communities } from './communities.mjs';
import { dsa } from './dsa.mjs';
import { events } from './events.mjs';
import { moderation } from './moderation.mjs';
import { premium } from './premium.mjs';
import { staff } from './staff.mjs';
import { support } from './support.mjs';
import { verification } from './verification.mjs';

/** How much waits for the signed-in staff member (audit 30.10: nothing told a moderator that something came). It asks
 * each queue the person may open for one row and reads the size the queue itself reports, so the badge and the list
 * always agree and every role sees only its own queues. A queue the person may not open (or that fails) is left out.
 * @typedef {import('../handler.mjs').Command} Command */
const QUEUES = /** @type {const} */ ([
  ['dispute', moderation, 'staff.disputeQueue'], ['report', moderation, 'staff.reportQueue'], ['revision', moderation, 'staff.revisionQueue'],
  ['media', staff, 'staff.mediaQueue'], ['community', communities, 'staff.communityQueue'], ['event', events, 'staff.eventQueue'],
  ['age', premium, 'staff.ageCheckQueue'], ['photo', verification, 'staff.photoCheckQueue'], ['appeal', moderation, 'staff.appealQueue'],
  ['notice', dsa, 'staff.noticeQueue'], ['place', moderation, 'staff.placeQueue'],
]);

/** @type {Record<string, Command['run']>} */
const run = {
  async 'staff.counts'(q, ctx) {
    /** @type {Record<string, number>} */
    const queues = {};
    for (const [id, handlers, action] of QUEUES) {
      try {
        const r = await /** @type {any} */ (handlers)[action].run(q, { ...ctx, input: { limit: 1, order: 'old' } });
        queues[id] = Number(r.total ?? r.items?.length ?? 0);
      } catch { /* not this person's queue */ }
    }
    let supportOpen = 0;
    try { supportOpen = Number((await /** @type {any} */ (support)['staff.supportQueue'].run(q, { ...ctx, input: { limit: 1, state: 'open' } })).total ?? 0); } catch { /* no support role */ }
    const queued = Object.values(queues).reduce((a, b) => a + b, 0);
    return { queues, support: supportOpen, total: queued + supportOpen };
  },
};

export const staffCounts = Object.fromEntries(
  Object.entries(staffCountsCommands).map(([action, def]) => [action, { ...def, run: run[action] }]));
