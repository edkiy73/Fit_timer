require('../lib/product');
const { collectHealth } = require('../../../packages/core/server/health');
const { sameSecret, cors } = require('../../../packages/core/server/util');

/* Outside only «works / does not» (audit M5): which AI and payment providers are connected, env names
   and account counts are details for the owner — with the admin key (Admin → «Состояние»). */
function adminOk(req){
  const expected = process.env.ADMIN_KEY || '';
  if(!expected) return false;
  let given = String(req.headers && req.headers['x-admin-key'] || '');
  try{ given = decodeURIComponent(given); }catch(_){ return false; }
  return !!given && sameSecret(given, expected);
}

module.exports = async (req, res) => {
  if(cors(req, res)) return;
  const report = await collectHealth();
  res.statusCode = report.ok ? 200 : 503;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(adminOk(req) ? report : {ok: report.ok, status: report.status, checkedAt: report.checkedAt}));
};
