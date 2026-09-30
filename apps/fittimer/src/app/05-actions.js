export const ACTIONS = Object.create(null);

export function registerAction(name, handler){
  if(!name || typeof handler !== 'function') return false;
  ACTIONS[name] = handler;
  return true;
}

export function unregisterAction(name){
  if(!name || !Object.prototype.hasOwnProperty.call(ACTIONS, name)) return false;
  delete ACTIONS[name];
  return true;
}


export function initActions(){}
