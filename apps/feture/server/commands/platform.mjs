// @ts-check
import { platformCommands } from '../../contracts/platform.mjs';
import { cancelApproval, decideApproval, listApprovals } from '../approvals.mjs';
import { avatarSrc, commitUpload, removeAsset, uploadIntent } from '../media/assets.mjs';
import { myProfiles } from '../profiles.mjs';

/** @typedef {import('../handler.mjs').Command} Command */

/** @type {Record<keyof typeof platformCommands, Command['run']>} */
const run = {
  'session.bootstrap': async (q, { account, cfg, channels }) => {
    const rows = await myProfiles(q, account.id);
    // Realtime (S2 §8): the public socket address and, per profile, the opaque channel only its members get.
    const topics = cfg.realtime ? await channels(q, rows.map(p => p.id)) : {};
    return {
      account: { id: account.id, locale: account.locale, onboarded: !!account.person_profile_id },
      profiles: await cardsWithAvatars(q, cfg, rows),
      realtime: cfg.realtime && Object.keys(topics).length ? { url: cfg.realtime.url, key: cfg.realtime.key, channels: topics } : null,
    };
  },
  'profile.mine': async (q, { account, cfg }) => ({ profiles: await cardsWithAvatars(q, cfg, await myProfiles(q, account.id)) }),
  'media.uploadIntent': (q, { acting, cfg, input }) => uploadIntent(q, need(acting), cfg.media, input),
  'media.commit': (q, { acting, cfg, input }) => commitUpload(q, need(acting), cfg.media, input.assetId),
  'media.remove': (q, { acting, input }) => removeAsset(q, need(acting), input.assetId),
  'decide.approvals': async (q, { acting }) => ({ items: await listApprovals(q, need(acting)) }),
  'decide.approval': (q, { acting, input }) => decideApproval(q, need(acting), input),
  'decide.cancel': (q, { acting, input }) => cancelApproval(q, need(acting), input.approvalId),
};

/** @type {Record<string, Command>} */
export const platform = Object.fromEntries(
  Object.entries(platformCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));

/** Own profiles with their photo (the owner sees it while it is still being checked). @param {any} q @param {any} cfg @param {any[]} rows */
async function cardsWithAvatars(q, cfg, rows) {
  const out = [];
  for (const p of rows) out.push({ ...profileCard(p), avatar: await avatarSrc(q, cfg.media, p.avatar_asset_id, p.id) });
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
