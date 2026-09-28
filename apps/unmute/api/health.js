require('../lib/product');
const { collectHealth } = require('../../../packages/core/server/health');

module.exports = async (req, res) => {
  const report = await collectHealth();
  res.statusCode = report.ok ? 200 : 503;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(report));
};
