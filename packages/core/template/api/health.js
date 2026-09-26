/* GET /api/health — JSON health report. */
require('../lib/product');
const { collectHealth } = require('../../server/health');

module.exports = async (req, res) => {
  const h = await collectHealth();
  res.statusCode = h.ok ? 200 : 503;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(h));
};
