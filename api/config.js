const { send, cors } = require('../lib/util');
const { getSettings } = require('../lib/ai');

module.exports = async (req, res) => {
  if(cors(req, res)) return;
  if(req.method !== 'GET') { res.statusCode = 405; return res.end(); }
  const s = await getSettings();
  send(res, 200, {ai:{enabled:s.enabled}, prices:s.prices, payment:s.payment});
};
