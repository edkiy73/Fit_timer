import assert from 'node:assert/strict';
import {createRemotePushClient} from '../dist/core/remote-push.js';

function plugin(initial='prompt'){
  let permission=initial;
  const listeners=new Map();
  let registered=0;
  return {
    api:{
      async checkPermissions(){return {receive:permission};},
      async requestPermissions(){permission='granted';return {receive:permission};},
      async register(){registered++;},
      addListener(name,listener){
        listeners.set(name,listener);
        return {remove(){listeners.delete(name);}};
      }
    },
    emit(name,value){listeners.get(name)?.(value);},
    get registered(){return registered;}
  };
}

function auth(){
  return {
    async authFields(){
      return {email:'a@example.com',deviceId:'dev-1',syncToken:'sync-1'};
    }
  };
}

const calls=[];
const fakeFetch=async (_url,init)=>{
  calls.push(JSON.parse(String(init.body||'{}')));
  return {ok:true};
};

{
  const p=plugin('prompt');
  const client=createRemotePushClient({
    auth:auth(),plugin:p.api,native:true,platform:()=> 'android',fetch:fakeFetch
  });
  assert.equal(await client.sync(false),false);
  assert.equal(p.registered,0);
  assert.equal(await client.sync(true),true);
  assert.equal(p.registered,1);
}

{
  calls.length=0;
  const p=plugin('granted');
  const actions=[];
  const client=createRemotePushClient({
    auth:auth(),
    plugin:p.api,
    native:true,
    platform:()=> 'android',
    locale:()=> 'en',
    fetch:fakeFetch,
    onAction:data=>actions.push(data)
  });
  client.start();
  p.emit('registration',{value:'token-12345678901234567890'});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(calls[0],{
    action:'push_device',
    token:'token-12345678901234567890',
    platform:'android',
    enabled:true,
    locale:'en',
    email:'a@example.com',
    deviceId:'dev-1',
    syncToken:'sync-1'
  });

  p.emit('pushNotificationActionPerformed',{
    notification:{data:{route:'/review',stage:'review'}}
  });
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(actions,[{route:'/review',stage:'review'}]);
  assert.equal(calls[1].action,'notification_event');
  assert.equal(calls[1].event,'open');
  assert.equal(calls[1].stage,'review');

  assert.equal(await client.unregister(),true);
  assert.equal(calls[2].action,'push_device');
  assert.equal(calls[2].enabled,false);
  client.stop();
}

{
  calls.length=0;
  const p=plugin('granted');
  const client=createRemotePushClient({
    auth:{async authFields(){return null;}},
    plugin:p.api,
    native:true,
    platform:()=> 'android',
    fetch:fakeFetch
  });
  client.start();
  p.emit('registration',{value:'token-12345678901234567890'});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(calls.length,0);
}

console.log('remote push client: ok');
