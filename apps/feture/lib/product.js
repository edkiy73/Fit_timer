const { configureProduct } = require('../../../packages/core/server/product-core');
const product = require('../config/product.json');
configureProduct(product);
module.exports = { product };
