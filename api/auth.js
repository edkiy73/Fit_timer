/* POST /api/auth — FitTimer composition of the generic AppBase account handler.
   Trainer page, trainer edit key and trainer→client links come from the FitTimer
   account extension; analytics uses the FitTimer event taxonomy. */
const { createAuthHandler } = require('../lib/auth-core');
const accountExtension = require('../lib/fit-account-extension');
const analytics = require('../lib/analytics');

module.exports = createAuthHandler({accountExtension, analytics});
