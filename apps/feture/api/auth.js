require('../lib/product');
const { createAuthHandler } = require('../../../packages/core/server/auth-core');
const { cors, fail, readBody } = require('../../../packages/core/server/util');
const analytics = require('../lib/app-analytics');
const {safeFetureDiagnostic}=require('../lib/feture/diagnostic-policy');
const core = createAuthHandler({analytics,sanitizeClientDiagnostic:safeFetureDiagnostic,emailChange:true});

// The sign-in second step (optional factor, server/core-guard.mjs): Core's actions that act with a session — the
// sessions list, signing out elsewhere, email change, deletion, nickname — wait until the sign-in passed it. Sign-in,
// sign-out and status stay open. The body is read once here and handed to Core already parsed.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return core(req, res);
  let body;
  try { body = await readBody(req); } catch { cors(req, res); return fail(res, 413, 'too_large'); }
  req.body = body; req.rawBody = undefined;
  const { GUARDED_AUTH, guardCoreBody } = await import('../server/core-guard.mjs');
  if (body && GUARDED_AUTH.has(body.action)) {
    const refusal = await guardCoreBody(req, body);
    if (refusal) { if (cors(req, res)) return; return fail(res, refusal.status, refusal.error, refusal.rule ? { rule: refusal.rule } : {}); }
  }
  return core(req, res);
};
