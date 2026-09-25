/* Server side of AppBase capability switches (config/product.json → features).
   Same rule as the client: missing or non-true switches are off. */
const CAPABILITY_NAMES = Object.freeze([
  'profiles',
  'premium',
  'ai',
  'notifications',
  'biometrics',
  'sharing',
  'voice'
]);

function createCapabilities(input){
  const source = input && typeof input === 'object' ? input : {};
  const flags = Object.freeze(Object.fromEntries(
    CAPABILITY_NAMES.map(name => [name, source[name] === true])
  ));
  return Object.freeze({
    enabled: name => flags[name] === true,
    flags: () => flags
  });
}

let productCapabilities = null;
function capabilities(){
  if(!productCapabilities){
    const product = require('../config/product.json');
    productCapabilities = createCapabilities(product.features);
  }
  return productCapabilities;
}

module.exports = { CAPABILITY_NAMES, createCapabilities, capabilities };
