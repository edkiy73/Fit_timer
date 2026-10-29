// @ts-check
/** Where messages from people who cannot sign in go (the public help form, `POST /api/fe?help=1`). One place for the
 * address: `FETURE_SUPPORT_EMAIL` in Vercel wins, otherwise the owner's mailbox below.
 * BEFORE LAUNCH: replace this address with the working support mailbox (docs/infra/security-keys.md). */
export const SUPPORT_EMAIL_DEFAULT = 'edkiy73@gmail.com';

/** @param {Record<string, string | undefined>} [env] */
export const supportEmail = (env = process.env) => String(env.FETURE_SUPPORT_EMAIL || SUPPORT_EMAIL_DEFAULT).trim();
