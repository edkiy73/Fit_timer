// @ts-check
import { platformCommands } from '../../contracts/platform.mjs';
import { cancelApproval, decideApproval, listApprovals } from '../approvals.mjs';
import { commitUpload, removeAsset, uploadIntent } from '../media/assets.mjs';
import { myProfiles } from '../profiles.mjs';

/** @typedef {import('../handler.mjs').Command} Command */

/** @type {Record<keyof typeof platformCommands, Command['run']>} */
const run = {
  'session.bootstrap': async (q, { account }) => ({
    account: { id: account.id, locale: account.locale, onboarded: !!account.person_profile_id },
    profiles: (await myProfiles(q, account.id)).map(profileCard),
  }),
  'profile.mine': async (q, { account }) => ({ profiles: (await myProfiles(q, account.id)).map(profileCard) }),
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

/** @param {any} p */
function profileCard(p) {
  return { id: p.id, kind: p.kind, handle: p.handle, name: p.name, state: p.state, avatarAssetId: p.avatar_asset_id };
}

/** @template T @param {T | null} acting @returns {T} */
function need(acting) {
  if (!acting) throw new Error('acting profile missing for a profile command');
  return acting;
}
