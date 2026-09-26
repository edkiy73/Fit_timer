'use strict';
/* Product AI actions: id, quota bucket (heavy/light/image) and optional validation. */
const { createAIActionRegistry } = require('../../server/ai-action-registry');

module.exports = { registry: createAIActionRegistry([]) };
