/* POST /api/auth — account/auth. Pass a product account extension when needed. */
require('../lib/product');
const { createAuthHandler } = require('../../server/auth-core');
const analytics = require('../lib/app-analytics');

module.exports = createAuthHandler({analytics});
