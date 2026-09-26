/* Product configuration for generic server code.
   The product registers its config/product.json once at startup (see the product's
   lib/product.js); Core never reads product files by path. */
let product = null;
let identity = null;

function configureProduct(config){
  if(!config || typeof config !== 'object') throw new Error('product_config_required');
  product = config;
  identity = Object.freeze({
    id: String(config.id || ''),
    name: String(config.name || ''),
    slug: String(config.slug || '')
  });
  return identity;
}

function productConfig(){
  if(!product) throw new Error('product_not_configured');
  return product;
}

function productIdentity(){
  productConfig();
  return identity;
}

module.exports = { configureProduct, productConfig, productIdentity };
