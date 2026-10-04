import type { AuthClient } from './auth';

type PermissionState='prompt'|'prompt-with-rationale'|'granted'|'denied';

export interface RemotePushToken {
  value?:string;
}

export interface RemotePushActionEvent {
  notification?:{
    data?:Record<string,unknown>;
    extra?:Record<string,unknown>;
  };
}

export interface RemotePushListenerHandle {
  remove():Promise<void>|void;
}

export interface RemotePushPlugin {
  checkPermissions():Promise<{receive?:PermissionState}>;
  requestPermissions():Promise<{receive?:PermissionState}>;
  register():Promise<unknown>;
  addListener(
    name:'registration',
    listener:(token:RemotePushToken)=>void
  ):Promise<RemotePushListenerHandle>|RemotePushListenerHandle;
  addListener(
    name:'registrationError',
    listener:(error:unknown)=>void
  ):Promise<RemotePushListenerHandle>|RemotePushListenerHandle;
  addListener(
    name:'pushNotificationActionPerformed',
    listener:(event:RemotePushActionEvent)=>void
  ):Promise<RemotePushListenerHandle>|RemotePushListenerHandle;
}

export interface RemotePushClientOptions {
  auth:Pick<AuthClient,'authFields'>;
  plugin:RemotePushPlugin|null;
  native:boolean;
  platform:()=>string;
  endpoint?:string;
  locale?:()=>string;
  fetch?:typeof fetch;
  onAction?:(data:Record<string,unknown>)=>void;
  onRegistrationError?:(error:unknown)=>void;
}

export interface RemotePushClient {
  start():void;
  stop():void;
  sync(requestPermission?:boolean):Promise<boolean>;
  unregister():Promise<boolean>;
  recordOpen(stage:string):Promise<boolean>;
}

function normalizedPlatform(value:string):'android'|'ios'|''{
  if(value==='android')return 'android';
  if(value==='ios')return 'ios';
  return '';
}

function stageOf(data:Record<string,unknown>):string{
  return String(data.stage??data.kind??'unknown')
    .replace(/[^a-z0-9_-]/gi,'')
    .slice(0,50)||'unknown';
}

export function createRemotePushClient(options:RemotePushClientOptions):RemotePushClient{
  const endpoint=options.endpoint||'/api/auth';
  const fetchImpl=options.fetch||(
    typeof globalThis.fetch==='function'
      ? (input:RequestInfo|URL,init?:RequestInit)=>globalThis.fetch(input,init)
      : undefined
  );

  let started=false;
  let alive=true;
  let registration:RemotePushListenerHandle|null=null;
  let registrationError:RemotePushListenerHandle|null=null;
  let action:RemotePushListenerHandle|null=null;

  async function post(body:Record<string,unknown>):Promise<boolean>{
    if(typeof fetchImpl!=='function')return false;
    try{
      const response=await fetchImpl(endpoint,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body)
      });
      return response.ok;
    }catch{
      return false;
    }
  }

  async function authenticatedBody(extra:Record<string,unknown>):Promise<Record<string,unknown>|null>{
    const fields=await options.auth.authFields();
    if(!fields)return null;
    return {...extra,...fields};
  }

  async function registerToken(token:string):Promise<boolean>{
    const platform=normalizedPlatform(options.platform());
    const clean=String(token||'').trim().slice(0,4096);
    if(!platform||clean.length<16)return false;
    const body=await authenticatedBody({
      action:'push_device',
      token:clean,
      platform,
      enabled:true,
      locale:options.locale?.()==='en'?'en':'ru'
    });
    return body?post(body):false;
  }

  async function attach(
    name:'registration'|'registrationError'|'pushNotificationActionPerformed',
    listener:(value:unknown)=>void
  ):Promise<RemotePushListenerHandle|null>{
    if(!options.plugin)return null;
    try{
      return await Promise.resolve(
        (options.plugin.addListener as (
          event:string,
          handler:(value:unknown)=>void
        )=>Promise<RemotePushListenerHandle>|RemotePushListenerHandle)(name,listener)
      );
    }catch{
      return null;
    }
  }

  function start(){
    if(started||!options.native||!options.plugin)return;
    started=true;
    alive=true;

    void attach('registration',value=>{
      if(!alive)return;
      const token=value as RemotePushToken;
      void registerToken(String(token?.value||''));
    }).then(handle=>{if(alive)registration=handle;else void handle?.remove();});

    void attach('registrationError',error=>{
      if(alive)options.onRegistrationError?.(error);
    }).then(handle=>{if(alive)registrationError=handle;else void handle?.remove();});

    void attach('pushNotificationActionPerformed',value=>{
      if(!alive)return;
      const event=value as RemotePushActionEvent;
      const notification=event?.notification;
      const data=(notification?.data??notification?.extra??{}) as Record<string,unknown>;
      void client.recordOpen(stageOf(data));
      options.onAction?.(data);
    }).then(handle=>{if(alive)action=handle;else void handle?.remove();});
  }

  function stop(){
    alive=false;
    started=false;
    for(const handle of [registration,registrationError,action]){
      try{void handle?.remove();}catch{}
    }
    registration=registrationError=action=null;
  }

  const client:RemotePushClient={
    start,
    stop,

    async sync(requestPermission=false){
      if(!options.native||!options.plugin)return false;
      start();
      try{
        let permission=await options.plugin.checkPermissions();
        if(permission.receive==='prompt'&&requestPermission){
          permission=await options.plugin.requestPermissions();
        }
        if(permission.receive!=='granted')return false;
        await options.plugin.register();
        return true;
      }catch{
        return false;
      }
    },

    async unregister(){
      const body=await authenticatedBody({action:'push_device',enabled:false});
      return body?post(body):false;
    },

    async recordOpen(stage){
      const body=await authenticatedBody({
        action:'notification_event',
        event:'open',
        stage:String(stage||'unknown').replace(/[^a-z0-9_-]/gi,'').slice(0,50)||'unknown'
      });
      return body?post(body):false;
    }
  };

  return client;
}
