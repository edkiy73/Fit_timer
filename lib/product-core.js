/* Product identity for generic server code (config/product.json).
   Generic modules use this instead of hard-coding a product name or bundle id. */
let cached = null;

function productIdentity(){
  if(!cached){
    const product = require('../config/product.json');
    cached = Object.freeze({
      id: String(product.id || ''),
      name: String(product.name || ''),
      slug: String(product.slug || '')
    });
  }
  return cached;
}

module.exports = { productIdentity };
