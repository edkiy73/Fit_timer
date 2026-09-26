/* Product registration for AppBase server Core. Every API entry point requires this first. */
const { configureProduct } = require('../../server/product-core');
const product = require('../config/product.json');

configureProduct(product);

module.exports = { product };
