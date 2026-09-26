/* FitTimer product registration for AppBase server Core.
   Every API entry point requires this module first. */
const { configureProduct } = require('../../../packages/core/server/product-core');
const product = require('../config/product.json');

configureProduct(product);

module.exports = { product };
