type PermissionState = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';

interface LocalPermissionResult {
  display?: PermissionState;
}

interface PushPermissionResult {
  receive?: PermissionState;
}

interface LocalNotificationPlugin {
  checkPermissions(): Promise<LocalPermissionResult>;
  requestPermissions(): Promise<LocalPermissionResult>;
  checkExactNotificationSetting?(): Promise<{exact_alarm?: PermissionState}>;
  getPending(): Promise<{notifications?: Array<{id:number}>}>;
  cancel(input: {notifications:Array<{id:number}>}): Promise<unknown>;
  schedule(input: {notifications:Array<Record<string, unknown>>}): Promise<unknown>;
  removeDeliveredNotificationsById?(input: {ids:number[]}): Promise<unknown>;
}

interface PushPlugin {
  checkPermissions(): Promise<PushPermissionResult>;
  requestPermissions(): Promise<PushPermissionResult>;
  register(): Promise<unknown>;
}

export interface TransportOptions {
  native: boolean;
  local?: LocalNotificationPlugin | null;
  push?: PushPlugin | null;
  platform?: () => string;
}

export interface NotificationTransport {
  hasLocal(): boolean;
  localPermission(requestIfNeeded?: boolean): Promise<boolean>;
  exactAllowed(): Promise<boolean>;
  cancel(ids: readonly number[]): Promise<boolean>;
  removeDelivered(ids: readonly number[]): Promise<boolean>;
  schedule(notifications: readonly Record<string, unknown>[]): Promise<boolean>;
  replaceRange(
    minId: number,
    maxId: number,
    notifications: readonly Record<string, unknown>[]
  ): Promise<boolean>;
  registerPush(requestIfNeeded?: boolean): Promise<boolean>;
}

export function createTransport(options: TransportOptions): NotificationTransport {
  const local = options.local || null;
  const push = options.push || null;

  const validIds = (ids: readonly number[]) =>
    ids.map(Number).filter(id => Number.isInteger(id) && id > 0);

  return {
    hasLocal(){ return !!(options.native && local); },

    async localPermission(requestIfNeeded = false){
      if(!options.native || !local) return false;
      try{
        let current = await local.checkPermissions();
        if(current.display === 'prompt' && requestIfNeeded){
          current = await local.requestPermissions();
        }
        return current.display === 'granted';
      }catch(_){
        return false;
      }
    },

    async exactAllowed(){
      if(!options.native || !local) return false;
      try{
        if(options.platform?.() !== 'android' || !local.checkExactNotificationSetting) return true;
        const setting = await local.checkExactNotificationSetting();
        return setting.exact_alarm === 'granted';
      }catch(_){
        return false;
      }
    },

    async cancel(ids){
      if(!options.native || !local) return false;
      const clean = validIds(ids);
      if(!clean.length) return true;
      try{
        await local.cancel({notifications:clean.map(id => ({id}))});
        return true;
      }catch(_){
        return false;
      }
    },

    async removeDelivered(ids){
      if(!options.native || !local || !local.removeDeliveredNotificationsById) return false;
      const clean = validIds(ids);
      if(!clean.length) return true;
      try{
        await local.removeDeliveredNotificationsById({ids:clean});
        return true;
      }catch(_){
        return false;
      }
    },

    async schedule(notifications){
      if(!options.native || !local) return false;
      const list = [...notifications];
      if(!list.length) return true;
      try{
        await local.schedule({notifications:list});
        return true;
      }catch(_){
        return false;
      }
    },

    async replaceRange(minId, maxId, notifications){
      if(!options.native || !local) return false;
      try{
        const pending = await local.getPending();
        const old = (pending.notifications || [])
          .map(item => Number(item.id))
          .filter(id => Number.isInteger(id) && id >= minId && id <= maxId);
        if(old.length) await local.cancel({notifications:old.map(id => ({id}))});
        const list = [...notifications];
        if(list.length) await local.schedule({notifications:list});
        return true;
      }catch(_){
        return false;
      }
    },

    async registerPush(requestIfNeeded = false){
      if(!options.native || !push) return false;
      try{
        let current = await push.checkPermissions();
        if(current.receive === 'prompt' && requestIfNeeded){
          current = await push.requestPermissions();
        }
        if(current.receive !== 'granted') return false;
        await push.register();
        return true;
      }catch(_){
        return false;
      }
    }
  };
}
