// @ts-check
import { platformCommands } from '../../contracts/platform.mjs';
import { cancelApproval, decideApproval, getApproval, listApprovals } from '../approvals.mjs';
import { avatarSrc, commitUpload, removeAsset, uploadIntent } from '../media/assets.mjs';
import { myProfiles, requireUnrestricted, restrictionOf } from '../profiles.mjs';

/** @typedef {import('../handler.mjs').Command} Command */

/** @type {Record<keyof typeof platformCommands, Command['run']>} */
const run = {
  'session.bootstrap': async (q, { account, cfg, channels }) => {
    // to_jsonb: the A05 mark comes with a later migration; stage-0 schemas simply have none.
    const [mark] = await q.query(`select to_jsonb(a) ? 'onboarded_at' has, to_jsonb(a) ->> 'onboarded_at' stamp from feture.account a where a.id = $1`, [account.id]);
    const rows = await myProfiles(q, account.id);
    // Realtime (S2 §8): the SSE stream's origin and, per profile, the opaque channel only its members get.
    const topics = cfg.realtime ? await channels(q, rows.map(p => p.id)) : {};
    return {
      // Registered = A04 made the profile AND A05 was finished or skipped (onboarding.complete); a reload on A05 returns to A05.
      account: { id: account.id, locale: account.locale, onboarded: !!account.person_profile_id && (!mark?.has || mark.stamp != null) },
      profiles: await cardsWithAvatars(q, cfg, rows),
      realtime: cfg.realtime && Object.keys(topics).length
        ? { url: cfg.realtime.url, key: cfg.realtime.key, ...(cfg.realtime.transport ? { transport: cfg.realtime.transport } : {}), channels: topics } : null,
      // Web push: only the public VAPID key (null while the server has no keys: the client offers nothing).
      push: cfg.push?.webKey ? { webKey: cfg.push.webKey } : null,
      // A restriction in force on the person (it covers their couples too): what it limits and until when, for the
      // notice on «Лента» and «Я» (audit item 6).
      restriction: await restrictionOf(q, account.person_profile_id ?? null),
    };
  },
  'profile.mine': async (q, { account, cfg }) => ({ profiles: await cardsWithAvatars(q, cfg, await myProfiles(q, account.id)) }),
  'media.uploadIntent': async (q, { acting, cfg, input }) => {
    await requireUnrestricted(q, need(acting), 'uploads');
    return uploadIntent(q, need(acting), cfg.media, input);
  },
  'media.commit': (q, { acting, cfg, input }) => commitUpload(q, need(acting), cfg.media, input.assetId),
  'media.remove': (q, { acting, input }) => removeAsset(q, need(acting), input.assetId),
  'decide.approvals': async (q, { acting }) => ({ items: await listApprovals(q, need(acting)) }),
  'decide.approval': (q, { acting, input }) => decideApproval(q, need(acting), input),
  'decide.cancel': (q, { acting, input }) => cancelApproval(q, need(acting), input.approvalId),
  'approval.get': async (q, { account, input }) => ({ approval: await getApproval(q, account.id, input.id) }),
};

/** @type {Record<string, Command>} */
export const platform = Object.fromEntries(
  Object.entries(platformCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));

/** Own profiles with their photo (the owner sees it while it is still being checked). @param {any} q @param {any} cfg @param {any[]} rows */
async function cardsWithAvatars(q, cfg, rows) {
  const out = [];
  for (const p of rows) {
    /** @type {Record<string, unknown>} */
    const card = { ...profileCard(p), avatar: await avatarSrc(q, cfg.media, p.avatar_asset_id, p.id) };
    // A couple without its own photo is drawn as two halves, each partner's photo or initial (owner 05.11.2026).
    if (p.kind === 'couple') {
      const ms = await q.query(
        `select coalesce(nullif(pp.name, ''), pp.handle) "name", pp.avatar_asset_id
         from feture.profile_member m join feture.account a on a.id = m.account_id
         join feture.profile pp on pp.id = a.person_profile_id
         where m.profile_id = $1 and m.state = 'active' order by m.joined_at nulls last`, [p.id]);
      card.halves = await Promise.all(ms.map(async (/** @type {any} */ m) => ({ name: m.name, avatar: await avatarSrc(q, cfg.media, m.avatar_asset_id, p.id) })));
    }
    out.push(card);
  }
  return out;
}

/** @param {any} p */
function profileCard(p) {
  return { id: p.id, kind: p.kind, handle: p.handle, name: p.name, state: p.state, avatarAssetId: p.avatar_asset_id };
}

/** @template T @param {T | null} acting @returns {T} */
function need(acting) {
  if (!acting) throw new Error('acting profile missing for a profile command');
  return acting;
}
